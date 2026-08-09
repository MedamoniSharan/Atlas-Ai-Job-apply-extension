import mongoose, { Schema, Document } from 'mongoose';

export interface IUninstallFeedback extends Document {
  reason: string;
  comment?: string;
  email?: string;
  extensionVersion?: string;
  browser?: string;
  source?: string;
  ip?: string;
  createdAt: Date;
  updatedAt: Date;
}

const uninstallFeedbackSchema = new Schema<IUninstallFeedback>(
  {
    reason: { type: String, required: true, index: true },
    comment: { type: String, default: '' },
    email: { type: String, default: '' },
    extensionVersion: { type: String, default: '' },
    browser: { type: String, default: '' },
    source: { type: String, default: 'chrome' },
    ip: { type: String },
  },
  { timestamps: true }
);

uninstallFeedbackSchema.index({ createdAt: -1 });

export const UninstallFeedbackModel = mongoose.model<IUninstallFeedback>(
  'UninstallFeedback',
  uninstallFeedbackSchema
);
