import { formatCalendarDate } from '../lib/calendarDate';
import type { TaskWithRelations } from '../services/tasks.service';

export type TaskDto = Omit<TaskWithRelations, 'deadline' | 'startedAt' | 'completedAt'> & {
  deadline: string | null;
};

export function toTaskDto(task: TaskWithRelations): TaskDto {
  const publicTask = { ...task };
  Reflect.deleteProperty(publicTask, 'startedAt');
  Reflect.deleteProperty(publicTask, 'completedAt');
  return { ...publicTask, deadline: formatCalendarDate(task.deadline) };
}
