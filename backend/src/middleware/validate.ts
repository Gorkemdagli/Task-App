import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';
import { ValidationError } from './errorHandler';

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const r = schema.safeParse(req.body);
    if (!r.success) {
      return next(
        new ValidationError(r.error.issues.map((i) => ({ path: i.path, message: i.message }))),
      );
    }
    req.body = r.data;
    next();
  };
}
