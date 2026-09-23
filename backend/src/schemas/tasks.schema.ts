import { z } from 'zod';
import { parseCalendarDate } from '../lib/calendarDate';

const calendarDateSchema = z.string().transform((value, ctx) => {
  try {
    return parseCalendarDate(value);
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Tarih YYYY-MM-DD formatında olmalı',
    });
    return z.NEVER;
  }
});

export const taskStatusSchema = z.enum(['todo', 'in_progress', 'done']);
export const taskPrioritySchema = z.enum(['low', 'medium', 'high']);
const estimateMinutesSchema = z.number().int().min(0).max(2147483647).nullable().optional();
const scopeItemsSchema = z.array(z.string().trim().min(1).max(240)).max(20);
const taskDetailTextSchema = z.string().trim().max(2000).nullable().optional();
const taskTagsSchema = z.array(z.string().trim().min(1).max(32)).max(10).transform((tags) => {
  const uniqueTags = new Map<string, string>();
  for (const tag of tags) {
    const key = tag.toLocaleLowerCase('tr-TR');
    if (!uniqueTags.has(key)) uniqueTags.set(key, tag);
  }
  return Array.from(uniqueTags.values());
});

export const createTaskSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(5000).optional(),
  scopeItems: scopeItemsSchema.optional(),
  expectedOutput: taskDetailTextSchema,
  deadline: calendarDateSchema.optional(),
  estimateMinutes: estimateMinutesSchema,
  priority: taskPrioritySchema,
  assigneeIds: z.array(z.string().uuid()).min(1),
  teamId: z.string().uuid(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskStatusSchema = z.object({
  status: taskStatusSchema,
});
export type UpdateTaskStatusInput = z.infer<typeof updateTaskStatusSchema>;

export const ackTaskStatusSchema = z.object({
  pendingVersion: z.number().int().positive(),
});
export type AckTaskStatusInput = z.infer<typeof ackTaskStatusSchema>;

export const updateTaskPrioritySchema = z.object({
  priority: taskPrioritySchema,
});
export type UpdateTaskPriorityInput = z.infer<typeof updateTaskPrioritySchema>;

export const updateTaskBlockedSchema = z.object({
  isBlocked: z.boolean(),
  blockedReason: z.string().trim().max(500).nullable().optional(),
});
export type UpdateTaskBlockedInput = z.infer<typeof updateTaskBlockedSchema>;

export const taskIdParamsSchema = z.object({ id: z.string().uuid() }).strict();
export type TaskIdParams = z.infer<typeof taskIdParamsSchema>;

export const updateTaskFieldsSchema = z
  .object({
    title: z.string().trim().min(3).max(200).optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    scopeItems: scopeItemsSchema.optional(),
    targetAudience: taskDetailTextSchema,
    expectedOutput: taskDetailTextSchema,
    tags: taskTagsSchema.optional(),
    deadline: calendarDateSchema.nullable().optional(),
    estimateMinutes: estimateMinutesSchema,
    assigneeIds: z.array(z.string().uuid()).min(1).optional(),
  })
  .refine(
    (v) =>
      v.title !== undefined ||
      v.description !== undefined ||
      v.scopeItems !== undefined ||
      v.targetAudience !== undefined ||
      v.expectedOutput !== undefined ||
      v.tags !== undefined ||
      v.deadline !== undefined ||
      v.estimateMinutes !== undefined ||
      v.assigneeIds !== undefined,
    { message: 'En az bir alan güncellenmeli' },
  );
export type UpdateTaskFieldsInput = z.infer<typeof updateTaskFieldsSchema>;

export const restoreTaskSchema = z.object({
  deadline: calendarDateSchema,
});
export type RestoreTaskInput = z.infer<typeof restoreTaskSchema>;

export const listTasksQuerySchema = z.object({
  status: z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v : v.split(',')))
    .pipe(z.array(taskStatusSchema))
    .optional(),
  priority: z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v : v.split(',')))
    .pipe(z.array(taskPrioritySchema))
    .optional(),
  teamId: z.string().uuid().optional(),
  assigneeIds: z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v : v.split(',')))
    .pipe(z.array(z.string().uuid()))
    .optional(),
  deadlineFrom: calendarDateSchema.optional(),
  deadlineTo: calendarDateSchema.optional(),
  includeArchived: z
    .union([z.literal('true'), z.literal('false')])
    .transform((v) => v === 'true')
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
