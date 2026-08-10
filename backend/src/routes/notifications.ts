import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { ValidationError } from '../middleware/errorHandler';
import { listNotificationsQuerySchema } from '../schemas/notifications.schema';
import { listNotifications, markAllRead } from '../services/notifications.service';
import { runTenantRequest } from '../http/runTenantRequest';

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

// GET /api/v1/notifications?cursor=&limit=
notificationsRouter.get('/', async (req, res, next) => {
  try {
    const parsed = listNotificationsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
      );
    }
    const result = await runTenantRequest(req, (db, actor) =>
      listNotifications(db, actor, { limit: parsed.data.limit, cursor: parsed.data.cursor }),
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/notifications/read-all
notificationsRouter.patch('/read-all', async (req, res, next) => {
  try {
    await runTenantRequest(req, (db, actor) => markAllRead(db, actor));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
