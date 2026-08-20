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

export const createTaskSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(5000).optional(),
  deadline: calendarDateSchema.optional(),
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

export const updateTaskFieldsSchema = z
  .object({
    title: z.string().trim().min(3).max(200).optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    deadline: calendarDateSchema.nullable().optional(),
    assigneeIds: z.array(z.string().uuid()).min(1).optional(),
  })
  .refine(
    (v) =>
      v.title !== undefined ||
      v.description !== undefined ||
      v.deadline !== undefined ||
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
