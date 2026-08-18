import type { ZodTypeAny } from 'zod';
import { ValidationError } from '../middleware/errorHandler';

export function parseQuery<T>(schema: ZodTypeAny, query: unknown): T {
  const parsed = schema.safeParse(query);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
    );
  }
  return parsed.data as T;
}
