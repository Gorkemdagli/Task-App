import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { getProfile, updateProfile, uploadAvatar, type CurrentUserProfile } from './profile';

const profile: CurrentUserProfile = {
  id: 'user-1',
  displayId: 'ABCDE',
  email: 'user@example.com',
  fullName: 'User',
  role: 'member',
  tenantId: null,
  tenantName: null,
  avatarUrl: null,
  notifyTaskAssigned: true,
  notifyTaskCommented: true,
  notifyMessageReceived: true,
};

describe('profile service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('gets canonical current profile', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: profile } as never);

    await expect(getProfile()).resolves.toEqual(profile);
    expect(get).toHaveBeenCalledWith('/users/me');
  });

  it('updates profile with JSON payload', async () => {
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: profile } as never);

    await updateProfile({ fullName: 'Updated' });

    expect(patch).toHaveBeenCalledWith('/users/me', { fullName: 'Updated' });
  });

  it('uploads avatar as multipart field avatar', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: profile } as never);
    const file = new File(['avatar'], 'avatar.png', { type: 'image/png' });

    await uploadAvatar(file);

    expect(post).toHaveBeenCalledTimes(1);
    const form = post.mock.calls[0][1] as FormData;
    expect(form.get('avatar')).toBe(file);
  });
});
