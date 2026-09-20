import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { uploadTaskFile } from '../middleware/taskFileUpload';
import { authenticatedReadLimiter, uploadLimiter, writeLimiter } from '../middleware/rateLimitProfiles';
import { parseQuery } from '../http/parseQuery';
import { runTenantRequest } from '../http/runTenantRequest';
import {
  taskFileParamsSchema,
  taskFileTaskParamsSchema,
  type TaskFileParams,
  type TaskFileTaskParams,
} from '../schemas/task-files.schema';
import { createTaskFileStorage } from '../lib/taskFileStorage';
import { logger } from '../lib/logger';
import * as taskFilesService from '../services/task-files.service';
import { AppError } from '../lib/appError';

export const taskFilesRouter = Router();

taskFilesRouter.use(requireAuth);

taskFilesRouter.get('/:taskId/files', authenticatedReadLimiter, async (req, res, next) => {
  try {
    const { taskId } = parseQuery<TaskFileTaskParams>(taskFileTaskParamsSchema, req.params);
    const files = await runTenantRequest(req, (db, actor) =>
      taskFilesService.listTaskFiles(db, taskId, actor),
    );
    res.json({ files });
  } catch (error) {
    next(error);
  }
});

taskFilesRouter.post(
  '/:taskId/files',
  uploadLimiter,
  uploadTaskFile,
  async (req, res, next) => {
    try {
      const { taskId } = parseQuery<TaskFileTaskParams>(taskFileTaskParamsSchema, req.params);
      if (!req.file) throw new AppError(400, 'File is required', 'FILE_REQUIRED');
      const storage = createTaskFileStorage();
      const file = await runTenantRequest(req, (db, actor) =>
        taskFilesService.createTaskFileRecord(
          db,
          taskId,
          {
            originalName: req.file!.originalname,
            mimeType: req.file!.mimetype,
            sizeBytes: req.file!.size,
            data: req.file!.buffer,
          },
          actor,
          storage,
        ),
      );
      res.status(201).json(file);
    } catch (error) {
      next(error);
    }
  },
);

taskFilesRouter.post('/:taskId/files/:fileId/download', authenticatedReadLimiter, async (req, res, next) => {
  try {
    const { taskId, fileId } = parseQuery<TaskFileParams>(taskFileParamsSchema, req.params);
    const result = await runTenantRequest(req, async (db, actor) => {
      const path = await taskFilesService.createTaskFileDownload(db, taskId, fileId, actor);
      return createTaskFileStorage().createDownloadUrl(path);
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

taskFilesRouter.delete('/:taskId/files/:fileId', writeLimiter, async (req, res, next) => {
  try {
    const { taskId, fileId } = parseQuery<TaskFileParams>(taskFileParamsSchema, req.params);
    const path = await runTenantRequest(req, (db, actor) =>
      taskFilesService.markTaskFileDeleted(db, taskId, fileId, actor),
    );
    try {
      await createTaskFileStorage().remove(path);
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : 'unknown' },
        'task file deletion cleanup failed',
      );
      throw error;
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
