import { formatCalendarDate } from '../lib/calendarDate';
import type { TaskWithRelations } from '../services/tasks.service';

export type TaskDto = Omit<TaskWithRelations, 'deadline' | 'startedAt' | 'completedAt'> & {
  deadline: string | null;
};

export function toTaskDto(task: TaskWithRelations): TaskDto {
  const publicTask = { ...task };
  Reflect.deleteProperty(publicTask, 'startedAt');
  Reflect.deleteProperty(publicTask, 'completedAt');
  return {
    ...publicTask,
    scopeItems: task.scopeItems ?? [],
    targetAudience: task.targetAudience ?? null,
    expectedOutput: task.expectedOutput ?? null,
    tags: task.tags ?? [],
    deadline: formatCalendarDate(task.deadline),
  };
}
