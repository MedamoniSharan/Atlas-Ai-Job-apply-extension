import crypto from 'crypto';
import fs from 'fs';
import Razorpay from 'razorpay';
import {
  PLAN_PRICES_PAISE,
  getEffectivePlan,
  getIstMonthBounds,
  yearlyChargePaise,
  type BillingFrequency,
  type CancelSubscriptionInput,
  type CreateBillingOrderInput,
  type CreateSubscriptionInput,
  type PaidPlan,
  type ValidateCouponInput,
  type VerifyBillingPaymentInput,
  type VerifySubscriptionInput,
} from '@cosmo/shared';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { AppError } from '../../middleware/errorHandler';
import { ApplicationModel } from '../applications/application.model';
import {
  appliedCountFilter,
  dayRange,
  hourRange,
  monthRange,
} from '../applications/applyCount';
import { UserModel } from '../users/user.model';
import * as couponService from './coupon.service';
import { PaymentModel } from './payment.model';
import { generateInvoicePdf, invoiceFilePath } from './invoice.service';
import {
  getPaidPlanAmount,
  getPlanConfig,
  getPlanLimitsFromConfig,
} from './planConfig.service';
import { SubscriptionModel } from './subscription.model';

const MONTHLY_SUBSCRIPTION_TOTAL_COUNT = 120; // 10 years of monthly cycles
const YEARLY_SUBSCRIPTION_TOTAL_COUNT = 10; // 10 years of yearly cycles

function defaultPeriodMs(frequency: BillingFrequency): number {
  return frequency === 'yearly'
    ? 365 * 24 * 60 * 60 * 1000
    : 30 * 24 * 60 * 60 * 1000;
}

function razorpayAppError(error: unknown, fallback: string): AppError {
  const err = error as {
    statusCode?: number;
    error?: { description?: string; code?: string };
    message?: string;
  };
  const description =
    err?.error?.description ||
    (error instanceof Error ? error.message : undefined) ||
    fallback;
  const status =
    typeof err?.statusCode === 'number' && err.statusCode >= 400
      ? Math.min(err.statusCode, 502)
      : 502;
  return new AppError(description, status, err?.error?.code || 'RAZORPAY_ERROR');
}
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

function verifyOrderSignature(
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

function verifySubscriptionSignature(
  paymentId: string,
  subscriptionId: string,
  signature: string
): boolean {
  const expected = crypto
    .createHmac('sha256', env.razorpayKeySecret)
    .update(`${paymentId}|${subscriptionId}`)
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

export function verifyWebhookSignature(
  rawBody: Buffer | string,
  signature: string | undefined
): boolean {
  if (!env.razorpayWebhookSecret || !signature) return false;
  const expected = crypto
    .createHmac('sha256', env.razorpayWebhookSecret)
    .update(typeof rawBody === 'string' ? rawBody : rawBody)
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

async function ensureRazorpayCustomer(userId: string) {
  const user = await UserModel.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  const razorpay = getRazorpay();

  if (user.razorpayCustomerId) {
    try {
      await razorpay.customers.fetch(user.razorpayCustomerId);
      return { user, customerId: user.razorpayCustomerId };
    } catch (error) {
      // Stale ID after test→live key switch or deleted Razorpay customer.
      logger.warn('Stored Razorpay customer id invalid; recreating', {
        userId,
        razorpayCustomerId: user.razorpayCustomerId,
        error: error instanceof Error ? error.message : String(error),
      });
      user.razorpayCustomerId = undefined;
    }
  }

  try {
    const customer = await razorpay.customers.create({
      name: user.name,
      email: user.email,
      fail_existing: 0,
      notes: { userId },
    });
    user.razorpayCustomerId = customer.id;
    await user.save();
    return { user, customerId: customer.id };
  } catch (error) {
    throw razorpayAppError(error, 'Could not create Razorpay customer');
  }
}

async function createRazorpayPlanAtAmount(
  plan: PaidPlan,
  amountPaise: number,
  notes: Record<string, string> = {},
  billingFrequency: BillingFrequency = 'monthly'
): Promise<string> {
  const cfg = await getPlanConfig(plan);
  if (!amountPaise || amountPaise <= 0) {
    throw new AppError(
      `Cannot create Razorpay plan for ${plan}: invalid amount`,
      500,
      'PLAN_AMOUNT_INVALID'
    );
  }

  const razorpay = getRazorpay();
  const periodLabel = billingFrequency === 'yearly' ? 'yearly' : 'monthly';
  try {
    const created = await razorpay.plans.create({
      period: billingFrequency,
      interval: 1,
      item: {
        name: `Cosmo ${cfg.name}${billingFrequency === 'yearly' ? ' (Yearly)' : ''}`,
        amount: amountPaise,
        currency: 'INR',
        description: cfg.description || `${cfg.name} ${periodLabel}`,
      },
      notes: { tier: plan, billingFrequency, ...notes },
    });
    return created.id;
  } catch (error) {
    throw razorpayAppError(error, 'Could not create Razorpay plan');
  }
}

async function ensureRazorpayPlanId(plan: PaidPlan): Promise<string> {
  const cfg = await getPlanConfig(plan);
  const razorpay = getRazorpay();

  if (cfg.razorpayPlanId) {
    try {
      await razorpay.plans.fetch(cfg.razorpayPlanId);
      return cfg.razorpayPlanId;
    } catch (error) {
      // Stale ID after key mode switch (test→live) or deleted Razorpay plan.
      logger.warn('Stored Razorpay plan id invalid; recreating', {
        plan,
        razorpayPlanId: cfg.razorpayPlanId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const amount = cfg.amountPaise || PLAN_PRICES_PAISE[plan];
  const createdId = await createRazorpayPlanAtAmount(plan, amount);

  const { PlanConfigModel } = await import('./subscription.model');
  const { invalidatePlanCache } = await import('./planConfig.service');
  await PlanConfigModel.findOneAndUpdate(
    { tier: plan },
    { razorpayPlanId: createdId }
  );
  invalidatePlanCache();
  return createdId;
}

function periodFromUnix(start?: number | null, end?: number | null) {
  const now = new Date();
  const periodStart = start ? new Date(start * 1000) : now;
  const periodEnd = end
    ? new Date(end * 1000)
    : new Date(periodStart.getTime() + 30 * 24 * 60 * 60 * 1000);
  return { periodStart, periodEnd };
}

async function applyEntitlement(
  userId: string,
  plan: PaidPlan,
  periodEnd: Date,
  subscriptionMongoId?: string
) {
  await UserModel.findByIdAndUpdate(userId, {
    plan,
    planExpiresAt: periodEnd,
    ...(subscriptionMongoId
      ? { activeSubscriptionId: subscriptionMongoId }
      : {}),
  });
}

/** Legacy one-time order flow (kept for reconcile / older clients). */
export async function createOrder(
  userId: string,
  input: CreateBillingOrderInput
) {
  const user = await UserModel.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  const amountPaise = await getPaidPlanAmount(input.plan);
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
    type: 'order',
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
    !verifyOrderSignature(
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

  // Legacy one-shot: grant as admin_grant-style period without Razorpay sub
  const legacySub = await SubscriptionModel.create({
    userId,
    tier: payment.plan,
    status: 'active',
    currentPeriodStart: paidAt,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: true,
    source: 'legacy',
  });

  await applyEntitlement(
    userId,
    payment.plan,
    periodEnd,
    legacySub._id.toString()
  );

  return {
    paymentId: payment._id.toString(),
    plan: payment.plan as PaidPlan,
    planExpiresAt: periodEnd.toISOString(),
    invoiceUrl: `/api/v1/billing/invoices/${payment._id.toString()}`,
    invoiceNumber,
  };
}

export async function validateCouponForUser(
  userId: string,
  input: ValidateCouponInput
) {
  return couponService.validateCoupon(
    userId,
    input.code,
    input.plan,
    input.billingFrequency ?? 'monthly'
  );
}

export async function createSubscription(
  userId: string,
  input: CreateSubscriptionInput
) {
  const { user, customerId } = await ensureRazorpayCustomer(userId);
  if (user.status === 'suspended') {
    throw new AppError('Account suspended', 403, 'ACCOUNT_SUSPENDED');
  }

  const planCfg = await getPlanConfig(input.plan);
  if (!planCfg.active) {
    throw new AppError('Plan is not available', 400, 'PLAN_INACTIVE');
  }

  const billingFrequency: BillingFrequency =
    input.billingFrequency ?? 'monthly';
  const catalogMonthlyPaise = planCfg.amountPaise;
  const catalogChargePaise =
    billingFrequency === 'yearly'
      ? yearlyChargePaise(catalogMonthlyPaise)
      : catalogMonthlyPaise;

  let amountPaise = catalogChargePaise;
  let couponCode: string | null = null;
  if (input.couponCode) {
    const validated = await couponService.validateCoupon(
      userId,
      input.couponCode,
      input.plan,
      billingFrequency
    );
    amountPaise = validated.finalAmountPaise;
    couponCode = validated.code;
  }

  const needsCustomPlan =
    billingFrequency === 'yearly' ||
    Boolean(couponCode && amountPaise !== catalogChargePaise);

  const razorpayPlanId = needsCustomPlan
    ? await createRazorpayPlanAtAmount(
        input.plan,
        amountPaise,
        {
          ...(couponCode ? { coupon: couponCode, discounted: '1' } : {}),
          billingFrequency,
        },
        billingFrequency
      )
    : await ensureRazorpayPlanId(input.plan);
  const razorpay = getRazorpay();

  // Cancel any open created Razorpay drafts for this user locally
  await SubscriptionModel.updateMany(
    { userId, status: 'created', source: 'razorpay' },
    { status: 'cancelled', cancelledAt: new Date() }
  );

  const notes: Record<string, string> = {
    userId,
    plan: input.plan,
    billingFrequency,
  };
  if (couponCode) notes.couponCode = couponCode;

  const totalCount =
    billingFrequency === 'yearly'
      ? YEARLY_SUBSCRIPTION_TOTAL_COUNT
      : MONTHLY_SUBSCRIPTION_TOTAL_COUNT;

  let subscription: { id: string };
  try {
    // Razorpay runtime accepts customer_id; SDK typings omit it.
    subscription = (await razorpay.subscriptions.create({
      plan_id: razorpayPlanId,
      total_count: totalCount,
      customer_notify: 1,
      quantity: 1,
      notes,
      ...(customerId ? { customer_id: customerId } : {}),
    } as Parameters<typeof razorpay.subscriptions.create>[0])) as {
      id: string;
    };
  } catch (error) {
    throw razorpayAppError(error, 'Could not create Razorpay subscription');
  }

  const doc = await SubscriptionModel.create({
    userId,
    tier: input.plan,
    status: 'created',
    razorpaySubscriptionId: subscription.id,
    razorpayPlanId,
    couponCode,
    amountPaise,
    billingFrequency,
    source: 'razorpay',
    cancelAtPeriodEnd: false,
  });

  return {
    subscriptionId: subscription.id,
    localSubscriptionId: doc._id.toString(),
    keyId: env.razorpayKeyId,
    plan: input.plan,
    amountPaise,
    billingFrequency,
  };
}

export async function verifySubscription(
  userId: string,
  input: VerifySubscriptionInput
) {
  const sub = await SubscriptionModel.findOne({
    razorpaySubscriptionId: input.razorpay_subscription_id,
    userId,
  });
  if (!sub) {
    throw new AppError('Subscription not found', 404, 'SUBSCRIPTION_NOT_FOUND');
  }

  if (sub.tier !== input.plan) {
    throw new AppError('Plan mismatch', 400, 'PLAN_MISMATCH');
  }

  if (
    !verifySubscriptionSignature(
      input.razorpay_payment_id,
      input.razorpay_subscription_id,
      input.razorpay_signature
    )
  ) {
    throw new AppError('Invalid payment signature', 400, 'SIGNATURE_INVALID');
  }

  const now = new Date();
  const frequency: BillingFrequency = sub.billingFrequency ?? 'monthly';
  const periodEnd =
    sub.currentPeriodEnd ??
    new Date(now.getTime() + defaultPeriodMs(frequency));

  if (sub.status === 'created' || sub.status === 'authenticated') {
    sub.status = 'active';
  }
  sub.currentPeriodStart = sub.currentPeriodStart ?? now;
  sub.currentPeriodEnd = periodEnd;
  await sub.save();

  await applyEntitlement(userId, sub.tier, periodEnd, sub._id.toString());

  // Record payment if not already present
  let payment = await PaymentModel.findOne({
    razorpayPaymentId: input.razorpay_payment_id,
  });
  if (!payment) {
    const amountPaise =
      sub.amountPaise && sub.amountPaise > 0
        ? sub.amountPaise
        : await getPaidPlanAmount(sub.tier);
    const user = await UserModel.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404, 'NOT_FOUND');
    }
    const invoiceNumber = await nextInvoiceNumber();
    const { relativePath } = await generateInvoicePdf({
      invoiceNumber,
      customerName: user.name,
      customerEmail: user.email,
      plan: sub.tier,
      amountPaise,
      currency: 'INR',
      periodStart: sub.currentPeriodStart ?? now,
      periodEnd,
      razorpayOrderId: input.razorpay_subscription_id,
      razorpayPaymentId: input.razorpay_payment_id,
      paidAt: now,
    });

    payment = await PaymentModel.create({
      userId,
      plan: sub.tier,
      amountPaise,
      currency: 'INR',
      type: 'subscription',
      razorpayPaymentId: input.razorpay_payment_id,
      razorpaySignature: input.razorpay_signature,
      razorpaySubscriptionId: input.razorpay_subscription_id,
      status: 'paid',
      invoiceNumber,
      invoicePath: relativePath,
    });
  }

  if (sub.couponCode) {
    await couponService.redeemCoupon(
      userId,
      sub.couponCode,
      payment._id.toString()
    );
  }

  return {
    paymentId: payment._id.toString(),
    subscriptionId: sub._id.toString(),
    plan: sub.tier,
    planExpiresAt: periodEnd.toISOString(),
    invoiceUrl: `/api/v1/billing/invoices/${payment._id.toString()}`,
    invoiceNumber: payment.invoiceNumber ?? '',
  };
}

export async function cancelSubscription(
  userId: string,
  input: CancelSubscriptionInput
) {
  const user = await UserModel.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  const sub = await SubscriptionModel.findOne({
    userId,
    status: { $in: ['created', 'authenticated', 'active', 'pending', 'halted'] },
  }).sort({ createdAt: -1 });

  if (!sub) {
    throw new AppError('No active subscription', 404, 'NO_SUBSCRIPTION');
  }

  if (sub.source === 'razorpay' && sub.razorpaySubscriptionId) {
    const razorpay = getRazorpay();
    await razorpay.subscriptions.cancel(
      sub.razorpaySubscriptionId,
      input.immediate !== true
    );
  }

  if (input.immediate) {
    sub.status = 'cancelled';
    sub.cancelledAt = new Date();
    sub.cancelAtPeriodEnd = false;
    await sub.save();
    await UserModel.findByIdAndUpdate(userId, {
      plan: 'free',
      planExpiresAt: null,
      activeSubscriptionId: null,
    });
  } else {
    sub.cancelAtPeriodEnd = true;
    await sub.save();
  }

  return {
    subscriptionId: sub._id.toString(),
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    status: sub.status,
    planExpiresAt: user.planExpiresAt?.toISOString() ?? null,
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

  const subscription = await SubscriptionModel.findOne({
    userId,
    status: {
      $in: ['created', 'authenticated', 'active', 'pending', 'halted'],
    },
  })
    .sort({ createdAt: -1 })
    .lean();

  const { periodStart, periodEnd } = getIstMonthBounds();
  const effectivePlan = getEffectivePlan(user.plan, user.planExpiresAt);
  const limits = await getPlanLimitsFromConfig(effectivePlan);
  const appliesLimit = limits.monthlyApplies;
  const appliesHourLimit = limits.appliesPerHour;
  const appliesDayLimit = limits.appliesPerDay;

  const month = monthRange();
  const hour = hourRange();
  const day = dayRange();

  const [appliesUsed, appliesHourUsed, appliesDayUsed] = await Promise.all([
    ApplicationModel.countDocuments(appliedCountFilter(userId, month)),
    ApplicationModel.countDocuments(appliedCountFilter(userId, hour)),
    ApplicationModel.countDocuments(appliedCountFilter(userId, day)),
  ]);

  return {
    plan: effectivePlan,
    planExpiresAt: user.planExpiresAt?.toISOString() ?? null,
    appliesUsed,
    appliesLimit,
    appliesHourUsed,
    appliesHourLimit,
    appliesDayUsed,
    appliesDayLimit,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    subscription: subscription
      ? {
          id: subscription._id.toString(),
          tier: subscription.tier,
          status: subscription.status,
          source: subscription.source,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          currentPeriodStart:
            subscription.currentPeriodStart?.toISOString?.() ?? null,
          currentPeriodEnd:
            subscription.currentPeriodEnd?.toISOString?.() ?? null,
          razorpaySubscriptionId: subscription.razorpaySubscriptionId,
        }
      : null,
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

export async function getInvoiceStreamAdmin(paymentId: string) {
  const payment = await PaymentModel.findById(paymentId);
  if (!payment) {
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

type RazorpayWebhookPayload = {
  event: string;
  payload?: {
    subscription?: { entity?: Record<string, unknown> };
    payment?: { entity?: Record<string, unknown> };
    invoice?: { entity?: Record<string, unknown> };
  };
};

async function upsertSubscriptionFromRazorpay(
  entity: Record<string, unknown>
) {
  const razorpaySubscriptionId = String(entity.id ?? '');
  if (!razorpaySubscriptionId) return null;

  let sub = await SubscriptionModel.findOne({ razorpaySubscriptionId });
  const notes = (entity.notes ?? {}) as Record<string, string>;
  const userId = notes.userId;
  const plan = (notes.plan as PaidPlan) || sub?.tier;

  if (!sub) {
    if (!userId || !plan) return null;
    sub = await SubscriptionModel.create({
      userId,
      tier: plan,
      status: 'created',
      razorpaySubscriptionId,
      razorpayPlanId: String(entity.plan_id ?? ''),
      source: 'razorpay',
    });
  }

  const status = String(entity.status ?? sub.status);
  const statusMap: Record<string, typeof sub.status> = {
    created: 'created',
    authenticated: 'authenticated',
    active: 'active',
    pending: 'pending',
    halted: 'halted',
    cancelled: 'cancelled',
    completed: 'completed',
    expired: 'expired',
  };
  sub.status = statusMap[status] ?? sub.status;

  const { periodStart, periodEnd } = periodFromUnix(
    typeof entity.current_start === 'number' ? entity.current_start : null,
    typeof entity.current_end === 'number' ? entity.current_end : null
  );
  if (entity.current_start) sub.currentPeriodStart = periodStart;
  if (entity.current_end) sub.currentPeriodEnd = periodEnd;

  if (status === 'cancelled' || status === 'completed' || status === 'expired') {
    sub.cancelledAt = sub.cancelledAt ?? new Date();
  }

  await sub.save();
  return sub;
}

export async function handleRazorpayWebhook(
  rawBody: Buffer,
  signature: string | undefined
) {
  if (!verifyWebhookSignature(rawBody, signature)) {
    throw new AppError('Invalid webhook signature', 400, 'WEBHOOK_INVALID');
  }

  const body = JSON.parse(rawBody.toString('utf8')) as RazorpayWebhookPayload;
  const event = body.event;
  const subEntity = body.payload?.subscription?.entity;
  const paymentEntity = body.payload?.payment?.entity;

  if (subEntity) {
    const sub = await upsertSubscriptionFromRazorpay(subEntity);
    if (sub) {
      if (
        event === 'subscription.activated' ||
        event === 'subscription.authenticated' ||
        event === 'subscription.charged'
      ) {
        const end =
          sub.currentPeriodEnd ??
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await applyEntitlement(
          sub.userId.toString(),
          sub.tier,
          end,
          sub._id.toString()
        );
      }

      if (
        event === 'subscription.cancelled' ||
        event === 'subscription.completed'
      ) {
        const end = sub.currentPeriodEnd;
        if (!end || end.getTime() <= Date.now()) {
          await UserModel.findByIdAndUpdate(sub.userId, {
            plan: 'free',
            planExpiresAt: null,
            activeSubscriptionId: null,
          });
        } else {
          sub.cancelAtPeriodEnd = true;
          await sub.save();
        }
      }

      if (event === 'subscription.halted' || event === 'subscription.pending') {
        // Keep entitlement until period end; status already updated
      }
    }
  }

  if (
    (event === 'subscription.charged' || event === 'payment.captured') &&
    paymentEntity
  ) {
    const paymentId = String(paymentEntity.id ?? '');
    const subscriptionId = String(
      paymentEntity.subscription_id ??
        subEntity?.id ??
        ''
    );
    if (paymentId) {
      const existing = await PaymentModel.findOne({
        razorpayPaymentId: paymentId,
      });
      if (!existing) {
        const sub = subscriptionId
          ? await SubscriptionModel.findOne({
              razorpaySubscriptionId: subscriptionId,
            })
          : null;
        const userId =
          sub?.userId?.toString() ||
          String(
            ((paymentEntity.notes as Record<string, string>) ?? {}).userId ?? ''
          );
        const plan = (sub?.tier ||
          ((paymentEntity.notes as Record<string, string>) ?? {}).plan) as
          | PaidPlan
          | undefined;

        if (userId && plan) {
          const amountPaise = Number(paymentEntity.amount ?? 0);
          const user = await UserModel.findById(userId);
          if (user) {
            const paidAt = new Date(
              typeof paymentEntity.created_at === 'number'
                ? paymentEntity.created_at * 1000
                : Date.now()
            );
            const periodEnd =
              sub?.currentPeriodEnd ??
              new Date(paidAt.getTime() + 30 * 24 * 60 * 60 * 1000);
            const invoiceNumber = await nextInvoiceNumber();
            const { relativePath } = await generateInvoicePdf({
              invoiceNumber,
              customerName: user.name,
              customerEmail: user.email,
              plan,
              amountPaise: amountPaise || (await getPaidPlanAmount(plan)),
              currency: String(paymentEntity.currency ?? 'INR'),
              periodStart: sub?.currentPeriodStart ?? paidAt,
              periodEnd,
              razorpayOrderId: subscriptionId || paymentId,
              razorpayPaymentId: paymentId,
              paidAt,
            });

            await PaymentModel.create({
              userId,
              plan,
              amountPaise: amountPaise || (await getPaidPlanAmount(plan)),
              currency: String(paymentEntity.currency ?? 'INR'),
              type: 'subscription',
              razorpayPaymentId: paymentId,
              razorpaySubscriptionId: subscriptionId || undefined,
              razorpayInvoiceId: paymentEntity.invoice_id
                ? String(paymentEntity.invoice_id)
                : undefined,
              status: 'paid',
              invoiceNumber,
              invoicePath: relativePath,
            });

            await applyEntitlement(
              userId,
              plan,
              periodEnd,
              sub?._id?.toString()
            );
          }
        }
      }
    }
  }

  if (event === 'payment.failed' && paymentEntity) {
    const paymentId = String(paymentEntity.id ?? '');
    const subscriptionId = paymentEntity.subscription_id
      ? String(paymentEntity.subscription_id)
      : undefined;
    if (paymentId) {
      const existing = await PaymentModel.findOne({
        razorpayPaymentId: paymentId,
      });
      if (!existing) {
        const sub = subscriptionId
          ? await SubscriptionModel.findOne({
              razorpaySubscriptionId: subscriptionId,
            })
          : null;
        if (sub) {
          await PaymentModel.create({
            userId: sub.userId,
            plan: sub.tier,
            amountPaise: Number(paymentEntity.amount ?? 0),
            currency: String(paymentEntity.currency ?? 'INR'),
            type: 'subscription',
            razorpayPaymentId: paymentId,
            razorpaySubscriptionId: subscriptionId,
            status: 'failed',
          });
        }
      } else if (existing.status !== 'paid') {
        existing.status = 'failed';
        await existing.save();
      }
    }
  }

  return { received: true, event };
}
