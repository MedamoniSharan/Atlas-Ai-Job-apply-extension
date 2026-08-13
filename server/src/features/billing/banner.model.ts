import mongoose, { Schema, Document } from 'mongoose';

export interface ISiteBanner extends Document {
  imageUrl: string;
  linkUrl?: string | null;
  altText?: string | null;
  active: boolean;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
}

const siteBannerSchema = new Schema<ISiteBanner>(
  {
    imageUrl: { type: String, required: true, maxlength: 350_000 },
    linkUrl: { type: String, default: null },
    altText: { type: String, default: null, maxlength: 160 },
    active: { type: Boolean, default: true, index: true },
    priority: { type: Number, default: 0, index: true },
  },
  { timestamps: true }
);

siteBannerSchema.index({ active: 1, priority: -1 });

export const SiteBannerModel = mongoose.model<ISiteBanner>(
  'SiteBanner',
  siteBannerSchema
);
