import type {
  AdminCreateSiteOfferInput,
  AdminUpdateSiteOfferInput,
  SiteOffer,
} from '@cosmo/shared';
import { AppError } from '../../middleware/errorHandler';
import { SiteOfferModel, type ISiteOffer } from './offer.model';

function toPublic(doc: ISiteOffer | Record<string, unknown>): SiteOffer {
  const d = doc as ISiteOffer & { _id: { toString(): string } };
  return {
    offerId: d._id.toString(),
    message: d.message,
    couponCode: d.couponCode ?? null,
    linkUrl: d.linkUrl ?? null,
    active: d.active,
    startsAt: d.startsAt ? new Date(d.startsAt).toISOString() : null,
    endsAt: d.endsAt ? new Date(d.endsAt).toISOString() : null,
    priority: d.priority ?? 0,
    createdAt: d.createdAt
      ? new Date(d.createdAt).toISOString()
      : undefined,
    updatedAt: d.updatedAt
      ? new Date(d.updatedAt).toISOString()
      : undefined,
  };
}

function parseOptionalDate(
  value: string | null | undefined
): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return new Date(value);
}

export async function listActiveOffers(): Promise<SiteOffer[]> {
  const now = new Date();
  const docs = await SiteOfferModel.find({
    active: true,
    $and: [
      {
        $or: [{ startsAt: null }, { startsAt: { $exists: false } }, { startsAt: { $lte: now } }],
      },
      {
        $or: [{ endsAt: null }, { endsAt: { $exists: false } }, { endsAt: { $gte: now } }],
      },
    ],
  })
    .sort({ priority: -1, createdAt: -1 })
    .lean();

  return docs.map((d) => toPublic(d as unknown as ISiteOffer));
}

export async function listOffersAdmin(): Promise<SiteOffer[]> {
  const docs = await SiteOfferModel.find()
    .sort({ priority: -1, createdAt: -1 })
    .lean();
  return docs.map((d) => toPublic(d as unknown as ISiteOffer));
}

export async function createOffer(
  input: AdminCreateSiteOfferInput
): Promise<SiteOffer> {
  const linkUrl =
    input.linkUrl === '' || input.linkUrl === undefined
      ? null
      : input.linkUrl;
  const doc = await SiteOfferModel.create({
    message: input.message,
    couponCode: input.couponCode ?? null,
    linkUrl,
    active: input.active ?? true,
    startsAt: parseOptionalDate(input.startsAt) ?? null,
    endsAt: parseOptionalDate(input.endsAt) ?? null,
    priority: input.priority ?? 0,
  });
  return toPublic(doc);
}

export async function updateOffer(
  offerId: string,
  input: AdminUpdateSiteOfferInput
): Promise<SiteOffer> {
  const doc = await SiteOfferModel.findById(offerId);
  if (!doc) {
    throw new AppError('Offer not found', 404, 'NOT_FOUND');
  }

  if (input.message !== undefined) doc.message = input.message;
  if (input.couponCode !== undefined) doc.couponCode = input.couponCode;
  if (input.linkUrl !== undefined) {
    doc.linkUrl = input.linkUrl === '' ? null : input.linkUrl;
  }
  if (input.active !== undefined) doc.active = input.active;
  if (input.priority !== undefined) doc.priority = input.priority;
  if (input.startsAt !== undefined) {
    doc.startsAt = parseOptionalDate(input.startsAt) ?? null;
  }
  if (input.endsAt !== undefined) {
    doc.endsAt = parseOptionalDate(input.endsAt) ?? null;
  }

  await doc.save();
  return toPublic(doc);
}

export async function deleteOffer(offerId: string): Promise<{ deleted: true }> {
  const result = await SiteOfferModel.findByIdAndDelete(offerId);
  if (!result) {
    throw new AppError('Offer not found', 404, 'NOT_FOUND');
  }
  return { deleted: true };
}
