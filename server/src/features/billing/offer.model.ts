import mongoose, { Schema, Document } from 'mongoose';

export interface ISiteOffer extends Document {
  message: string;
  couponCode?: string | null;
  linkUrl?: string | null;
  imageUrl?: string | null;
  showBird: boolean;
  showFlag: boolean;
  active: boolean;
  startsAt?: Date | null;
  endsAt?: Date | null;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
}

const siteOfferSchema = new Schema<ISiteOffer>(
  {
    message: { type: String, required: true, maxlength: 280 },
    couponCode: { type: String, default: null, maxlength: 40 },
    linkUrl: { type: String, default: null },
    imageUrl: { type: String, default: null, maxlength: 350_000 },
    showBird: { type: Boolean, default: true },
    showFlag: { type: Boolean, default: true },
    active: { type: Boolean, default: true, index: true },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    priority: { type: Number, default: 0, index: true },
  },
  { timestamps: true }
);

siteOfferSchema.index({ active: 1, priority: -1 });

export const SiteOfferModel = mongoose.model<ISiteOffer>(
  'SiteOffer',
  siteOfferSchema
);
