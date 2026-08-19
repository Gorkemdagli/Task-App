import type { Request } from 'express';
import { withUserContext } from '../db/withUser';
import type { TenantTransactionOptions } from '../db/withTenant';
import type { TenantDb } from '../db/types';
import type { Actor } from '../lib/permissions';
import { AppError } from '../middleware/errorHandler';

export async function runUserRequest<T>(
  req: Request,
  work: (db: TenantDb, actor: Actor) => Promise<T>,
  options?: TenantTransactionOptions,
): Promise<T> {
  const actor = req.user;
  if (!actor) {
    throw new AppError(401, 'Geçersiz veya süresi dolmuş oturum', 'UNAUTHORIZED');
  }

  const callback = (db: TenantDb) => work(db, actor);
  return options
    ? withUserContext(actor.id, callback, options)
    : withUserContext(actor.id, callback);
}
