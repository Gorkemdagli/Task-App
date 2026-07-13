import { z } from 'zod';

export const taskStatusSchema = z.enum(['todo', 'in_progress', 'done']);
export const taskPrioritySchema = z.enum(['low', 'medium', 'high']);

export const createTaskSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(5000).optional(),
  deadline: z.coerce.date().optional(),
  priority: taskPrioritySchema,
  assigneeId: z.string().uuid(),
  teamId: z.string().uuid(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskStatusSchema = z.object({
  status: taskStatusSchema,
});
export type UpdateTaskStatusInput = z.infer<typeof updateTaskStatusSchema>;

export const updateTaskPrioritySchema = z.object({
  priority: taskPrioritySchema,
});
export type UpdateTaskPriorityInput = z.infer<typeof updateTaskPrioritySchema>;

export const updateTaskFieldsSchema = z
  .object({
    title: z.string().trim().min(3).max(200).optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    deadline: z.coerce.date().nullable().optional(),
    assigneeId: z.string().uuid().optional(),
  })
  .refine(
    (v) =>
      v.title !== undefined ||
      v.description !== undefined ||
      v.deadline !== undefined ||
      v.assigneeId !== undefined,
    { message: 'En az bir alan güncellenmeli' },
  );
export type UpdateTaskFieldsInput = z.infer<typeof updateTaskFieldsSchema>;

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
  assigneeId: z.string().uuid().optional(),
  deadlineFrom: z.coerce.date().optional(),
  deadlineTo: z.coerce.date().optional(),
  includeArchived: z
    .union([z.literal('true'), z.literal('false')])
    .transform((v) => v === 'true')
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
