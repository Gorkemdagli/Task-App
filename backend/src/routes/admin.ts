import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { archiveExpiredTasks } from '../services/tasks.archive';

export const adminRouter = Router();

adminRouter.use(requireAuth);

adminRouter.post(
  '/tasks/archive-expired',
  requireRole(['companyAdmin']),
  async (_req, res, next) => {
    try {
      const result = await archiveExpiredTasks();
      res.json(result);
    } catch (e) {
      next(e);
    }
  },
);
