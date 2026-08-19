import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', () => {
  const mockExecuteRaw = vi.fn().mockResolvedValue(0);
  const tx = { $executeRaw: mockExecuteRaw };
  const mockTransaction = vi.fn(async (callback: (db: typeof tx) => Promise<unknown>) =>
    callback(tx),
  );
  return {
    prisma: { $transaction: mockTransaction },
    mockExecuteRaw,
    mockTransaction,
    tx,
  };
});

import { withUserContext } from './withUser';
import { mockExecuteRaw, mockTransaction, tx } from '../lib/prisma';

describe('withUserContext', () => {
  beforeEach(() => {
    mockExecuteRaw.mockClear();
    mockTransaction.mockClear();
  });

  it('sets authenticated role and identity context before callback', async () => {
    const work = vi.fn().mockResolvedValue('ok');

    await withUserContext('user-uuid-123', work);

    expect(mockExecuteRaw).toHaveBeenCalledTimes(2);
    expect(mockExecuteRaw.mock.calls[0][0]).toEqual(['SET LOCAL ROLE authenticated']);
    expect(mockExecuteRaw.mock.calls[1][0]).toEqual([
      "SELECT set_config('app.user_id', ",
      ', true)',
    ]);
    expect(mockExecuteRaw.mock.calls[1][1]).toBe('user-uuid-123');
    expect(work).toHaveBeenCalledWith(tx);
  });

  it('rolls callback error out of transaction', async () => {
    const failure = new Error('rollback');

    await expect(withUserContext('u', async () => Promise.reject(failure))).rejects.toBe(failure);
  });

  it('returns transaction callback result', async () => {
    await expect(withUserContext('u', async () => 42)).resolves.toBe(42);
  });

  it('retries serialization conflict in a new transaction', async () => {
    const conflict = Object.assign(new Error('serialization'), { code: 'P2034' });
    mockTransaction
      .mockImplementationOnce(async (callback) => {
        await callback(tx);
        throw conflict;
      })
      .mockImplementationOnce(async (callback) => callback(tx));

    await expect(withUserContext('u', async () => 'ok', { maxRetries: 2 })).resolves.toBe('ok');
    expect(mockTransaction).toHaveBeenCalledTimes(2);
  });

  it('returns concurrent modification after serialization retries exhaust', async () => {
    const conflict = Object.assign(new Error('serialization'), { code: 'P2034' });
    mockTransaction.mockImplementation(async (callback) => {
      await callback(tx);
      throw conflict;
    });

    await expect(withUserContext('u', async () => 'ok', { maxRetries: 2 })).rejects.toMatchObject({
      statusCode: 409,
      code: 'CONCURRENT_MODIFICATION',
    });
    expect(mockTransaction).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-serialization errors', async () => {
    const failure = new Error('business');
    const work = vi.fn().mockRejectedValue(failure);

    await expect(withUserContext('u', work, { maxRetries: 3 })).rejects.toBe(failure);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });
});
