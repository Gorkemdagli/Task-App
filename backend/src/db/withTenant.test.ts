import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', () => {
  const mockExecuteRaw = vi.fn().mockResolvedValue(0);
  const tx = { $executeRaw: mockExecuteRaw };
  const mockTransaction = vi.fn(async (cb: (tx: typeof tx) => Promise<unknown>) => cb(tx));
  return {
    prisma: { $transaction: mockTransaction },
    mockExecuteRaw,
    mockTransaction,
    tx,
  };
});

import { commitThenThrow, withTenantContext } from './withTenant';
import { mockExecuteRaw, mockTransaction, tx } from '../lib/prisma';
import type { TransactionPhase } from './withTenant';
import { createRequestTiming, createTransactionPhaseRecorder } from '../http/requestTiming';

describe('withTenantContext', () => {
  beforeEach(() => {
    mockExecuteRaw.mockClear();
    mockTransaction.mockClear();
  });

  it('parametreli context SQL sırasını transaction içinde uygular', async () => {
    const work = vi.fn().mockResolvedValue('ok');
    const phases: Array<[TransactionPhase, number]> = [];

    await withTenantContext('user-uuid-123', 'tenant-uuid-456', work, {
      phaseRecorder: (phase, elapsedMs) => phases.push([phase, elapsedMs]),
    });

    expect(mockExecuteRaw).toHaveBeenCalledTimes(2);
    expect(mockExecuteRaw.mock.calls[0][0]).toEqual(['SET LOCAL ROLE authenticated']);
    expect(mockExecuteRaw.mock.calls[1][0]).toEqual([
      "SELECT set_config('app.user_id', ",
      ", true), set_config('app.tenant_id', ",
      ', true)',
    ]);
    expect(mockExecuteRaw.mock.calls[1][1]).toBe('user-uuid-123');
    expect(mockExecuteRaw.mock.calls[1][2]).toBe('tenant-uuid-456');
    expect(work).toHaveBeenCalledWith(tx);
    expect(phases.map(([phase]) => phase)).toEqual([
      'tx_open_ms',
      'role_ms',
      'context_ms',
      'callback_ms',
      'tx_finish_ms',
    ]);
    expect(phases.every(([, elapsedMs]) => Number.isFinite(elapsedMs) && elapsedMs >= 0)).toBe(
      true,
    );
  });

  it('callback hatasını transaction dışına taşır', async () => {
    const failure = new Error('rollback');
    const work = vi.fn().mockRejectedValue(failure);
    const phases: Array<[TransactionPhase, number]> = [];

    await expect(
      withTenantContext('u', 't', work, {
        phaseRecorder: (phase, elapsedMs) => phases.push([phase, elapsedMs]),
      }),
    ).rejects.toBe(failure);
    expect(phases.map(([phase]) => phase)).toEqual([
      'tx_open_ms',
      'role_ms',
      'context_ms',
      'callback_ms',
      'tx_finish_ms',
    ]);
  });

  it('records a failed combined context phase without entering the callback', async () => {
    const failure = new Error('combined context');
    const phases: TransactionPhase[] = [];
    const work = vi.fn().mockResolvedValue('unused');
    mockExecuteRaw.mockResolvedValueOnce(0).mockRejectedValueOnce(failure);

    await expect(
      withTenantContext('u', 't', work, { phaseRecorder: (phase) => phases.push(phase) }),
    ).rejects.toBe(failure);
    expect(phases).toEqual([
      'tx_open_ms',
      'role_ms',
      'context_ms',
      'tx_finish_ms',
    ]);
    expect(work).not.toHaveBeenCalled();
  });

  it('records role setup failure without entering the context or callback', async () => {
    const failure = new Error('role setup');
    const phases: TransactionPhase[] = [];
    const work = vi.fn().mockResolvedValue('unused');
    mockExecuteRaw.mockRejectedValueOnce(failure);

    await expect(
      withTenantContext('u', 't', work, { phaseRecorder: (phase) => phases.push(phase) }),
    ).rejects.toBe(failure);
    expect(phases).toEqual([
      'tx_open_ms',
      'role_ms',
      'tx_finish_ms',
    ]);
    expect(work).not.toHaveBeenCalled();
  });

  it('transaction sonucunu döner', async () => {
    const result = await withTenantContext('u', 't', async () => 42);

    expect(result).toBe(42);
  });

  it('P2034 için yeni transaction ile retry yapar', async () => {
    const conflict = Object.assign(new Error('serialization'), { code: 'P2034' });
    const phases: TransactionPhase[] = [];
    mockTransaction
      .mockImplementationOnce(async (cb) => {
        await cb(tx);
        throw conflict;
      })
      .mockImplementationOnce(async (cb) => {
        await cb(tx);
        throw conflict;
      })
      .mockImplementationOnce(async (cb) => cb(tx));

    await expect(
      withTenantContext('u', 't', async () => 'ok', {
        maxRetries: 3,
        phaseRecorder: (phase) => phases.push(phase),
      }),
    ).resolves.toBe('ok');
    expect(mockTransaction).toHaveBeenCalledTimes(3);
    expect(mockExecuteRaw).toHaveBeenCalledTimes(6);
    expect(phases.filter((phase) => phase === 'tx_open_ms')).toHaveLength(3);
    expect(phases.filter((phase) => phase === 'tx_finish_ms')).toHaveLength(3);
    expect(phases.filter((phase) => phase === 'callback_ms')).toHaveLength(3);
    expect(phases.filter((phase) => phase === 'context_ms')).toHaveLength(3);
  });

  it('retry sonrası P2034 için 409 döner', async () => {
    const conflict = Object.assign(new Error('serialization'), { code: 'P2034' });
    mockTransaction.mockImplementation(async (cb) => {
      await cb(tx);
      throw conflict;
    });

    await expect(
      withTenantContext('u', 't', async () => 'ok', { maxRetries: 3 }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'CONCURRENT_MODIFICATION',
    });
    expect(mockTransaction).toHaveBeenCalledTimes(3);
  });

  it('business error retry edilmez', async () => {
    const failure = new Error('business');
    mockTransaction.mockImplementationOnce(async (cb) => cb(tx));
    const work = vi.fn().mockRejectedValue(failure);

    await expect(withTenantContext('u', 't', work, { maxRetries: 3 })).rejects.toBe(failure);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it('commits deferred business errors before returning them', async () => {
    let committed = false;
    mockTransaction.mockImplementationOnce(async (cb) => {
      const result = await cb(tx);
      committed = true;
      return result;
    });
    const failure = new Error('commit');

    await expect(withTenantContext('u', 't', async () => commitThenThrow(failure))).rejects.toBe(
      failure,
    );
    expect(committed).toBe(true);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it('keeps concurrent transaction phases on their own request recorders', async () => {
    const slowTiming = createRequestTiming();
    const fastTiming = createRequestTiming();
    const slowRecorder = createTransactionPhaseRecorder(slowTiming, 'handler');
    const fastRecorder = createTransactionPhaseRecorder(fastTiming, 'handler');
    mockTransaction.mockImplementation(async (callback) => callback(tx));

    await Promise.all([
      withTenantContext('u1', 't1', () => new Promise((resolve) => setTimeout(resolve, 60)), {
        phaseRecorder: slowRecorder,
      }),
      withTenantContext('u2', 't2', () => new Promise((resolve) => setTimeout(resolve, 5)), {
        phaseRecorder: fastRecorder,
      }),
    ]);

    const slow = slowTiming.snapshot();
    const fast = fastTiming.snapshot();
    expect(slow.handler_callback_ms).toBeGreaterThan(fast.handler_callback_ms ?? 0);
    expect(slow).not.toHaveProperty('auth_callback_ms');
    expect(fast).not.toHaveProperty('auth_callback_ms');
  });
});
