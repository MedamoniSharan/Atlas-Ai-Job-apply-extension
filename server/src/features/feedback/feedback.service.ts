import {
  uninstallFeedbackSubmitSchema,
  type UninstallFeedbackSubmit,
} from '@cosmo/shared';
import { UninstallFeedbackModel } from './uninstallFeedback.model';

export async function submitUninstallFeedback(
  input: UninstallFeedbackSubmit,
  ip?: string
) {
  const parsed = uninstallFeedbackSubmitSchema.parse(input);
  const doc = await UninstallFeedbackModel.create({
    reason: parsed.reason,
    comment: parsed.comment || '',
    email: parsed.email || '',
    extensionVersion: parsed.extensionVersion || '',
    browser: parsed.browser || '',
    source: parsed.source || 'chrome',
    ip,
  });
  return { id: doc._id.toString() };
}

export async function listUninstallFeedback(page = 1, limit = 40, reason?: string) {
  const filter = reason ? { reason } : {};
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    UninstallFeedbackModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    UninstallFeedbackModel.countDocuments(filter),
  ]);

  return {
    items: items.map((item) => ({
      id: item._id.toString(),
      reason: item.reason,
      comment: item.comment || '',
      email: item.email || '',
      extensionVersion: item.extensionVersion || '',
      browser: item.browser || '',
      source: item.source || '',
      ip: item.ip || '',
      createdAt: item.createdAt?.toISOString?.(),
    })),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}
