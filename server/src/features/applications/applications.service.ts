import { Application } from '@atlas/shared';
import { ApplicationModel, IApplication } from './application.model';

function toApplication(doc: IApplication): Application {
  return {
    id: doc._id.toString(),
    eventId: doc.eventId,
    userId: doc.userId.toString(),
    platform: doc.platform,
    externalJobId: doc.externalJobId,
    title: doc.title,
    company: doc.company,
    location: doc.location,
    url: doc.url,
    status: doc.status,
    appliedAt: doc.appliedAt?.toISOString(),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export async function listApplications(
  userId: string,
  page = 1,
  limit = 20
): Promise<{ items: Application[]; total: number; page: number; limit: number }> {
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    ApplicationModel.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    ApplicationModel.countDocuments({ userId }),
  ]);

  return {
    items: items.map(toApplication),
    total,
    page,
    limit,
  };
}
