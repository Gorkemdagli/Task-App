import type { Request, Response, NextFunction } from 'express';
import type { ZodType } from 'zod';
import { toValidationIssues, ValidationError } from './errorHandler';

export function validateBody<Output, Input>(schema: ZodType<Output, Input>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const r = schema.safeParse(req.body);
    if (!r.success) {
      return next(new ValidationError(toValidationIssues(r.error.issues)));
    }
    req.body = r.data;
    next();
  };
}
