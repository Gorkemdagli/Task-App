import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { toRlsError } from '../db/rlsError';
import { AppError } from '../lib/appError';

export class ValidationError extends AppError {
  constructor(public issues: { path: (string | number)[]; message: string }[]) {
    super(400, 'Geçersiz istek', 'BAD_REQUEST');
    this.name = 'ValidationError';
  }
}

export function toValidationIssues(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): { path: (string | number)[]; message: string }[] {
  return issues.map((issue) => ({
    path: issue.path.map((segment) => (typeof segment === 'symbol' ? segment.toString() : segment)),
    message: issue.message,
  }));
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ValidationError) {
    res.status(400).json({ error: 'Bad Request', message: err.message, issues: err.issues });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.code ?? 'Error', message: err.message });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'Geçersiz istek',
      issues: toValidationIssues(err.issues),
    });
    return;
  }
  const rlsError = toRlsError(err);
  if (rlsError) {
    res.status(rlsError.statusCode).json({
      error: rlsError.code,
      message: rlsError.message,
    });
    return;
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal Server Error', message: 'Beklenmeyen bir hata oluştu' });
}
