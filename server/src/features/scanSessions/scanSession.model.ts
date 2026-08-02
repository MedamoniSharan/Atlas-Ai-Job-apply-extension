import mongoose, { Schema, Document, Types } from 'mongoose';
import type { Platform, ScanSessionStatus } from '@cosmo/shared';

export interface IScanSession extends Document {
  sessionId: string;
  userId: Types.ObjectId;
  platform: Platform;
  keyword: string;
  status: ScanSessionStatus;
  scanned: number;
  matched: number;
  applied: number;
  skipped: number;
  pagesScanned: number;
  startedAt: Date;
  endedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const scanSessionSchema = new Schema<IScanSession>(
  {
    sessionId: { type: String, required: true },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    platform: {
      type: String,
      enum: [
        'naukri',
        'linkedin',
        'foundit',
        'indeed',
        'wellfound',
        'internshala',
        'unknown',
      ],
      default: 'naukri',
    },
    keyword: { type: String, default: '' },
    status: {
      type: String,
      enum: ['running', 'completed', 'stopped', 'failed'],
      default: 'running',
    },
    scanned: { type: Number, default: 0 },
    matched: { type: Number, default: 0 },
    applied: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    pagesScanned: { type: Number, default: 0 },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date },
  },
  { timestamps: true }
);

scanSessionSchema.index({ userId: 1, sessionId: 1 }, { unique: true });
scanSessionSchema.index({ userId: 1, startedAt: -1 });

export const ScanSessionModel = mongoose.model<IScanSession>(
  'ScanSession',
  scanSessionSchema
);
