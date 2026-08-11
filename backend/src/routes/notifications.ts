import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { listNotificationsQuerySchema } from '../schemas/notifications.schema';
import { listNotifications, markAllRead } from '../services/notifications.service';
import { runTenantRequest } from '../http/runTenantRequest';
import { parseQuery } from '../http/parseQuery';

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

// GET /api/v1/notifications?cursor=&limit=
notificationsRouter.get('/', async (req, res, next) => {
  try {
    const parsed = parseQuery<Parameters<typeof listNotifications>[2]>(
      listNotificationsQuerySchema,
      req.query,
    );
    const result = await runTenantRequest(req, (db, actor) => listNotifications(db, actor, parsed));
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
