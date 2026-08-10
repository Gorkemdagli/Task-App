import type { Request } from 'express';
import { withTenantContext } from '../db/withTenant';
import type { TenantDb } from '../db/types';
import { type Actor, requireTenant } from '../lib/permissions';
import { AppError } from '../middleware/errorHandler';

export async function runTenantRequest<T>(
  req: Request,
  work: (db: TenantDb, actor: Actor) => Promise<T>,
): Promise<T> {
  const actor = req.user;
  if (!actor) {
    throw new AppError(401, 'Geçersiz veya süresi dolmuş oturum', 'UNAUTHORIZED');
  }

  const tenantId = requireTenant(actor);
  return withTenantContext(actor.id, tenantId, (db) => work(db, actor));
}
