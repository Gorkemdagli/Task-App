import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { hasAccessSession } from '../lib/sessionStore';
import { verifyAccessToken } from '../lib/jwt';
import { login, register } from './auth.service';
import { getCurrentProfile, updateCurrentProfile } from './profile.service';

async function cleanDb() {
  await prisma.taskComment.deleteMany();
  await prisma.message.deleteMany();
  await prisma.task.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.team.deleteMany();
  await prisma.channel.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();
  const keys = await redis.keys('*');
  if (keys.length) await redis.del(...keys);
}

describe('profile.service', () => {
  beforeEach(cleanDb);

  it('reads canonical profile for a tenantless user', async () => {
    const registered = await register({
      fullName: 'Tenantless User',
      email: 'tenantless-profile@example.com',
      password: 'hunter22',
    });

    await expect(getCurrentProfile(registered.user.id)).resolves.toMatchObject({
      id: registered.user.id,
      tenantId: null,
      tenantName: null,
      email: 'tenantless-profile@example.com',
      avatarUrl: null,
      notifyTaskAssigned: true,
      notifyTaskCommented: true,
      notifyMessageReceived: true,
    });
  });

  it('keeps mixed profile updates atomic on duplicate email', async () => {
    const first = await register({
      fullName: 'Before',
      email: 'first@example.com',
      password: 'hunter22',
    });
    await register({ fullName: 'Other', email: 'other@example.com', password: 'hunter22' });

    await expect(
      updateCurrentProfile(first.user.id, {
        fullName: 'Changed',
        email: 'other@example.com',
        currentPassword: 'hunter22',
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'EMAIL_ALREADY_IN_USE' });

    await expect(getCurrentProfile(first.user.id)).resolves.toMatchObject({
      fullName: 'Before',
      email: 'first@example.com',
    });
  });

  it('rejects a new password equal to the current password', async () => {
    const registered = await register({
      fullName: 'Password User',
      email: 'same-password@example.com',
      password: 'hunter22',
    });

    await expect(
      updateCurrentProfile(registered.user.id, {
        currentPassword: 'hunter22',
        newPassword: 'hunter22',
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'PASSWORD_UNCHANGED' });
  });

  it('revokes all indexed device sessions after credential change', async () => {
    const registered = await register({
      fullName: 'Multi Device',
      email: 'multi-device@example.com',
      password: 'hunter22',
    });
    const secondDevice = await login({ email: 'multi-device@example.com', password: 'hunter22' });
    const firstJti = verifyAccessToken(registered.accessToken).jti;
    const secondJti = verifyAccessToken(secondDevice.accessToken).jti;

    await expect(
      updateCurrentProfile(registered.user.id, {
        currentPassword: 'hunter22',
        newPassword: 'new-hunter22',
      }),
    ).resolves.toEqual({ sessionRevoked: true });

    expect(await hasAccessSession(firstJti)).toBe(false);
    expect(await hasAccessSession(secondJti)).toBe(false);
  });
});
