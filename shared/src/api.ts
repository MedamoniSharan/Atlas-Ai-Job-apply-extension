import { z } from 'zod';

export const apiSuccessSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    message: z.string(),
    data: dataSchema,
    error: z.null(),
  });

export const apiErrorSchema = z.object({
  success: z.literal(false),
  message: z.string(),
  data: z.null(),
  error: z
    .object({
      code: z.string().optional(),
      details: z.unknown().optional(),
    })
    .nullable(),
});

export type ApiSuccess<T> = {
  success: true;
  message: string;
  data: T;
  error: null;
};

export type ApiError = z.infer<typeof apiErrorSchema>;

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export function ok<T>(data: T, message = 'Operation completed'): ApiSuccess<T> {
  return { success: true, message, data, error: null };
}

export function fail(
  message: string,
  error: ApiError['error'] = null
): ApiError {
  return { success: false, message, data: null, error };
}
