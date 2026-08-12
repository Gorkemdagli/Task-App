import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { authenticatedReadLimiter, writeLimiter } from '../middleware/rateLimitProfiles';
import { createCommentSchema } from '../schemas/comments.schema';
import * as commentsService from '../services/comments.service';
import { runTenantRequest } from '../http/runTenantRequest';

export const commentsRouter = Router({ mergeParams: true });

commentsRouter.use(requireAuth);

commentsRouter.post(
  '/',
  writeLimiter,
  validateBody(createCommentSchema),
  async (req, res, next) => {
    try {
      const { taskId } = req.params as { taskId: string };
      const comment = await runTenantRequest(req, (db, actor) =>
        commentsService.createComment(db, taskId, req.body, actor),
      );
      res.status(201).json(comment);
    } catch (e) {
      next(e);
    }
  },
);

commentsRouter.get('/', authenticatedReadLimiter, async (req, res, next) => {
  try {
    const { taskId } = req.params as { taskId: string };
    const comments = await runTenantRequest(req, (db, actor) =>
      commentsService.listComments(db, taskId, actor),
    );
    res.json({ comments });
  } catch (e) {
    next(e);
  }
});
