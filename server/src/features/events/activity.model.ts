import mongoose, { Schema, Document, Types } from 'mongoose';
import type { EventType, SyncStatus } from '@atlas/shared';

export interface IActivity extends Document {
  eventId: string;
  userId: Types.ObjectId;
  type: EventType;
  payload: Record<string, unknown>;
  syncStatus: SyncStatus;
  createdAt: Date;
  updatedAt: Date;
}

const activitySchema = new Schema<IActivity>(
  {
    eventId: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, default: {} },
    syncStatus: {
      type: String,
      enum: ['pending', 'syncing', 'synced', 'failed'],
      default: 'synced',
    },
  },
  { timestamps: true }
);

activitySchema.index({ userId: 1, eventId: 1 }, { unique: true });

export const ActivityModel = mongoose.model<IActivity>('Activity', activitySchema);
