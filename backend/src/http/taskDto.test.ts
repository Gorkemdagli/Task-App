import { describe, expect, it } from 'vitest';
import { toTaskDto } from './taskDto';
import type { TaskWithRelations } from '../services/tasks.service';

describe('toTaskDto', () => {
  it('serializes deadline as a calendar date', () => {
    const task = { deadline: new Date('2026-08-13T00:00:00.000Z') } as TaskWithRelations;

    expect(toTaskDto(task).deadline).toBe('2026-08-13');
  });
});
