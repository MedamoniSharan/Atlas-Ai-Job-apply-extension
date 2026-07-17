import mongoose, { Schema, Document, Types } from 'mongoose';
import type { ApplicationStatus, Platform } from '@codexcareer/shared';

export interface IApplication extends Document {
  eventId: string;
  userId: Types.ObjectId;
  platform: Platform;
  externalJobId?: string;
  title: string;
  company: string;
  location?: string;
  url?: string;
  status: ApplicationStatus;
  appliedAt?: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const applicationSchema = new Schema<IApplication>(
  {
    eventId: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    platform: {
      type: String,
      enum: ['naukri', 'linkedin', 'foundit', 'indeed', 'wellfound', 'internshala', 'unknown'],
      required: true,
    },
    externalJobId: { type: String },
    title: { type: String, required: true },
    company: { type: String, required: true },
    location: { type: String },
    url: { type: String },
    status: {
      type: String,
      enum: ['detected', 'applied', 'viewed', 'saved', 'interview', 'offer', 'rejected'],
      default: 'detected',
    },
    appliedAt: { type: Date },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

applicationSchema.index({ userId: 1, eventId: 1 }, { unique: true });
applicationSchema.index({ userId: 1, createdAt: -1 });

export const ApplicationModel = mongoose.model<IApplication>(
  'Application',
  applicationSchema
);
