import mongoose, { Schema, Document, Types } from 'mongoose';
import type { PaidPlan } from '@cosmo/shared';

export type CouponType = 'percent' | 'fixedPaise';

export interface ICoupon extends Document {
  code: string;
  type: CouponType;
  value: number;
  applicablePlans: PaidPlan[];
  maxRedemptions?: number | null;
  redemptionCount: number;
  perUserLimit: number;
  active: boolean;
  startsAt?: Date | null;
  endsAt?: Date | null;
  description?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const couponSchema = new Schema<ICoupon>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: 40,
    },
    type: { type: String, enum: ['percent', 'fixedPaise'], required: true },
    value: { type: Number, required: true, min: 1 },
    applicablePlans: {
      type: [{ type: String, enum: ['pro', 'max'] }],
      required: true,
      default: ['pro', 'max'],
    },
    maxRedemptions: { type: Number, default: null },
    redemptionCount: { type: Number, default: 0, min: 0 },
    perUserLimit: { type: Number, default: 1, min: 1 },
    active: { type: Boolean, default: true, index: true },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    description: { type: String, default: null, maxlength: 500 },
  },
  { timestamps: true }
);

export const CouponModel = mongoose.model<ICoupon>('Coupon', couponSchema);

export interface ICouponRedemption extends Document {
  code: string;
  userId: Types.ObjectId;
  paymentId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const couponRedemptionSchema = new Schema<ICouponRedemption>(
  {
    code: { type: String, required: true, uppercase: true, index: true },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    paymentId: {
      type: Schema.Types.ObjectId,
      ref: 'Payment',
      required: true,
    },
  },
  { timestamps: true }
);

couponRedemptionSchema.index(
  { code: 1, userId: 1, paymentId: 1 },
  { unique: true }
);

export const CouponRedemptionModel = mongoose.model<ICouponRedemption>(
  'CouponRedemption',
  couponRedemptionSchema
);
