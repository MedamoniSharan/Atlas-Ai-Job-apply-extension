import {
  JobPreferences,
  preferencesAreComplete,
  resolveJobPreferences,
} from '@cosmo/shared';
import { UserModel } from '../users/user.model';
import { AppError } from '../../middleware/errorHandler';

function normalizePreferences(
  raw: Partial<JobPreferences> | null | undefined
): JobPreferences {
  return resolveJobPreferences(raw);
}

export async function getPreferences(userId: string): Promise<JobPreferences> {
  const user = await UserModel.findById(userId).lean();
  if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');
  return normalizePreferences(user.preferences);
}

export async function updatePreferences(
  userId: string,
  prefs: JobPreferences
): Promise<{ preferences: JobPreferences; preferencesCompleted: boolean }> {
  if (prefs.experienceMin > prefs.experienceMax) {
    throw new AppError(
      'experienceMin cannot exceed experienceMax',
      400,
      'VALIDATION_ERROR'
    );
  }
  if (!preferencesAreComplete(prefs)) {
    throw new AppError(
      'Add at least 3 job titles and 4 keywords',
      400,
      'VALIDATION_ERROR'
    );
  }

  const completed = preferencesAreComplete(prefs);
  const user = await UserModel.findByIdAndUpdate(
    userId,
    {
      $set: {
        preferences: prefs,
        preferencesCompletedAt: completed ? new Date() : null,
      },
    },
    { new: true }
  ).lean();

  if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');

  const preferences = normalizePreferences(user.preferences);
  return {
    preferences,
    preferencesCompleted:
      completed || Boolean(user.preferencesCompletedAt),
  };
}
