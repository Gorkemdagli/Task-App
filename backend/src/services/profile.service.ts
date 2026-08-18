import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { hashPassword, verifyPassword } from '../lib/password';
import { AppError } from '../lib/appError';
import { revokeAllUserSessions } from '../lib/sessionStore';
import { transformAvatar } from '../lib/media';
import { createMediaStorage, deleteOwnedAvatar, type MediaStorage } from '../lib/mediaStorage';
import type { UpdateCurrentUserInput } from '../schemas/users.schema';

const profileSelect = {
  id: true,
  tenantId: true,
  email: true,
  fullName: true,
  displayId: true,
  avatarUrl: true,
  role: true,
  notifyTaskAssigned: true,
  notifyTaskCommented: true,
  notifyMessageReceived: true,
  tenant: { select: { name: true } },
} satisfies Prisma.UserSelect;

type ProfileRow = Prisma.UserGetPayload<{ select: typeof profileSelect }>;

export type CurrentUserProfile = {
  id: string;
  tenantId: string | null;
  tenantName: string | null;
  email: string;
  fullName: string;
  displayId: string;
  avatarUrl: string | null;
  role: 'companyAdmin' | 'member';
  notifyTaskAssigned: boolean;
  notifyTaskCommented: boolean;
  notifyMessageReceived: boolean;
};

function toProfile(user: ProfileRow): CurrentUserProfile {
  return {
    id: user.id,
    tenantId: user.tenantId,
    tenantName: user.tenant?.name ?? null,
    email: user.email,
    fullName: user.fullName,
    displayId: user.displayId,
    avatarUrl: user.avatarUrl,
    role: user.role,
    notifyTaskAssigned: user.notifyTaskAssigned,
    notifyTaskCommented: user.notifyTaskCommented,
    notifyMessageReceived: user.notifyMessageReceived,
  };
}

export async function getCurrentProfile(userId: string): Promise<CurrentUserProfile> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: profileSelect });
  if (!user) throw new AppError(404, 'User not found', 'NOT_FOUND');
  return toProfile(user);
}

export async function updateCurrentProfile(
  userId: string,
  input: UpdateCurrentUserInput,
): Promise<{ profile?: CurrentUserProfile; sessionRevoked: boolean }> {
  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, email: true },
  });
  if (!current) throw new AppError(404, 'User not found', 'NOT_FOUND');

  const credentialFieldPresent = input.email !== undefined || input.newPassword !== undefined;
  if (credentialFieldPresent) {
    const validCurrentPassword =
      input.currentPassword !== undefined &&
      (await verifyPassword(input.currentPassword, current.passwordHash));
    if (!validCurrentPassword) {
      throw new AppError(400, 'Invalid current password', 'INVALID_CURRENT_PASSWORD');
    }
  }

  if (
    input.newPassword !== undefined &&
    (await verifyPassword(input.newPassword, current.passwordHash))
  ) {
    throw new AppError(400, 'New password must differ from current password', 'PASSWORD_UNCHANGED');
  }

  if (input.email !== undefined && input.email !== current.email) {
    const existingEmail = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existingEmail && existingEmail.id !== userId) {
      throw new AppError(409, 'Email already in use', 'EMAIL_ALREADY_IN_USE');
    }
  }

  const data: Prisma.UserUpdateInput = {};
  if (input.fullName !== undefined) data.fullName = input.fullName;
  if (input.email !== undefined) data.email = input.email;
  if (input.newPassword !== undefined) data.passwordHash = await hashPassword(input.newPassword);
  if (input.notifyTaskAssigned !== undefined) data.notifyTaskAssigned = input.notifyTaskAssigned;
  if (input.notifyTaskCommented !== undefined) data.notifyTaskCommented = input.notifyTaskCommented;
  if (input.notifyMessageReceived !== undefined)
    data.notifyMessageReceived = input.notifyMessageReceived;

  const sessionRevoked =
    input.newPassword !== undefined || (input.email !== undefined && input.email !== current.email);

  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.user.update({ where: { id: userId }, data });
      if (sessionRevoked) await revokeAllUserSessions(userId);
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError(409, 'Email already in use', 'EMAIL_ALREADY_IN_USE');
    }
    throw error;
  }

  if (sessionRevoked) return { sessionRevoked: true };
  return { profile: await getCurrentProfile(userId), sessionRevoked: false };
}

export async function replaceAvatar(
  userId: string,
  file: Express.Multer.File,
  storage?: MediaStorage,
): Promise<CurrentUserProfile> {
  if (!file?.buffer || !file.mimetype) {
    throw new AppError(400, 'Invalid image', 'INVALID_IMAGE');
  }

  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarUrl: true },
  });
  if (!current) throw new AppError(404, 'User not found', 'NOT_FOUND');

  const transformed = await transformAvatar(file.buffer, file.mimetype);
  const mediaStorage = storage ?? createMediaStorage();
  const uploaded = await mediaStorage.uploadAvatar(userId, transformed);

  let updated: ProfileRow;
  try {
    updated = await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: uploaded.url },
      select: profileSelect,
    });
  } catch (error) {
    try {
      await mediaStorage.deletePath(uploaded.path);
    } catch {
      // New object cleanup is best effort after a database failure.
    }
    throw error;
  }

  await deleteOwnedAvatar(mediaStorage, current.avatarUrl, userId);
  return toProfile(updated);
}
