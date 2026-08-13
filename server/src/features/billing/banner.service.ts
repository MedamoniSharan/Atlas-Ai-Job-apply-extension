import type {
  AdminCreateSiteBannerInput,
  AdminUpdateSiteBannerInput,
  SiteBanner,
} from '@cosmo/shared';
import { AppError } from '../../middleware/errorHandler';
import { SiteBannerModel, type ISiteBanner } from './banner.model';

function toPublic(doc: ISiteBanner | Record<string, unknown>): SiteBanner {
  const d = doc as ISiteBanner & { _id: { toString(): string } };
  return {
    bannerId: d._id.toString(),
    imageUrl: d.imageUrl,
    linkUrl: d.linkUrl ?? null,
    altText: d.altText ?? null,
    active: d.active,
    priority: d.priority ?? 0,
    createdAt: d.createdAt
      ? new Date(d.createdAt).toISOString()
      : undefined,
    updatedAt: d.updatedAt
      ? new Date(d.updatedAt).toISOString()
      : undefined,
  };
}

export async function listActiveBanners(): Promise<SiteBanner[]> {
  const docs = await SiteBannerModel.find({ active: true })
    .sort({ priority: -1, createdAt: -1 })
    .lean();
  return docs.map((d) => toPublic(d as unknown as ISiteBanner));
}

export async function listBannersAdmin(): Promise<SiteBanner[]> {
  const docs = await SiteBannerModel.find()
    .sort({ priority: -1, createdAt: -1 })
    .lean();
  return docs.map((d) => toPublic(d as unknown as ISiteBanner));
}

export async function createBanner(
  input: AdminCreateSiteBannerInput
): Promise<SiteBanner> {
  const linkUrl =
    input.linkUrl === '' || input.linkUrl === undefined
      ? null
      : input.linkUrl;
  const doc = await SiteBannerModel.create({
    imageUrl: input.imageUrl,
    linkUrl,
    altText: input.altText ?? null,
    active: input.active ?? true,
    priority: input.priority ?? 0,
  });
  return toPublic(doc);
}

export async function updateBanner(
  bannerId: string,
  input: AdminUpdateSiteBannerInput
): Promise<SiteBanner> {
  const doc = await SiteBannerModel.findById(bannerId);
  if (!doc) {
    throw new AppError('Banner not found', 404, 'NOT_FOUND');
  }

  if (input.imageUrl !== undefined) doc.imageUrl = input.imageUrl;
  if (input.linkUrl !== undefined) {
    doc.linkUrl = input.linkUrl === '' ? null : input.linkUrl;
  }
  if (input.altText !== undefined) doc.altText = input.altText;
  if (input.active !== undefined) doc.active = input.active;
  if (input.priority !== undefined) doc.priority = input.priority;

  await doc.save();
  return toPublic(doc);
}

export async function deleteBanner(
  bannerId: string
): Promise<{ deleted: true }> {
  const result = await SiteBannerModel.findByIdAndDelete(bannerId);
  if (!result) {
    throw new AppError('Banner not found', 404, 'NOT_FOUND');
  }
  return { deleted: true };
}
