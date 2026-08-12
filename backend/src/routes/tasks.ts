import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { authenticatedReadLimiter, writeLimiter } from '../middleware/rateLimitProfiles';
import {
  createTaskSchema,
  updateTaskStatusSchema,
  updateTaskPrioritySchema,
  updateTaskFieldsSchema,
  listTasksQuerySchema,
  ackTaskStatusSchema,
} from '../schemas/tasks.schema';
import * as tasksService from '../services/tasks.service';
import { runTenantRequest } from '../http/runTenantRequest';
import { parseQuery } from '../http/parseQuery';

export const tasksRouter = Router();

const statusTransactionOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxRetries: 3,
} as const;

tasksRouter.use(requireAuth);

tasksRouter.post('/', writeLimiter, validateBody(createTaskSchema), async (req, res, next) => {
  try {
    const task = await runTenantRequest(req, (db, actor) =>
      tasksService.createTask(db, req.body, actor),
    );
    res.status(201).json(task);
  } catch (e) {
    next(e);
  }
});

tasksRouter.get('/', authenticatedReadLimiter, async (req, res, next) => {
  try {
    const parsed = parseQuery<Parameters<typeof tasksService.listTasks>[1]>(
      listTasksQuerySchema,
      req.query,
    );
    const result = await runTenantRequest(req, (db, actor) =>
      tasksService.listTasks(db, parsed, actor),
    );
    res.json(result);
  } catch (e) {
    next(e);
  }
});

tasksRouter.get('/:id', authenticatedReadLimiter, async (req, res, next) => {
  try {
    const task = await runTenantRequest(req, (db, actor) =>
      tasksService.getTask(db, req.params.id, actor),
    );
    res.json(task);
  } catch (e) {
    next(e);
  }
});

tasksRouter.patch(
  '/:id/status',
  writeLimiter,
  validateBody(updateTaskStatusSchema),
  async (req, res, next) => {
    try {
      const task = await runTenantRequest(
        req,
        (db, actor) => tasksService.updateTaskStatus(db, req.params.id, req.body, actor),
        statusTransactionOptions,
      );
      res.json(task);
    } catch (e) {
      next(e);
    }
  },
);

tasksRouter.post(
  '/:id/status/propose',
  writeLimiter,
  validateBody(updateTaskStatusSchema),
  async (req, res, next) => {
    try {
      const task = await runTenantRequest(
        req,
        (db, actor) => tasksService.proposeTaskStatus(db, req.params.id, req.body, actor),
        statusTransactionOptions,
      );
      res.json(task);
    } catch (e) {
      next(e);
    }
  },
);

tasksRouter.post(
  '/:id/status/ack',
  writeLimiter,
  validateBody(ackTaskStatusSchema),
  async (req, res, next) => {
    try {
      const result = await runTenantRequest(
        req,
        (db, actor) => tasksService.ackTaskStatus(db, req.params.id, req.body, actor),
        statusTransactionOptions,
      );
      res.json(result);
    } catch (e) {
      next(e);
    }
  },
);

tasksRouter.post('/:id/status/cancel', writeLimiter, async (req, res, next) => {
  try {
    const task = await runTenantRequest(
      req,
      (db, actor) => tasksService.cancelTaskStatus(db, req.params.id, actor),
      statusTransactionOptions,
    );
    res.json(task);
  } catch (e) {
    next(e);
  }
});

tasksRouter.patch(
  '/:id/priority',
  writeLimiter,
  validateBody(updateTaskPrioritySchema),
  async (req, res, next) => {
    try {
      const task = await runTenantRequest(req, (db, actor) =>
        tasksService.updateTaskPriority(db, req.params.id, req.body, actor),
      );
      res.json(task);
    } catch (e) {
      next(e);
    }
  },
);

tasksRouter.patch(
  '/:id',
  writeLimiter,
  validateBody(updateTaskFieldsSchema),
  async (req, res, next) => {
    try {
      const task = await runTenantRequest(req, (db, actor) =>
        tasksService.updateTaskFields(db, req.params.id, req.body, actor),
      );
      res.json(task);
    } catch (e) {
      next(e);
    }
  },
);

tasksRouter.delete('/:id', writeLimiter, async (req, res, next) => {
  try {
    await runTenantRequest(req, (db, actor) => tasksService.deleteTask(db, req.params.id, actor));
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
