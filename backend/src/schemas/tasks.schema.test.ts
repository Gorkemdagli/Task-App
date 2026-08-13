import { describe, expect, it } from 'vitest';
import { createTaskSchema, listTasksQuerySchema, updateTaskFieldsSchema } from './tasks.schema';

const baseTask = {
  title: 'Calendar task',
  priority: 'medium' as const,
  assigneeIds: ['11111111-1111-4111-8111-111111111111'],
  teamId: '22222222-2222-4222-8222-222222222222',
};

describe('task calendar-date schema', () => {
  it('parses valid create and filter dates at UTC midnight', () => {
    const create = createTaskSchema.parse({ ...baseTask, deadline: '2026-08-13' });
    const query = listTasksQuerySchema.parse({
      deadlineFrom: '2026-08-13',
      deadlineTo: '2026-08-14',
    });

    expect(create.deadline?.toISOString()).toBe('2026-08-13T00:00:00.000Z');
    expect(query.deadlineFrom?.toISOString()).toBe('2026-08-13T00:00:00.000Z');
    expect(query.deadlineTo?.toISOString()).toBe('2026-08-14T00:00:00.000Z');
  });

  it('rejects datetime strings on create, update, and filters', () => {
    const datetime = '2026-08-13T00:00:00.000Z';

    expect(() => createTaskSchema.parse({ ...baseTask, deadline: datetime })).toThrow();
    expect(() => updateTaskFieldsSchema.parse({ deadline: datetime })).toThrow();
    expect(() => listTasksQuerySchema.parse({ deadlineFrom: datetime })).toThrow();
  });
});
