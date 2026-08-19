import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request } from 'express';

const { withUserContext } = vi.hoisted(() => ({ withUserContext: vi.fn() }));

vi.mock('../db/withUser', () => ({ withUserContext }));

import { runUserRequest } from './runUserRequest';

const actor = {
  id: 'user-id',
  role: 'member' as const,
  tenantId: null,
};

function reqWith(user?: typeof actor): Request {
  return { user } as Request;
}

describe('runUserRequest', () => {
  beforeEach(() => {
    withUserContext.mockReset();
  });

  it('returns 401 UNAUTHORIZED without authenticated actor', async () => {
    const work = vi.fn();

    await expect(runUserRequest(reqWith(), work)).rejects.toMatchObject({
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
    expect(withUserContext).not.toHaveBeenCalled();
  });

  it('invokes work with identity-scoped transaction and actor', async () => {
    const tx = {};
    const work = vi.fn().mockResolvedValue('done');
    withUserContext.mockImplementation(async (_userId, callback) => callback(tx));

    await expect(runUserRequest(reqWith(actor), work)).resolves.toBe('done');

    expect(withUserContext).toHaveBeenCalledWith('user-id', expect.any(Function));
    expect(work).toHaveBeenCalledWith(tx, actor);
  });

  it('forwards transaction options', async () => {
    const tx = {};
    const work = vi.fn().mockResolvedValue('done');
    withUserContext.mockImplementation(async (_userId, callback) => callback(tx));

    await runUserRequest(reqWith(actor), work, { maxRetries: 3 });

    expect(withUserContext).toHaveBeenCalledWith('user-id', expect.any(Function), {
      maxRetries: 3,
    });
  });
});
