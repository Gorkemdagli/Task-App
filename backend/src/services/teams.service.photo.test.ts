import { describe, expect, it, vi } from 'vitest';
import type { TenantDb } from '../db/types';
import type { Actor } from '../lib/permissions';

const permissions = vi.hoisted(() => ({
  assertCanManageTeam: vi.fn(),
  isCompanyAdmin: vi.fn(),
  requireTenant: vi.fn(),
}));

vi.mock('../lib/permissions', () => permissions);

import { replaceTeamPhoto } from './teams.service';

describe('replaceTeamPhoto', () => {
  it('returns the updated summary without a fallible read after the write', async () => {
    const previous = {
      id: 'team-1',
      name: 'Design',
      description: 'Design team',
      photoUrl: 'https://cdn.test/old.webp',
      tenantId: 'tenant-1',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      _count: { members: 2 },
    };
    const findFirst = vi.fn()
      .mockResolvedValueOnce(previous)
      .mockRejectedValueOnce(new Error('post-commit read failed'));
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const db = { team: { findFirst, updateMany } } as unknown as TenantDb;
    const actor = { id: 'admin-1', role: 'companyAdmin', tenantId: 'tenant-1' } as Actor;
    permissions.assertCanManageTeam.mockResolvedValue(undefined);
    permissions.requireTenant.mockReturnValue('tenant-1');

    const result = await replaceTeamPhoto(
      db,
      'team-1',
      'https://cdn.test/new.webp',
      actor,
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'team-1', tenantId: 'tenant-1' },
      data: { photoUrl: 'https://cdn.test/new.webp' },
    });
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(result.team.photoUrl).toBe('https://cdn.test/new.webp');
    expect(result.previousPhotoUrl).toBe(previous.photoUrl);
  });
});
