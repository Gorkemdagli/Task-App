import type { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';

type Role = 'companyAdmin' | 'member';

/**
 * Global rol bazlı yetki kontrolü. `requireAuth` zincirinin arkasında kullanılmalı.
 *
 * @example router.post('/teams', requireAuth, requireRole(['companyAdmin']), controller.create);
 */
export function requireRole(roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError(401, 'Geçersiz veya süresi dolmuş oturum', 'UNAUTHORIZED'));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new AppError(403, 'Bu işlem için yetkiniz bulunmuyor', 'FORBIDDEN'));
      return;
    }
    next();
  };
}
