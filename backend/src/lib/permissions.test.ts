import { describe, expect, it, vi } from 'vitest';
import type { TenantDb } from '../db/types';
import { assertCanManageTeam, getTeamRole, type Actor } from './permissions';

const actor: Actor = { id: 'user-a', role: 'member', tenantId: 'tenant-a' };

function mockDb() {
  return {
    team: { findFirst: vi.fn() },
    teamMember: { findUnique: vi.fn() },
  } as unknown as TenantDb;
}

describe('tenant-scoped permissions', () => {
  it('uses the supplied transaction client for team role lookup', async () => {
    const db = mockDb();
    const findUnique = vi.mocked(db.teamMember.findUnique);
    findUnique.mockResolvedValue({ role: 'teamAdmin' } as never);

    await expect(getTeamRole(db, 'team-a', actor.id)).resolves.toBe('teamAdmin');
    expect(findUnique).toHaveBeenCalledWith({
      where: { teamId_userId: { teamId: 'team-a', userId: 'user-a' } },
      select: { role: true },
    });
  });

  it('returns 404 before authorization for another tenant team', async () => {
    const db = mockDb();
    vi.mocked(db.team.findFirst).mockResolvedValue(null);

    await expect(assertCanManageTeam(db, actor, 'team-b')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
    expect(db.teamMember.findUnique).not.toHaveBeenCalled();
  });
});
