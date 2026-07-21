import crypto from 'crypto';
import fs from 'fs';
import Razorpay from 'razorpay';
import {
  PLAN_PRICES_PAISE,
  getEffectivePlan,
  getIstMonthBounds,
  getPlanAppliesLimit,
  type CreateBillingOrderInput,
  type PaidPlan,
  type VerifyBillingPaymentInput,
} from '@atlas/shared';
import { env } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';
import { ApplicationModel } from '../applications/application.model';
import { UserModel } from '../users/user.model';
import { PaymentModel } from './payment.model';
import { generateInvoicePdf, invoiceFilePath } from './invoice.service';

function getRazorpay() {
  if (!env.razorpayKeyId || !env.razorpayKeySecret) {
    throw new AppError(
      'Razorpay is not configured',
      503,
      'RAZORPAY_NOT_CONFIGURED'
    );
  }
  return new Razorpay({
    key_id: env.razorpayKeyId,
    key_secret: env.razorpayKeySecret,
  });
}

function verifySignature(
  orderId: string,
  paymentId: string,
  signature: string
): boolean {
  const expected = crypto
    .createHmac('sha256', env.razorpayKeySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature)
    );
  } catch {
    return false;
  }
}

async function nextInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `COSMO-${year}-`;
  const latest = await PaymentModel.findOne({
    invoiceNumber: new RegExp(`^${prefix}`),
  })
    .sort({ invoiceNumber: -1 })
    .select('invoiceNumber')
    .lean();

  let seq = 1;
  if (latest?.invoiceNumber) {
    const part = latest.invoiceNumber.split('-').pop();
    const n = Number(part);
    if (Number.isFinite(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

export async function createOrder(
  userId: string,
  input: CreateBillingOrderInput
) {
  const user = await UserModel.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  const amountPaise = PLAN_PRICES_PAISE[input.plan];
  const razorpay = getRazorpay();
  const receipt = `cosmo_${input.plan}_${Date.now()}`.slice(0, 40);

  const order = await razorpay.orders.create({
    amount: amountPaise,
    currency: 'INR',
    receipt,
    notes: {
      userId,
      plan: input.plan,
    },
  });

  await PaymentModel.create({
    userId,
    plan: input.plan,
    amountPaise,
    currency: 'INR',
    razorpayOrderId: order.id,
    status: 'created',
  });

  return {
    orderId: order.id,
    amount: amountPaise,
    currency: 'INR',
    keyId: env.razorpayKeyId,
    plan: input.plan,
  };
}

export async function verifyPayment(
  userId: string,
  input: VerifyBillingPaymentInput
) {
  const payment = await PaymentModel.findOne({
    razorpayOrderId: input.razorpay_order_id,
    userId,
  });
  if (!payment) {
    throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
  }

  if (payment.plan !== input.plan) {
    throw new AppError('Plan mismatch', 400, 'PLAN_MISMATCH');
  }

  if (payment.status === 'paid' && payment.invoiceNumber) {
    const periodEnd =
      (await UserModel.findById(userId))?.planExpiresAt ??
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    return {
      paymentId: payment._id.toString(),
      plan: payment.plan as PaidPlan,
      planExpiresAt: periodEnd.toISOString(),
      invoiceUrl: `/api/v1/billing/invoices/${payment._id.toString()}`,
      invoiceNumber: payment.invoiceNumber,
    };
  }

  if (
    !verifySignature(
      input.razorpay_order_id,
      input.razorpay_payment_id,
      input.razorpay_signature
    )
  ) {
    payment.status = 'failed';
    await payment.save();
    throw new AppError('Invalid payment signature', 400, 'SIGNATURE_INVALID');
  }

  const user = await UserModel.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  const paidAt = new Date();
  const periodEnd = new Date(paidAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  const invoiceNumber = payment.invoiceNumber ?? (await nextInvoiceNumber());

  const { relativePath } = await generateInvoicePdf({
    invoiceNumber,
    customerName: user.name,
    customerEmail: user.email,
    plan: payment.plan,
    amountPaise: payment.amountPaise,
    currency: payment.currency,
    periodStart: paidAt,
    periodEnd,
    razorpayOrderId: input.razorpay_order_id,
    razorpayPaymentId: input.razorpay_payment_id,
    paidAt,
  });

  payment.status = 'paid';
  payment.razorpayPaymentId = input.razorpay_payment_id;
  payment.razorpaySignature = input.razorpay_signature;
  payment.invoiceNumber = invoiceNumber;
  payment.invoicePath = relativePath;
  await payment.save();

  user.plan = payment.plan;
  user.planExpiresAt = periodEnd;
  await user.save();

  return {
    paymentId: payment._id.toString(),
    plan: payment.plan as PaidPlan,
    planExpiresAt: periodEnd.toISOString(),
    invoiceUrl: `/api/v1/billing/invoices/${payment._id.toString()}`,
    invoiceNumber,
  };
}

export async function getBillingMe(userId: string) {
  const user = await UserModel.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  const payments = await PaymentModel.find({ userId, status: 'paid' })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  const { periodStart, periodEnd } = getIstMonthBounds();
  const effectivePlan = getEffectivePlan(user.plan, user.planExpiresAt);
  const appliesLimit = getPlanAppliesLimit(user.plan, user.planExpiresAt);

  const appliesUsed = await ApplicationModel.countDocuments({
    userId,
    'metadata.skipped': { $ne: true },
    $or: [{ status: 'applied' }, { 'metadata.source': 'auto_apply' }],
    $and: [
      {
        $or: [
          { appliedAt: { $gte: periodStart, $lt: periodEnd } },
          {
            appliedAt: { $exists: false },
            createdAt: { $gte: periodStart, $lt: periodEnd },
          },
        ],
      },
    ],
  });

  return {
    plan: effectivePlan,
    planExpiresAt: user.planExpiresAt?.toISOString() ?? null,
    appliesUsed,
    appliesLimit,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    payments: payments.map((p) => ({
      id: p._id.toString(),
      plan: p.plan,
      amountPaise: p.amountPaise,
      currency: p.currency,
      invoiceNumber: p.invoiceNumber,
      invoiceUrl: `/api/v1/billing/invoices/${p._id.toString()}`,
      paidAt: p.updatedAt?.toISOString?.() ?? p.createdAt?.toISOString?.(),
    })),
  };
}

export async function getInvoiceStream(userId: string, paymentId: string) {
  const payment = await PaymentModel.findById(paymentId);
  if (!payment || payment.userId.toString() !== userId) {
    throw new AppError('Invoice not found', 404, 'NOT_FOUND');
  }
  if (payment.status !== 'paid' || !payment.invoiceNumber) {
    throw new AppError('Invoice not ready', 404, 'INVOICE_NOT_READY');
  }

  const absolutePath = invoiceFilePath(payment.invoiceNumber);
  if (!fs.existsSync(absolutePath)) {
    throw new AppError('Invoice file missing', 404, 'INVOICE_MISSING');
  }

  return {
    absolutePath,
    filename: `${payment.invoiceNumber}.pdf`,
  };
}
