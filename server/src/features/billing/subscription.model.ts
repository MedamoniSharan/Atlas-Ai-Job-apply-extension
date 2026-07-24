import mongoose, { Schema, Document, Types } from 'mongoose';
import type { PaidPlan, PlanTier, SubscriptionStatus } from '@cosmo/shared';

export type SubscriptionSource = 'razorpay' | 'admin_grant' | 'legacy';

export interface ISubscription extends Document {
  userId: Types.ObjectId;
  tier: PaidPlan;
  status: SubscriptionStatus;
  razorpaySubscriptionId?: string;
  razorpayPlanId?: string;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd: boolean;
  cancelledAt?: Date | null;
  source: SubscriptionSource;
  createdAt: Date;
  updatedAt: Date;
}

const subscriptionSchema = new Schema<ISubscription>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tier: { type: String, enum: ['pro', 'max'], required: true },
    status: {
      type: String,
      enum: [
        'created',
        'authenticated',
        'active',
        'pending',
        'halted',
        'cancelled',
        'completed',
        'expired',
      ],
      default: 'created',
      index: true,
    },
    razorpaySubscriptionId: {
      type: String,
      unique: true,
      sparse: true,
    },
    razorpayPlanId: { type: String },
    currentPeriodStart: { type: Date, default: null },
    currentPeriodEnd: { type: Date, default: null },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    cancelledAt: { type: Date, default: null },
    source: {
      type: String,
      enum: ['razorpay', 'admin_grant', 'legacy'],
      default: 'razorpay',
    },
  },
  { timestamps: true }
);

subscriptionSchema.index({ userId: 1, status: 1 });

export const SubscriptionModel = mongoose.model<ISubscription>(
  'Subscription',
  subscriptionSchema
);

export type PlanLimitsDoc = {
  monthlyApplies: number;
  monthlyScans: number;
  appliesPerHour: number;
  appliesPerDay: number;
};

export interface IPlanConfig extends Document {
  tier: PlanTier;
  name: string;
  description: string;
  amountPaise: number;
  limits: PlanLimitsDoc;
  razorpayPlanId?: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const planConfigSchema = new Schema<IPlanConfig>(
  {
    tier: {
      type: String,
      enum: ['free', 'pro', 'max'],
      required: true,
      unique: true,
    },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    amountPaise: { type: Number, required: true, default: 0 },
    limits: {
      monthlyApplies: { type: Number, required: true },
      monthlyScans: { type: Number, required: true },
      appliesPerHour: { type: Number, required: true },
      appliesPerDay: { type: Number, required: true },
    },
    razorpayPlanId: { type: String, default: null },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const PlanConfigModel = mongoose.model<IPlanConfig>(
  'PlanConfig',
  planConfigSchema
);

export interface IAdminAuditLog extends Document {
  adminId: Types.ObjectId;
  action: string;
  targetType: string;
  targetId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ip?: string;
  createdAt: Date;
  updatedAt: Date;
}

const adminAuditLogSchema = new Schema<IAdminAuditLog>(
  {
    adminId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    action: { type: String, required: true, index: true },
    targetType: { type: String, required: true },
    targetId: { type: String },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
    ip: { type: String },
  },
  { timestamps: true }
);

export const AdminAuditLogModel = mongoose.model<IAdminAuditLog>(
  'AdminAuditLog',
  adminAuditLogSchema
);
