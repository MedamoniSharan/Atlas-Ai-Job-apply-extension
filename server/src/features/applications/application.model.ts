import mongoose, { Schema, Document, Types } from 'mongoose';
import type { ApplicationStatus, Platform } from '@atlas/shared';

export interface IApplication extends Document {
  eventId: string;
  userId: Types.ObjectId;
  platform: Platform;
  externalJobId?: string;
  title: string;
  company: string;
  location?: string;
  url?: string;
  companyLogo?: string;
  description?: string;
  experience?: string;
  salary?: string;
  skills?: string[];
  rating?: string;
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
    companyLogo: { type: String },
    description: { type: String },
    experience: { type: String },
    salary: { type: String },
    skills: { type: [String], default: undefined },
    rating: { type: String },
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
applicationSchema.index(
  { userId: 1, platform: 1, externalJobId: 1 },
  { unique: true, partialFilterExpression: { externalJobId: { $type: 'string' } } }
);
applicationSchema.index({ userId: 1, createdAt: -1 });

export const ApplicationModel = mongoose.model<IApplication>(
  'Application',
  applicationSchema
);
