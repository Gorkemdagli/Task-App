import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  runArchiveBatch: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock('../archive-batch', () => ({ runArchiveBatch: state.runArchiveBatch }));
vi.mock('../lib/maintenancePrisma', () => ({
  maintenancePrisma: { $disconnect: state.disconnect },
}));

describe('one-shot archive command', () => {
  let previousExitCode: number | undefined;

  beforeEach(() => {
    vi.resetModules();
    state.runArchiveBatch.mockReset();
    state.disconnect.mockReset();
    previousExitCode = process.exitCode;
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = previousExitCode;
    vi.restoreAllMocks();
  });

  it('reports batch failure with a nonzero exit code and disconnects', async () => {
    const error = new Error('archive batch failed');
    state.runArchiveBatch.mockRejectedValue(error);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { runArchiveOnce } = await import('../archive-once');
    await runArchiveOnce();

    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith('[archive-worker] failed', error);
    expect(state.disconnect).toHaveBeenCalledOnce();
  });

  it('reports the archived count and disconnects after a successful batch', async () => {
    state.runArchiveBatch.mockResolvedValue({ archivedCount: 3 });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const { runArchiveOnce } = await import('../archive-once');
    await runArchiveOnce();

    expect(process.exitCode).toBeUndefined();
    expect(logSpy).toHaveBeenCalledWith('[archive-worker] completed archived=3');
    expect(state.disconnect).toHaveBeenCalledOnce();
  });
});
