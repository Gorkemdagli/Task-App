import type { ZodTypeAny } from 'zod';
import { toValidationIssues, ValidationError } from '../middleware/errorHandler';

export function parseQuery<T>(schema: ZodTypeAny, query: unknown): T {
  const parsed = schema.safeParse(query);
  if (!parsed.success) {
    throw new ValidationError(toValidationIssues(parsed.error.issues));
  }
  return parsed.data as T;
}
