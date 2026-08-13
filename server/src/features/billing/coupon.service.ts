import {
  computeCouponDiscount,
  yearlyChargePaise,
  type AdminCreateCouponInput,
  type AdminUpdateCouponInput,
  type BillingFrequency,
  type Coupon,
  type PaidPlan,
  type ValidateCouponResult,
} from '@cosmo/shared';
import { AppError } from '../../middleware/errorHandler';
import {
  CouponModel,
  CouponRedemptionModel,
  type ICoupon,
} from './coupon.model';
import { getPaidPlanAmount } from './planConfig.service';

function toPublic(doc: ICoupon | Record<string, unknown>): Coupon {
  const d = doc as ICoupon;
  return {
    code: d.code,
    type: d.type,
    value: d.value,
    applicablePlans: [...(d.applicablePlans ?? [])] as PaidPlan[],
    maxRedemptions: d.maxRedemptions ?? null,
    redemptionCount: d.redemptionCount ?? 0,
    perUserLimit: d.perUserLimit ?? 1,
    active: d.active,
    startsAt: d.startsAt ? new Date(d.startsAt).toISOString() : null,
    endsAt: d.endsAt ? new Date(d.endsAt).toISOString() : null,
    description: d.description ?? null,
    createdAt: d.createdAt
      ? new Date(d.createdAt).toISOString()
      : undefined,
    updatedAt: d.updatedAt
      ? new Date(d.updatedAt).toISOString()
      : undefined,
  };
}

function parseOptionalDate(
  value: string | null | undefined
): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return new Date(value);
}

function assertCouponWindow(coupon: ICoupon, now = new Date()): void {
  if (!coupon.active) {
    throw new AppError('Coupon is inactive', 400, 'COUPON_INACTIVE');
  }
  if (coupon.startsAt && new Date(coupon.startsAt).getTime() > now.getTime()) {
    throw new AppError('Coupon is not active yet', 400, 'COUPON_NOT_STARTED');
  }
  if (coupon.endsAt && new Date(coupon.endsAt).getTime() < now.getTime()) {
    throw new AppError('Coupon has expired', 400, 'COUPON_EXPIRED');
  }
  if (
    coupon.maxRedemptions != null &&
    coupon.redemptionCount >= coupon.maxRedemptions
  ) {
    throw new AppError('Coupon redemption limit reached', 400, 'COUPON_EXHAUSTED');
  }
}

export async function listCouponsAdmin(): Promise<Coupon[]> {
  const docs = await CouponModel.find().sort({ createdAt: -1 }).lean();
  return docs.map((d) => toPublic(d as unknown as ICoupon));
}

export async function createCoupon(
  input: AdminCreateCouponInput
): Promise<Coupon> {
  const code = input.code.trim().toUpperCase();
  const existing = await CouponModel.findOne({ code });
  if (existing) {
    throw new AppError('Coupon code already exists', 409, 'COUPON_EXISTS');
  }

  const doc = await CouponModel.create({
    code,
    type: input.type,
    value: input.value,
    applicablePlans: input.applicablePlans ?? ['pro', 'max'],
    maxRedemptions: input.maxRedemptions ?? null,
    redemptionCount: 0,
    perUserLimit: input.perUserLimit ?? 1,
    active: input.active ?? true,
    startsAt: parseOptionalDate(input.startsAt) ?? null,
    endsAt: parseOptionalDate(input.endsAt) ?? null,
    description: input.description ?? null,
  });
  return toPublic(doc);
}

export async function updateCoupon(
  code: string,
  input: AdminUpdateCouponInput
): Promise<Coupon> {
  const doc = await CouponModel.findOne({
    code: code.trim().toUpperCase(),
  });
  if (!doc) {
    throw new AppError('Coupon not found', 404, 'NOT_FOUND');
  }

  if (input.type !== undefined) doc.type = input.type;
  if (input.value !== undefined) doc.value = input.value;
  if (input.applicablePlans !== undefined) {
    doc.applicablePlans = input.applicablePlans;
  }
  if (input.maxRedemptions !== undefined) {
    doc.maxRedemptions = input.maxRedemptions;
  }
  if (input.perUserLimit !== undefined) doc.perUserLimit = input.perUserLimit;
  if (input.active !== undefined) doc.active = input.active;
  if (input.startsAt !== undefined) {
    doc.startsAt = parseOptionalDate(input.startsAt) ?? null;
  }
  if (input.endsAt !== undefined) {
    doc.endsAt = parseOptionalDate(input.endsAt) ?? null;
  }
  if (input.description !== undefined) doc.description = input.description;

  await doc.save();
  return toPublic(doc);
}

export async function deleteCoupon(
  code: string
): Promise<{ deleted: true }> {
  const result = await CouponModel.findOneAndDelete({
    code: code.trim().toUpperCase(),
  });
  if (!result) {
    throw new AppError('Coupon not found', 404, 'NOT_FOUND');
  }
  return { deleted: true };
}

export async function validateCoupon(
  userId: string,
  code: string,
  plan: PaidPlan,
  billingFrequency: BillingFrequency = 'monthly'
): Promise<ValidateCouponResult> {
  const normalized = code.trim().toUpperCase();
  const coupon = await CouponModel.findOne({ code: normalized });
  if (!coupon) {
    throw new AppError('Invalid coupon code', 400, 'COUPON_INVALID');
  }

  assertCouponWindow(coupon);

  if (!coupon.applicablePlans.includes(plan)) {
    throw new AppError(
      `Coupon does not apply to ${plan}`,
      400,
      'COUPON_PLAN_MISMATCH'
    );
  }

  const userRedemptions = await CouponRedemptionModel.countDocuments({
    code: normalized,
    userId,
  });
  if (userRedemptions >= (coupon.perUserLimit ?? 1)) {
    throw new AppError(
      'You have already used this coupon',
      400,
      'COUPON_USER_LIMIT'
    );
  }

  const monthlyPaise = await getPaidPlanAmount(plan);
  const originalAmountPaise =
    billingFrequency === 'yearly'
      ? yearlyChargePaise(monthlyPaise)
      : monthlyPaise;
  const { discountPaise, finalAmountPaise } = computeCouponDiscount(
    originalAmountPaise,
    coupon.type,
    coupon.value
  );

  const label =
    coupon.type === 'percent'
      ? `${coupon.value}% off`
      : `₹${(discountPaise / 100).toFixed(0)} off`;

  return {
    code: normalized,
    plan,
    originalAmountPaise,
    discountPaise,
    finalAmountPaise,
    label: coupon.description?.trim() || label,
  };
}

export async function redeemCoupon(
  userId: string,
  code: string,
  paymentId: string
): Promise<void> {
  const normalized = code.trim().toUpperCase();
  const coupon = await CouponModel.findOne({ code: normalized });
  if (!coupon) return;

  try {
    await CouponRedemptionModel.create({
      code: normalized,
      userId,
      paymentId,
    });
  } catch (error) {
    // Unique compound — already redeemed for this payment
    const err = error as { code?: number };
    if (err?.code === 11000) return;
    throw error;
  }

  await CouponModel.updateOne(
    { code: normalized },
    { $inc: { redemptionCount: 1 } }
  );
}
