import { describe, expect, it } from 'vitest';
import {
  deriveCumulativeFlow,
  type CumulativeFlowRow,
} from './company-dashboard.service';

const periodStart = new Date('2026-08-18T00:00:00.000Z');
const periodEnd = new Date('2026-08-21T00:00:00.000Z');

function row(
  taskId: string,
  createdAt: string,
  event: Partial<CumulativeFlowRow> = {},
): CumulativeFlowRow {
  return {
    task_id: taskId,
    created_at: new Date(createdAt),
    archived_at: null,
    started_at: null,
    completed_at: null,
    is_blocked: false,
    status: 'todo',
    event_id: null,
    event_created_at: null,
    event_type: null,
    event_to_status: null,
    ...event,
  };
}

describe('cumulative flow reconstruction', () => {
  it('reconstructs daily states in event/id order and ignores pending proposals', () => {
    const result = deriveCumulativeFlow(
      [
        row('task-a', '2026-08-17T12:00:00.000Z', {
          status: 'in_progress',
          event_id: 'b',
          event_created_at: new Date('2026-08-18T10:00:00.000Z'),
          event_type: 'status_changed',
          event_to_status: 'in_progress',
        }),
        row('task-a', '2026-08-17T12:00:00.000Z', {
          event_id: 'a',
          event_created_at: new Date('2026-08-18T10:00:00.000Z'),
          event_type: 'status_changed',
          event_to_status: 'done',
        }),
        row('task-b', '2026-08-19T12:00:00.000Z', {
          event_id: 'pending',
          event_created_at: new Date('2026-08-20T10:00:00.000Z'),
          event_type: 'task_blocked',
          event_to_status: 'in_progress',
        }),
      ],
      periodStart,
      periodEnd,
      new Date('2026-08-20T12:00:00.000Z'),
    );

    expect(result.samples).toEqual([
      { date: '2026-08-18', todo: 0, inProgress: 1, done: 0 },
      { date: '2026-08-19', todo: 1, inProgress: 1, done: 0 },
      { date: '2026-08-20', todo: 1, inProgress: 1, done: 0 },
    ]);
  });

  it('handles reopen, archived samples, and null bottleneck denominators', () => {
    const result = deriveCumulativeFlow(
      [
        row('task-a', '2026-08-17T12:00:00.000Z', {
          event_id: '1',
          event_created_at: new Date('2026-08-18T10:00:00.000Z'),
          event_type: 'status_changed',
          event_to_status: 'done',
        }),
        row('task-a', '2026-08-17T12:00:00.000Z', {
          event_id: '2',
          event_created_at: new Date('2026-08-19T10:00:00.000Z'),
          event_type: 'task_reopened',
          event_to_status: 'in_progress',
        }),
        row('task-b', '2026-08-18T12:00:00.000Z', {
          archived_at: new Date('2026-08-19T12:00:00.000Z'),
        }),
      ],
      periodStart,
      periodEnd,
      new Date('2026-08-20T12:00:00.000Z'),
    );

    expect(result.samples).toEqual([
      { date: '2026-08-18', todo: 1, inProgress: 0, done: 1 },
      { date: '2026-08-19', todo: 0, inProgress: 1, done: 0 },
      { date: '2026-08-20', todo: 0, inProgress: 1, done: 0 },
    ]);
    expect(result.bottleneck.blockedRate).toBe(0);
    expect(result.bottleneck.inProgressGrowthPct).toBeNull();
  });

  it('ages reopened work from its latest entry into in-progress', () => {
    const result = deriveCumulativeFlow(
      [
        row('long-running', '2026-07-01T00:00:00.000Z', {
          status: 'in_progress',
          started_at: new Date('2026-07-20T00:00:00.000Z'),
          event_id: 'long-start',
          event_created_at: new Date('2026-07-20T00:00:00.000Z'),
          event_type: 'status_changed',
          event_to_status: 'in_progress',
        }),
        row('reopened', '2026-07-01T00:00:00.000Z', {
          status: 'in_progress',
          started_at: new Date('2026-07-20T00:00:00.000Z'),
          event_id: 'reopened',
          event_created_at: new Date('2026-08-19T00:00:00.000Z'),
          event_type: 'task_reopened',
          event_to_status: 'in_progress',
        }),
      ],
      periodStart,
      periodEnd,
      new Date('2026-08-20T12:00:00.000Z'),
    );

    expect(result.bottleneck.agingInProgressCount).toBe(1);
  });

  it('includes open status intervals and leaves incomplete lead time unmeasured', () => {
    const result = deriveCumulativeFlow(
      [
        row('done-task', '2026-08-01T00:00:00.000Z', {
          started_at: new Date('2026-08-02T00:00:00.000Z'),
          completed_at: new Date('2026-08-04T00:00:00.000Z'),
          event_id: 'done-start',
          event_created_at: new Date('2026-08-02T00:00:00.000Z'),
          event_type: 'status_changed',
          event_to_status: 'in_progress',
        }),
        row('done-task', '2026-08-01T00:00:00.000Z', {
          started_at: new Date('2026-08-02T00:00:00.000Z'),
          completed_at: new Date('2026-08-04T00:00:00.000Z'),
          event_id: 'done-finish',
          event_created_at: new Date('2026-08-04T00:00:00.000Z'),
          event_type: 'status_changed',
          event_to_status: 'done',
        }),
        row('open-task', '2026-08-19T00:00:00.000Z'),
      ],
      periodStart,
      periodEnd,
      new Date('2026-08-20T12:00:00.000Z'),
    );

    expect(result.statusDurations).toEqual({
      todo: { unit: 'days', median: 1.25, sampleSize: 2 },
      inProgress: { unit: 'days', median: 1, sampleSize: 2 },
      timeBeforeCompletion: { unit: 'days', median: 3, sampleSize: 1 },
    });
  });

  it('only reports cycle degradation when both equal periods have enough samples', () => {
    const rows = Array.from({ length: 10 }, (_, index) => {
      const current = index >= 5;
      const startedAt = current ? '2026-08-17T00:00:00.000Z' : '2026-08-15T00:00:00.000Z';
      const completedAt = current ? '2026-08-19T00:00:00.000Z' : '2026-08-16T00:00:00.000Z';
      return row(`cycle-${index}`, '2026-08-01T00:00:00.000Z', {
        status: 'done',
        started_at: new Date(startedAt),
        completed_at: new Date(completedAt),
      });
    });

    expect(deriveCumulativeFlow(rows, periodStart, periodEnd, new Date('2026-08-20T12:00:00.000Z')).bottleneck.cycleDegradationPct).toBe(100);
  });

  it('caps an archived open interval at archivedAt', () => {
    const result = deriveCumulativeFlow(
      [
        row('archived-open', '2026-08-01T00:00:00.000Z', {
          archived_at: new Date('2026-08-05T00:00:00.000Z'),
          started_at: new Date('2026-08-02T00:00:00.000Z'),
          status: 'in_progress',
          event_id: 'started',
          event_created_at: new Date('2026-08-02T00:00:00.000Z'),
          event_type: 'status_changed',
          event_to_status: 'in_progress',
        }),
      ],
      periodStart,
      periodEnd,
      new Date('2026-08-20T12:00:00.000Z'),
    );

    expect(result.statusDurations.inProgress).toEqual({ unit: 'days', median: 3, sampleSize: 1 });
  });
});
