import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { archiveExpiredTasks } from '../services/tasks.archive';
import { runTenantRequest } from '../http/runTenantRequest';

export const adminRouter = Router();

adminRouter.use(requireAuth);

adminRouter.post(
  '/tasks/archive-expired',
  requireRole(['companyAdmin']),
  async (req, res, next) => {
    try {
      const result = await runTenantRequest(req, (db, actor) =>
        archiveExpiredTasks(db, actor.tenantId!),
      );
      res.json(result);
    } catch (e) {
      next(e);
    }
  },
);
