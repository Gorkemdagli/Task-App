import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  findTenants: vi.fn(),
  transaction: vi.fn(),
  archive: vi.fn(),
  schedule: vi.fn(),
}));

vi.mock('../lib/maintenancePrisma', () => ({
  maintenancePrisma: {
    tenant: { findMany: state.findTenants },
    $transaction: state.transaction,
  },
}));
vi.mock('../services/tasks.archive', () => ({
  archiveExpiredTasks: state.archive,
}));
vi.mock('node-cron', () => ({ default: { schedule: state.schedule } }));

describe('archive worker isolation', () => {
  beforeEach(() => {
    vi.resetModules();
    state.findTenants.mockReset();
    state.transaction.mockReset();
    state.archive.mockReset();
    state.schedule.mockReset();
  });

  it('registers the hourly job and runs the archive batch from its callback', async () => {
    const job = { start: vi.fn() };
    let callback: (() => void) | undefined;
    state.findTenants.mockResolvedValue([]);
    state.schedule.mockImplementation((_expression, scheduledCallback) => {
      callback = scheduledCallback;
      return job;
    });

    const { startArchiveWorker } = await import('../archive-worker');
    expect(startArchiveWorker()).toBe(job);
    expect(state.schedule).toHaveBeenCalledWith('0 * * * *', expect.any(Function));

    callback?.();
    expect(state.findTenants).toHaveBeenCalledWith({ select: { id: true } });
  });

  it('continues with the next tenant after a batch failure', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    state.findTenants.mockResolvedValue([{ id: 'tenant-a' }, { id: 'tenant-b' }]);
    state.transaction.mockImplementation((work: (db: unknown) => Promise<unknown>) => work({}));
    state.archive.mockImplementation(async (_db: unknown, tenantId: string) => {
      if (tenantId === 'tenant-a') throw new Error('tenant-a failed');
      return { archivedCount: 2 };
    });

    const { runArchiveBatch } = await import('../archive-worker');
    await expect(runArchiveBatch()).resolves.toEqual({ archivedCount: 2 });

    expect(state.archive).toHaveBeenCalledWith(expect.anything(), 'tenant-a');
    expect(state.archive).toHaveBeenCalledWith(expect.anything(), 'tenant-b');
    errorSpy.mockRestore();
  });

  it('keeps the web entrypoint free of worker-only dependencies', () => {
    const indexSource = readFileSync(resolve(__dirname, '../index.ts'), 'utf8');

    expect(indexSource).not.toContain('node-cron');
    expect(indexSource).not.toContain('tasks.archive');
    expect(indexSource).not.toContain('MAINTENANCE_DATABASE_URL');
    expect(indexSource).not.toContain('maintenancePrisma');
  });
});
