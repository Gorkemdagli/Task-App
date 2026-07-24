import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { createRateLimit } from '../middleware/rateLimit';
import { ValidationError } from '../middleware/errorHandler';
import {
  createTaskSchema,
  updateTaskStatusSchema,
  updateTaskPrioritySchema,
  updateTaskFieldsSchema,
  listTasksQuerySchema,
} from '../schemas/tasks.schema';
import * as tasksService from '../services/tasks.service';

export const tasksRouter = Router();

const writeLimiter = createRateLimit({
  windowMs: 60_000,
  max: 30,
  keyPrefix: 'rl:tasks-write',
});

tasksRouter.use(requireAuth);

tasksRouter.post('/', writeLimiter, validateBody(createTaskSchema), async (req, res, next) => {
  try {
    const task = await tasksService.createTask(req.body, req.user!);
    res.status(201).json(task);
  } catch (e) {
    next(e);
  }
});

tasksRouter.get('/', async (req, res, next) => {
  try {
    const parsed = listTasksQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
      );
    }
    const result = await tasksService.listTasks(parsed.data, req.user!);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

tasksRouter.get('/:id', async (req, res, next) => {
  try {
    const task = await tasksService.getTask(req.params.id, req.user!);
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
      const task = await tasksService.updateTaskStatus(req.params.id, req.body, req.user!);
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
      const task = await tasksService.proposeTaskStatus(req.params.id, req.body, req.user!);
      res.json(task);
    } catch (e) {
      next(e);
    }
  },
);

tasksRouter.post('/:id/status/ack', writeLimiter, async (req, res, next) => {
  try {
    const result = await tasksService.ackTaskStatus(req.params.id, req.user!);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

tasksRouter.post('/:id/status/cancel', writeLimiter, async (req, res, next) => {
  try {
    const task = await tasksService.cancelTaskStatus(req.params.id, req.user!);
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
      const task = await tasksService.updateTaskPriority(req.params.id, req.body, req.user!);
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
      const task = await tasksService.updateTaskFields(req.params.id, req.body, req.user!);
      res.json(task);
    } catch (e) {
      next(e);
    }
  },
);

tasksRouter.delete('/:id', writeLimiter, async (req, res, next) => {
  try {
    await tasksService.deleteTask(req.params.id, req.user!);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
