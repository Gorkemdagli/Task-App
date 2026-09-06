import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantDb } from '../db/types';
import { addCompanyInvitationSchema } from '../schemas/company-invitations.schema';
import {
  acceptInvitation,
  cancelInvitation,
  createInvitation,
  listCompanyInvitations,
  listMyInvitations,
  rejectInvitation,
} from './company-invitations.service';

const admin = { id: 'admin-a', role: 'companyAdmin' as const, tenantId: 'tenant-a' };
const recipient = { id: 'user-b', role: 'member' as const, tenantId: null };
const now = new Date('2026-08-19T12:00:00.000Z');

function invitation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'invitation-a',
    tenantId: 'tenant-a',
    recipientUserId: 'user-b',
    invitedByUserId: 'admin-a',
    status: 'pending',
    companyName: 'Acme',
    inviterName: 'Admin A',
    createdAt: new Date('2026-08-19T10:00:00.000Z'),
    expiresAt: new Date('2026-08-26T10:00:00.000Z'),
    respondedAt: null,
    cancelledAt: null,
    recipient: {
      id: 'user-b',
      displayId: 'KMU24',
      email: 'user@example.com',
      fullName: 'User B',
    },
    ...overrides,
  };
}

function mockDb() {
  return {
    user: { findFirst: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
    tenant: { findFirst: vi.fn() },
    companyInvitation: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    $executeRaw: vi.fn(),
  } as unknown as TenantDb;
}

describe('company invitation schema', () => {
  it('normalizes strict email and display ID identifiers', () => {
    expect(addCompanyInvitationSchema.safeParse({ email: ' User@Example.COM ' }).data).toEqual({
      email: 'user@example.com',
    });
    expect(addCompanyInvitationSchema.safeParse({ displayId: ' kmu24 ' }).data).toEqual({
      displayId: 'KMU24',
    });
    expect(
      addCompanyInvitationSchema.safeParse({ email: 'a@b.com', status: 'accepted' }).success,
    ).toBe(false);
    expect(
      addCompanyInvitationSchema.safeParse({ email: 'a@b.com', displayId: 'KMU24' }).success,
    ).toBe(false);
    expect(
      addCompanyInvitationSchema.safeParse({ displayId: 'KMU24', tenantId: 'tenant-a' }).success,
    ).toBe(false);
  });
});

describe('company invitations service', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the same not-found error for missing and foreign targets', async () => {
    const db = mockDb();
    vi.mocked(db.user.findFirst).mockResolvedValue(null);

    await expect(createInvitation(db, admin, { displayId: 'KMU24' })).rejects.toMatchObject({
      statusCode: 404,
      code: 'USER_NOT_FOUND',
    });
    expect(db.user.findFirst).toHaveBeenLastCalledWith({
      where: { displayId: 'KMU24', tenantId: 'tenant-a' },
      select: { id: true },
    });
  });

  it('rejects a target already in the actor company', async () => {
    const db = mockDb();
    vi.mocked(db.user.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'user-b' } as never);

    await expect(createInvitation(db, admin, { displayId: 'KMU24' })).rejects.toMatchObject({
      statusCode: 409,
      code: 'USER_ALREADY_IN_COMPANY',
    });
  });

  it('creates an invitation without changing tenantless recipient membership', async () => {
    const db = mockDb();
    vi.mocked(db.user.findFirst)
      .mockResolvedValueOnce({
        id: 'user-b',
        displayId: 'KMU24',
        email: 'user@example.com',
        fullName: 'User B',
      } as never)
      .mockResolvedValueOnce({ fullName: 'Admin A' } as never);
    vi.mocked(db.tenant.findFirst).mockResolvedValue({ name: 'Acme' } as never);
    vi.mocked(db.companyInvitation.create).mockResolvedValue(invitation() as never);

    await expect(createInvitation(db, admin, { displayId: 'KMU24' })).resolves.toMatchObject({
      recipientUserId: 'user-b',
      status: 'pending',
      companyName: 'Acme',
    });
    expect(db.user.updateMany).not.toHaveBeenCalled();
    expect(db.companyInvitation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-a',
          recipientUserId: 'user-b',
          invitedByUserId: 'admin-a',
          status: 'pending',
        }),
      }),
    );
  });

  it('creates invitations with an exact seven-day lifetime', async () => {
    const db = mockDb();
    vi.mocked(db.user.findFirst)
      .mockResolvedValueOnce({
        id: 'user-b',
        displayId: 'KMU24',
        email: 'user@example.com',
        fullName: 'User B',
      } as never)
      .mockResolvedValueOnce({ fullName: 'Admin A' } as never);
    vi.mocked(db.tenant.findFirst).mockResolvedValue({ name: 'Acme' } as never);
    vi.mocked(db.companyInvitation.create).mockResolvedValue(invitation() as never);

    await createInvitation(db, admin, { displayId: 'KMU24' });
    expect(db.companyInvitation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ expiresAt: new Date('2026-08-26T12:00:00.000Z') }),
      }),
    );
  });

  it('expires a stale pending invitation before creating a replacement', async () => {
    const db = mockDb();
    vi.mocked(db.user.findFirst)
      .mockResolvedValueOnce({
        id: 'user-b',
        displayId: 'KMU24',
        email: 'user@example.com',
        fullName: 'User B',
      } as never)
      .mockResolvedValueOnce({ fullName: 'Admin A' } as never);
    vi.mocked(db.tenant.findFirst).mockResolvedValue({ name: 'Acme' } as never);
    vi.mocked(db.companyInvitation.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(db.companyInvitation.create).mockResolvedValue(invitation() as never);

    await expect(createInvitation(db, admin, { displayId: 'KMU24' })).resolves.toMatchObject({
      status: 'pending',
    });
    expect(db.companyInvitation.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        recipientUserId: 'user-b',
        status: 'pending',
        expiresAt: { lte: expect.any(Date) },
      },
      data: { status: 'expired' },
    });
  });

  it('maps duplicate pending invitations to a conflict', async () => {
    const db = mockDb();
    vi.mocked(db.user.findFirst)
      .mockResolvedValueOnce({
        id: 'user-b',
        displayId: 'KMU24',
        email: 'user@example.com',
        fullName: 'User B',
      } as never)
      .mockResolvedValueOnce({ fullName: 'Admin A' } as never);
    vi.mocked(db.tenant.findFirst).mockResolvedValue({ name: 'Acme' } as never);
    vi.mocked(db.companyInvitation.create).mockRejectedValue({ code: 'P2002' });

    await expect(createInvitation(db, admin, { displayId: 'KMU24' })).rejects.toMatchObject({
      statusCode: 409,
      code: 'INVITATION_ALREADY_PENDING',
    });
  });

  it('lists only pending invitations in the admin tenant', async () => {
    const db = mockDb();
    vi.mocked(db.companyInvitation.findMany).mockResolvedValue([invitation()] as never);

    await expect(listCompanyInvitations(db, admin)).resolves.toHaveLength(1);
    expect(db.companyInvitation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-a', status: 'pending' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
  });

  it('lists recipient-owned pending invitations and expires stale rows', async () => {
    const db = mockDb();
    vi.mocked(db.companyInvitation.findMany).mockResolvedValue([invitation()] as never);

    await expect(listMyInvitations(db, recipient)).resolves.toHaveLength(1);
    expect(db.companyInvitation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ recipientUserId: 'user-b', status: 'pending' }),
        data: { status: 'expired' },
      }),
    );
    expect(db.companyInvitation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ recipientUserId: 'user-b', status: 'pending' }),
      }),
    );
  });

  it('cancels only a pending tenant invitation', async () => {
    const db = mockDb();
    vi.mocked(db.companyInvitation.findFirst)
      .mockResolvedValueOnce(invitation() as never)
      .mockResolvedValueOnce(invitation({ status: 'cancelled', cancelledAt: now }) as never);
    vi.mocked(db.companyInvitation.updateMany).mockResolvedValue({ count: 1 });

    await expect(cancelInvitation(db, admin, 'invitation-a')).resolves.toMatchObject({
      status: 'cancelled',
    });
    expect(db.companyInvitation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'invitation-a', tenantId: 'tenant-a' } }),
    );
    expect(db.companyInvitation.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'invitation-a',
        tenantId: 'tenant-a',
        status: 'pending',
        expiresAt: { gt: expect.any(Date) },
      },
      data: { status: 'cancelled', cancelledAt: expect.any(Date) },
    });
    expect(db.companyInvitation.update).not.toHaveBeenCalled();
  });

  it('returns expired when cancellation loses a race after the invitation expires', async () => {
    const db = mockDb();
    vi.mocked(db.companyInvitation.findFirst)
      .mockResolvedValueOnce(invitation() as never)
      .mockResolvedValueOnce(
        invitation({ expiresAt: new Date('2026-08-18T12:00:00.000Z') }) as never,
      );
    vi.mocked(db.companyInvitation.updateMany)
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    await expect(cancelInvitation(db, admin, 'invitation-a')).rejects.toMatchObject({
      statusCode: 410,
      code: 'INVITATION_EXPIRED',
    });
    expect(db.companyInvitation.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'invitation-a',
        tenantId: 'tenant-a',
        status: 'pending',
        expiresAt: { lte: expect.any(Date) },
      },
      data: { status: 'expired' },
    });
  });

  it('rejects without claiming recipient membership', async () => {
    const db = mockDb();
    vi.mocked(db.companyInvitation.findFirst)
      .mockResolvedValueOnce(invitation() as never)
      .mockResolvedValueOnce(invitation({ status: 'rejected', respondedAt: now }) as never);
    vi.mocked(db.companyInvitation.updateMany).mockResolvedValue({ count: 1 });

    await expect(rejectInvitation(db, recipient, 'invitation-a')).resolves.toMatchObject({
      status: 'rejected',
    });
    expect(db.user.updateMany).not.toHaveBeenCalled();
    expect(db.companyInvitation.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'invitation-a',
        recipientUserId: 'user-b',
        status: 'pending',
        expiresAt: { gt: expect.any(Date) },
      },
      data: { status: 'rejected', respondedAt: expect.any(Date) },
    });
    expect(db.companyInvitation.update).not.toHaveBeenCalled();
  });

  it('returns expired when rejection loses a race after the invitation expires', async () => {
    const db = mockDb();
    vi.mocked(db.companyInvitation.findFirst)
      .mockResolvedValueOnce(invitation() as never)
      .mockResolvedValueOnce(
        invitation({ expiresAt: new Date('2026-08-18T12:00:00.000Z') }) as never,
      );
    vi.mocked(db.companyInvitation.updateMany)
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    await expect(rejectInvitation(db, recipient, 'invitation-a')).rejects.toMatchObject({
      statusCode: 410,
      code: 'INVITATION_EXPIRED',
    });
    expect(db.companyInvitation.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'invitation-a',
        recipientUserId: 'user-b',
        status: 'pending',
        expiresAt: { lte: expect.any(Date) },
      },
      data: { status: 'expired' },
    });
  });

  it('does not expose an invitation owned by another recipient', async () => {
    const db = mockDb();
    vi.mocked(db.companyInvitation.findFirst).mockResolvedValue(null);

    await expect(rejectInvitation(db, recipient, 'foreign-invitation')).rejects.toMatchObject({
      statusCode: 404,
      code: 'INVITATION_NOT_FOUND',
    });
    expect(db.companyInvitation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'foreign-invitation', recipientUserId: 'user-b' },
      }),
    );
    expect(db.companyInvitation.updateMany).not.toHaveBeenCalled();
  });

  it('returns expired for an expired recipient invitation acceptance', async () => {
    const db = mockDb();
    vi.mocked(db.companyInvitation.findFirst).mockResolvedValue(
      invitation({ expiresAt: new Date('2026-08-18T12:00:00.000Z') }) as never,
    );
    vi.mocked(db.companyInvitation.updateMany).mockResolvedValue({ count: 1 });

    await expect(acceptInvitation(db, recipient, 'invitation-a')).rejects.toMatchObject({
      statusCode: 410,
      code: 'INVITATION_EXPIRED',
    });
    expect(db.user.updateMany).not.toHaveBeenCalled();
    expect(db.$executeRaw).not.toHaveBeenCalled();
    expect(db.companyInvitation.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'invitation-a',
        recipientUserId: 'user-b',
        status: 'pending',
        expiresAt: { lte: expect.any(Date) },
      },
      data: { status: 'expired' },
    });
  });

  it('returns expired when the stored invitation status is expired', async () => {
    const db = mockDb();
    vi.mocked(db.companyInvitation.findFirst).mockResolvedValue(
      invitation({ status: 'expired' }) as never,
    );

    await expect(acceptInvitation(db, recipient, 'invitation-a')).rejects.toMatchObject({
      statusCode: 410,
      code: 'INVITATION_EXPIRED',
    });
    expect(db.companyInvitation.updateMany).not.toHaveBeenCalled();
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  it('expires without leaving the recipient claimed when acceptance loses an expiry race', async () => {
    const db = mockDb();
    vi.mocked(db.companyInvitation.findFirst)
      .mockResolvedValueOnce(invitation() as never)
      .mockResolvedValueOnce(
        invitation({ expiresAt: new Date('2026-08-18T12:00:00.000Z') }) as never,
      );
    vi.mocked(db.user.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(db.companyInvitation.updateMany)
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    await expect(acceptInvitation(db, recipient, 'invitation-a')).rejects.toMatchObject({
      statusCode: 410,
      code: 'INVITATION_EXPIRED',
    });
    expect(db.companyInvitation.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'invitation-a',
        recipientUserId: 'user-b',
        status: 'pending',
        expiresAt: { lte: expect.any(Date) },
      },
      data: { status: 'expired' },
    });
    expect(
      vi
        .mocked(db.$executeRaw)
        .mock.calls.some(
          ([query]) => Array.isArray(query) && query[0].includes('ROLLBACK TO SAVEPOINT'),
        ),
    ).toBe(true);
  });

  it('atomically claims the owning tenantless recipient and accepts with response fields only', async () => {
    const db = mockDb();
    const accepted = invitation({ status: 'accepted', respondedAt: now });
    vi.mocked(db.companyInvitation.findFirst)
      .mockResolvedValueOnce(invitation() as never)
      .mockResolvedValueOnce(accepted as never);
    vi.mocked(db.companyInvitation.updateMany)
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    vi.mocked(db.user.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(db.user.findFirst).mockResolvedValue({
      id: 'user-b',
      displayId: 'KMU24',
      email: 'user@example.com',
      fullName: 'User B',
      role: 'member',
      tenantId: 'tenant-a',
      tenant: { name: 'Acme' },
    } as never);

    await expect(acceptInvitation(db, recipient, 'invitation-a')).resolves.toMatchObject({
      invitation: { id: 'invitation-a', status: 'accepted' },
      user: {
        id: 'user-b',
        displayId: 'KMU24',
        email: 'user@example.com',
        fullName: 'User B',
        role: 'member',
        tenantId: 'tenant-a',
        tenantName: 'Acme',
      },
    });
    expect(db.companyInvitation.findFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { id: 'invitation-a', recipientUserId: 'user-b' } }),
    );
    expect(db.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-b', tenantId: null },
      data: { tenantId: 'tenant-a', role: 'member' },
    });
    expect(db.companyInvitation.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: 'invitation-a',
        recipientUserId: 'user-b',
        status: 'pending',
        expiresAt: { gt: expect.any(Date) },
      },
      data: { status: 'accepted', respondedAt: expect.any(Date) },
    });
    expect(db.companyInvitation.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        recipientUserId: 'user-b',
        status: 'pending',
        id: { not: 'invitation-a' },
      },
      data: { status: 'expired' },
    });
  });

  it('expires the invitation when the recipient is no longer tenantless', async () => {
    const db = mockDb();
    vi.mocked(db.companyInvitation.findFirst).mockResolvedValue(invitation() as never);
    vi.mocked(db.user.updateMany).mockResolvedValue({ count: 0 });
    vi.mocked(db.companyInvitation.updateMany).mockResolvedValue({ count: 1 });

    await expect(acceptInvitation(db, recipient, 'invitation-a')).rejects.toMatchObject({
      statusCode: 409,
      code: 'INVITATION_TARGET_NOT_AVAILABLE',
    });
    expect(db.companyInvitation.updateMany).toHaveBeenCalledWith({
      where: { id: 'invitation-a', recipientUserId: 'user-b', status: 'pending' },
      data: { status: 'expired' },
    });
  });

  it('returns expired when an unavailable target sees a concurrently expired invitation', async () => {
    const db = mockDb();
    vi.mocked(db.companyInvitation.findFirst)
      .mockResolvedValueOnce(invitation() as never)
      .mockResolvedValueOnce(invitation({ status: 'expired' }) as never);
    vi.mocked(db.user.updateMany).mockResolvedValue({ count: 0 });

    await expect(acceptInvitation(db, recipient, 'invitation-a')).rejects.toMatchObject({
      statusCode: 410,
      code: 'INVITATION_EXPIRED',
    });
    expect(db.companyInvitation.updateMany).not.toHaveBeenCalled();
  });
});
