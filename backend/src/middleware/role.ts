import type { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';
import { assertCanManageTeam } from '../lib/permissions';

type Role = 'companyAdmin' | 'teamAdmin' | 'member';

/**
 * Rol bazlı yetki kontrolü. `requireAuth` zincirinin arkasında kullanılmalı.
 * FAZ-7'de `teamAdmin` eklenince aynı middleware birden fazla rolü kabul edebilir.
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

/**
 * Takım bağlamında admin kontrolü: companyAdmin her zaman; aksi halde
 * `req.params[paramName]` (default `id`) ile belirtilen takımın TeamMember
 * kaydında `role === 'teamAdmin'` olmalı. Per-team rol DB'de yaşadığı için
 * JWT'ye güvenemeyiz — her istekte kontrol gerekir.
 *
 * @example router.post('/teams/:id/members', requireAuth, requireTeamAdmin(), controller.add);
 */
export function requireTeamAdmin(paramName = 'id') {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        next(new AppError(401, 'Geçersiz veya süresi dolmuş oturum', 'UNAUTHORIZED'));
        return;
      }
      const teamId = req.params[paramName];
      if (!teamId) {
        next(new AppError(400, 'Takım ID eksik', 'BAD_REQUEST'));
        return;
      }
      await assertCanManageTeam(req.user, teamId);
      next();
    } catch (e) {
      next(e);
    }
  };
}
