import { describe, expect, it } from 'vitest';
import { createInitialDemoState, demoReducer } from './demoState';

describe('landing demo state', () => {
  it('starts in guided board mode with fixed TaskFlow columns', () => {
    const state = createInitialDemoState();

    expect(state).toMatchObject({
      mode: 'guided',
      activeBeat: 0,
      view: 'board',
      selectedTaskId: null,
    });
    expect(new Set(state.tasks.map((task) => task.status))).toEqual(
      new Set(['todo', 'in-progress', 'done']),
    );
  });

  it('moves a task only among fixed statuses', () => {
    const initial = createInitialDemoState();
    const next = demoReducer(initial, {
      type: 'move-task',
      taskId: 'task-auth-flow',
      status: 'done',
    });

    expect(next.mode).toBe('manual');
    expect(next.tasks.find((task) => task.id === 'task-auth-flow')?.status).toBe('done');
  });

  it('does not let guided scroll overwrite manual state', () => {
    const manual = demoReducer(createInitialDemoState(), { type: 'set-view', view: 'tasks' });

    expect(manual).toMatchObject({ mode: 'manual', view: 'tasks' });

    const next = demoReducer(manual, { type: 'apply-guided-beat', beat: 1 });

    expect(next).toBe(manual);
  });

  it('applies each guided beat deterministically', () => {
    const initial = createInitialDemoState();
    const beatOne = demoReducer(initial, { type: 'apply-guided-beat', beat: 1 });
    const beatTwo = demoReducer(beatOne, { type: 'apply-guided-beat', beat: 2 });

    expect(beatOne).toMatchObject({
      activeBeat: 1,
      activeTeamId: 'team-platform',
      view: 'board',
      selectedTaskId: 'task-auth-flow',
    });
    expect(beatOne.tasks.find((task) => task.id === 'task-auth-flow')?.status).toBe('in-progress');
    expect(beatTwo).toMatchObject({
      activeBeat: 2,
      activeTeamId: 'team-platform',
      view: 'tasks',
      selectedTaskId: 'task-auth-flow',
    });
  });

  it('returns the same state for unknown team and task ids', () => {
    const initial = createInitialDemoState();

    expect(demoReducer(initial, { type: 'select-team', teamId: 'team-missing' })).toBe(initial);
    expect(
      demoReducer(initial, {
        type: 'move-task',
        taskId: 'task-missing',
        status: 'done',
      }),
    ).toBe(initial);
  });

  it('resets the fixture and resumes guided mode', () => {
    const moved = demoReducer(createInitialDemoState(), {
      type: 'move-task',
      taskId: 'task-auth-flow',
      status: 'done',
    });

    expect(moved.mode).toBe('manual');
    expect(moved.tasks.find((task) => task.id === 'task-auth-flow')?.status).toBe('done');

    expect(demoReducer(moved, { type: 'reset' })).toEqual(createInitialDemoState());
  });
});
