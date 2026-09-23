import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { toRlsError } from './rlsError';

describe('toRlsError', () => {
  it('returns null for non-Prisma errors', () => {
    expect(toRlsError(new Error('permission denied'))).toBeNull();
  });

  it.each([
    [
      'SQL permission code',
      new Prisma.PrismaClientKnownRequestError('query failed', {
        code: 'P2010',
        clientVersion: '7.10.0',
        meta: { code: '42501' },
      }),
    ],
    [
      'row-level security message',
      new Prisma.PrismaClientKnownRequestError('violates row-level security policy', {
        code: 'P2010',
        clientVersion: '7.10.0',
      }),
    ],
    [
      'permission-denied message',
      new Prisma.PrismaClientKnownRequestError('permission denied for table tasks', {
        code: 'P2010',
        clientVersion: '7.10.0',
      }),
    ],
  ])('maps %s to forbidden', (_case, error) => {
    expect(toRlsError(error)).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('returns null for unrelated Prisma errors', () => {
    expect(
      toRlsError(
        new Prisma.PrismaClientKnownRequestError('unique constraint failed', {
          code: 'P2002',
          clientVersion: '7.10.0',
        }),
      ),
    ).toBeNull();
  });
});
