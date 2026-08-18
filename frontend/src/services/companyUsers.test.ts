import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { addCompanyUser, type CompanyUser } from './companyUsers';

const user: CompanyUser = {
  id: 'user-1',
  displayId: 'A3X9K',
  email: 'user@example.com',
  fullName: 'User',
  avatarUrl: null,
  role: 'member',
  teamRoles: [],
};

describe('company users service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('adds company user by display ID', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: user } as never);

    await expect(addCompanyUser('A3X9K')).resolves.toEqual(user);
    expect(post).toHaveBeenCalledWith('/company/users', { displayId: 'A3X9K' });
  });
});
