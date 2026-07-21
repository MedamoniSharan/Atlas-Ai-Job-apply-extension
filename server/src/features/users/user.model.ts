import mongoose, { Schema, Document } from 'mongoose';
import type { JobPreferences } from '@atlas/shared';

export type PlanTier = 'free' | 'pro' | 'max';

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  name: string;
  refreshTokenHash?: string;
  extensionConnectedAt?: Date;
  preferences?: JobPreferences;
  preferencesCompletedAt?: Date | null;
  plan: PlanTier;
  planExpiresAt?: Date | null;
  razorpayCustomerId?: string;
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
    dailyApplyLimit: { type: Number, default: 10 },
  },
  { _id: false }
);

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
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
  },
  { timestamps: true }
);

export const UserModel = mongoose.model<IUser>('User', userSchema);
