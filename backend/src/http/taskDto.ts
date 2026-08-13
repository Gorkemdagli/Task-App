import { formatCalendarDate } from '../lib/calendarDate';
import type { TaskWithRelations } from '../services/tasks.service';

export type TaskDto = Omit<TaskWithRelations, 'deadline'> & {
  deadline: string | null;
};

export function toTaskDto(task: TaskWithRelations): TaskDto {
  return { ...task, deadline: formatCalendarDate(task.deadline) };
}
