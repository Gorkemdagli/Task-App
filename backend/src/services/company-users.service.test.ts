import { describe, expect, it, vi } from 'vitest';
import type { TenantDb } from '../db/types';
import { listCompanyUsers, updateCompanyPermissions } from './company-users.service';

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
});
