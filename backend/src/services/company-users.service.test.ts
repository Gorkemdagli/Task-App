import { describe, expect, it, vi } from 'vitest';
import type { TenantDb } from '../db/types';
import {
  addCompanyUser,
  listCompanyUsers,
  updateCompanyRole,
  updateCompanyPermissions,
} from './company-users.service';

function mockDb() {
  return {
    user: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    team: { findMany: vi.fn() },
    teamMember: { upsert: vi.fn(), deleteMany: vi.fn() },
  } as unknown as TenantDb;
}

const admin = { id: 'admin', role: 'companyAdmin' as const, tenantId: 'tenant-a' };

describe('company users service', () => {
  it('lists only actor tenant users in deterministic order', async () => {
    const db = mockDb();
    vi.mocked(db.user.findMany).mockResolvedValue([]);

    await expect(listCompanyUsers(db, admin)).resolves.toEqual([]);
    expect(db.user.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a' },
      select: {
        id: true,
        displayId: true,
        email: true,
        fullName: true,
        avatarUrl: true,
        role: true,
        teamMembers: {
          where: { team: { tenantId: 'tenant-a' } },
          select: {
            teamId: true,
            role: true,
            team: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
    });
  });

  it('blocks non-admin role updates', async () => {
    const db = mockDb();
    await expect(
      updateCompanyRole(db, 'user-b', { role: 'companyAdmin' }, { ...admin, role: 'member' }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('blocks self role updates before target lookup', async () => {
    const db = mockDb();
    await expect(updateCompanyRole(db, 'admin', { role: 'member' }, admin)).rejects.toMatchObject({
      statusCode: 403,
      code: 'SELF_ROLE_CHANGE_FORBIDDEN',
    });
    expect(db.user.findFirst).not.toHaveBeenCalled();
  });

  it('scopes target lookup to actor tenant', async () => {
    const db = mockDb();
    vi.mocked(db.user.findFirst).mockResolvedValue(null);

    await expect(
      updateCompanyRole(db, 'user-b', { role: 'companyAdmin' }, admin),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
    expect(db.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'user-b', tenantId: 'tenant-a' },
      select: { id: true },
    });
  });

  it('assigns multiple tenant teams atomically and removes omitted memberships', async () => {
    const db = mockDb();
    vi.mocked(db.user.findFirst)
      .mockResolvedValueOnce({ id: 'user-b' } as never)
      .mockResolvedValueOnce({
        id: 'user-b',
        displayId: 'B1234',
        email: 'b@example.com',
        fullName: 'User B',
        avatarUrl: null,
        role: 'member',
        teamMembers: [
          { teamId: 'team-a', role: 'teamAdmin', team: { id: 'team-a', name: 'Alpha' } },
          { teamId: 'team-b', role: 'member', team: { id: 'team-b', name: 'Beta' } },
        ],
      } as never);
    vi.mocked(db.team.findMany).mockResolvedValue([{ id: 'team-a' }, { id: 'team-b' }] as never);
    vi.mocked(db.user.update).mockResolvedValue({
      id: 'user-b',
      displayId: 'B1234',
      email: 'b@example.com',
      fullName: 'User B',
      avatarUrl: null,
      role: 'member',
      teamMembers: [
        { teamId: 'team-a', role: 'teamAdmin', team: { id: 'team-a', name: 'Alpha' } },
        { teamId: 'team-b', role: 'member', team: { id: 'team-b', name: 'Beta' } },
      ],
    } as never);

    await expect(
      updateCompanyPermissions(
        db,
        'user-b',
        {
          role: 'member',
          teamRoles: [
            { teamId: 'team-a', role: 'teamAdmin' },
            { teamId: 'team-b', role: 'member' },
          ],
        },
        admin,
      ),
    ).resolves.toMatchObject({ id: 'user-b', teamRoles: expect.any(Array) });

    expect(db.team.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a', id: { in: ['team-a', 'team-b'] } },
      select: { id: true },
    });
    expect(db.teamMember.upsert).toHaveBeenCalledTimes(2);
    expect(db.teamMember.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-b',
        team: { tenantId: 'tenant-a' },
        teamId: { notIn: ['team-a', 'team-b'] },
      },
    });
  });

  it('rejects a team outside actor tenant', async () => {
    const db = mockDb();
    vi.mocked(db.user.findFirst).mockResolvedValue({ id: 'user-b' } as never);
    vi.mocked(db.team.findMany).mockResolvedValue([]);

    await expect(
      updateCompanyPermissions(
        db,
        'user-b',
        { role: 'member', teamRoles: [{ teamId: 'team-other', role: 'teamAdmin' }] },
        admin,
      ),
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('claims tenantless user with fixed member role and no team roles', async () => {
    const db = mockDb();
    vi.mocked(db.user.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(db.user.findFirst).mockResolvedValue({
      id: 'user-b',
      displayId: 'B1234',
      email: 'b@example.com',
      fullName: 'User B',
      avatarUrl: null,
      role: 'member',
    } as never);

    await expect(addCompanyUser(db, admin, { displayId: 'B1234' })).resolves.toEqual({
      id: 'user-b',
      displayId: 'B1234',
      email: 'b@example.com',
      fullName: 'User B',
      avatarUrl: null,
      role: 'member',
      teamRoles: [],
    });
    expect(db.user.updateMany).toHaveBeenCalledWith({
      where: { displayId: 'B1234', tenantId: null },
      data: { tenantId: 'tenant-a', role: 'member' },
    });
    expect(db.user.findFirst).toHaveBeenCalledWith({
      where: { displayId: 'B1234', tenantId: 'tenant-a' },
      select: {
        id: true,
        displayId: true,
        email: true,
        fullName: true,
        avatarUrl: true,
        role: true,
      },
    });
  });

  it('distinguishes same-tenant conflict without foreign lookup', async () => {
    const db = mockDb();
    vi.mocked(db.user.updateMany).mockResolvedValue({ count: 0 });
    vi.mocked(db.user.findFirst).mockResolvedValue({ id: 'user-b' } as never);

    await expect(addCompanyUser(db, admin, { displayId: 'B1234' })).rejects.toMatchObject({
      statusCode: 409,
      code: 'USER_ALREADY_IN_COMPANY',
    });
    expect(db.user.findFirst).toHaveBeenCalledWith({
      where: { displayId: 'B1234', tenantId: 'tenant-a' },
      select: { id: true },
    });
  });

  it('uses same 404 for missing and foreign targets', async () => {
    const db = mockDb();
    vi.mocked(db.user.updateMany).mockResolvedValue({ count: 0 });
    vi.mocked(db.user.findFirst).mockResolvedValue(null);

    await expect(addCompanyUser(db, admin, { displayId: 'B1234' })).rejects.toMatchObject({
      statusCode: 404,
      code: 'USER_NOT_FOUND',
    });
    expect(db.user.findFirst).toHaveBeenCalledTimes(1);
  });
});
