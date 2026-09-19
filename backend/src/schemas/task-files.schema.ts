import { z } from 'zod';

export const taskFileTaskParamsSchema = z.object({ taskId: z.string().uuid() }).strict();
export type TaskFileTaskParams = z.infer<typeof taskFileTaskParamsSchema>;

export const taskFileParamsSchema = z
  .object({ taskId: z.string().uuid(), fileId: z.string().min(1).max(64) })
  .strict();
export type TaskFileParams = z.infer<typeof taskFileParamsSchema>;
