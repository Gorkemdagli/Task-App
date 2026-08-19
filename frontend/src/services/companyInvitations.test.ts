import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import {
  acceptCompanyInvitation,
  cancelCompanyInvitation,
  createCompanyInvitation,
  listCompanyInvitations,
  listMyCompanyInvitations,
  rejectCompanyInvitation,
} from './companyInvitations';

const invitation = {
  id: 'invitation-1',
  tenantId: 'tenant-a',
  companyName: 'Acme',
  inviterName: 'Admin',
  status: 'pending' as const,
  createdAt: '2026-08-20T00:00:00.000Z',
  expiresAt: '2026-08-27T00:00:00.000Z',
  respondedAt: null,
};

describe('company invitations service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes display IDs and emails before creating invitations', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: invitation } as never);

    await createCompanyInvitation(' User@Example.COM ');
    await createCompanyInvitation(' kmu24 ');

    expect(post).toHaveBeenNthCalledWith(1, '/company/invitations', {
      email: 'user@example.com',
    });
    expect(post).toHaveBeenNthCalledWith(2, '/company/invitations', {
      displayId: 'KMU24',
    });
  });

  it('maps invitation endpoints to DTO results', async () => {
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValueOnce({ data: { invitation, user: { id: 'user-1' } } } as never)
      .mockResolvedValueOnce({ data: invitation } as never);
    const get = vi
      .spyOn(api, 'get')
      .mockResolvedValueOnce({ data: [invitation] } as never)
      .mockResolvedValueOnce({ data: { invitations: [invitation], pendingCount: 1 } } as never);
    const del = vi.spyOn(api, 'delete').mockResolvedValue({ data: invitation } as never);

    await expect(listCompanyInvitations()).resolves.toEqual([invitation]);
    await expect(listMyCompanyInvitations()).resolves.toEqual([invitation]);
    await expect(cancelCompanyInvitation('invitation-1')).resolves.toEqual(invitation);
    await expect(acceptCompanyInvitation('invitation-1')).resolves.toEqual({
      invitation,
      user: { id: 'user-1' },
    });
    await expect(rejectCompanyInvitation('invitation-1')).resolves.toEqual(invitation);

    expect(get).toHaveBeenNthCalledWith(1, '/company/invitations?status=pending');
    expect(get).toHaveBeenNthCalledWith(2, '/users/me/company-invitations');
    expect(del).toHaveBeenCalledWith('/company/invitations/invitation-1');
    expect(post).toHaveBeenNthCalledWith(1, '/users/me/company-invitations/invitation-1/accept');
    expect(post).toHaveBeenNthCalledWith(2, '/users/me/company-invitations/invitation-1/reject');
  });
});
