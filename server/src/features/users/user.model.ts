import mongoose, { Schema, Document, Types } from 'mongoose';
import type { JobPreferences } from '@cosmo/shared';

export type PlanTier = 'free' | 'pro' | 'max';
export type UserRole = 'user' | 'admin';
export type UserStatus = 'active' | 'suspended';

export interface IUser extends Document {
  email: string;
  passwordHash?: string;
  googleId?: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  refreshTokenHash?: string;
  extensionConnectedAt?: Date;
  preferences?: JobPreferences;
  preferencesCompletedAt?: Date | null;
  plan: PlanTier;
  planExpiresAt?: Date | null;
  razorpayCustomerId?: string;
  activeSubscriptionId?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const preferencesSchema = new Schema(
  {
    titles: { type: [String], default: [] },
    keywords: { type: [String], default: [] },
    locations: { type: [String], default: [] },
    experienceMin: { type: Number, default: 0 },
    experienceMax: { type: Number, default: 30 },
    minSalaryLpa: { type: Number },
    workMode: {
      type: String,
      enum: ['any', 'office', 'hybrid', 'remote'],
      default: 'any',
    },
    autoScanEnabled: { type: Boolean, default: true },
    autoApplyEnabled: { type: Boolean, default: false },
  },
  { _id: false }
);

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: false },
    googleId: { type: String, required: false, unique: true, sparse: true },
    name: { type: String, required: true, trim: true },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'suspended'],
      default: 'active',
      index: true,
    },
    refreshTokenHash: { type: String },
    extensionConnectedAt: { type: Date },
    preferences: { type: preferencesSchema, default: undefined },
    preferencesCompletedAt: { type: Date, default: null },
    plan: {
      type: String,
      enum: ['free', 'pro', 'max'],
      default: 'free',
    },
    planExpiresAt: { type: Date, default: null },
    razorpayCustomerId: { type: String },
    activeSubscriptionId: {
      type: Schema.Types.ObjectId,
      ref: 'Subscription',
      default: null,
    },
  },
  { timestamps: true }
);

export const UserModel = mongoose.model<IUser>('User', userSchema);
