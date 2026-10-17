import type { Request } from 'express';
import { withTenantContext, type TenantTransactionOptions } from '../db/withTenant';
import type { TenantDb } from '../db/types';
import { type Actor, requireTenant } from '../lib/permissions';
import { AppError } from '../lib/appError';
import { createTransactionPhaseRecorder, measureRequestStage } from './requestTiming';

export async function runTenantRequest<T>(
  req: Request,
  work: (db: TenantDb, actor: Actor) => Promise<T>,
  options?: TenantTransactionOptions,
): Promise<T> {
  const actor = req.user;
  if (!actor) {
    throw new AppError(401, 'Geçersiz veya süresi dolmuş oturum', 'UNAUTHORIZED');
  }

  const tenantId = requireTenant(actor);
  const callback = (db: TenantDb) => work(db, actor);
  const phaseRecorder = createTransactionPhaseRecorder(req.requestTiming, 'handler');
  const transactionOptions = phaseRecorder ? { ...options, phaseRecorder } : options;
  return measureRequestStage(req.requestTiming, 'handler_db_ms', () =>
    transactionOptions
      ? withTenantContext(actor.id, tenantId, callback, transactionOptions)
      : withTenantContext(actor.id, tenantId, callback),
  );
}
