import { Prisma } from '@prisma/client';
import { hashPassword, verifyPassword } from '../lib/password';
import { AppError } from '../lib/appError';
import { revokeAllUserSessions } from '../lib/sessionStore';
import { transformAvatar } from '../lib/media';
import { createMediaStorage, deleteOwnedAvatar, type MediaStorage } from '../lib/mediaStorage';
import type { UpdateCurrentUserInput } from '../schemas/users.schema';
import { withTenantContext } from '../db/withTenant';
import { withUserContext } from '../db/withUser';

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
  tenant: { select: { name: true, logoUrl: true } },
} satisfies Prisma.UserSelect;
const userProfileSelect = { ...profileSelect, tenant: false } satisfies Prisma.UserSelect;

type ProfileRow = Prisma.UserGetPayload<{ select: typeof profileSelect }>;
type UserProfileRow = Prisma.UserGetPayload<{ select: typeof userProfileSelect }>;

export type CurrentUserProfile = {
  id: string;
  tenantId: string | null;
  tenantName: string | null;
  tenantLogoUrl: string | null;
  email: string;
  fullName: string;
  displayId: string;
  avatarUrl: string | null;
  role: 'companyAdmin' | 'member';
  notifyTaskAssigned: boolean;
  notifyTaskCommented: boolean;
  notifyMessageReceived: boolean;
};

function toProfile(user: UserProfileRow, tenant: ProfileRow['tenant'] = null): CurrentUserProfile {
  return {
    id: user.id,
    tenantId: user.tenantId,
    tenantName: tenant?.name ?? null,
    tenantLogoUrl: tenant?.logoUrl ?? null,
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
  const user = await withUserContext(userId, (tx) =>
    tx.user.findUnique({ where: { id: userId }, select: userProfileSelect }),
  );
  if (!user) throw new AppError(404, 'User not found', 'NOT_FOUND');
  const tenantId = user.tenantId;
  const tenant = tenantId
    ? await withTenantContext(userId, tenantId, (tx) =>
        tx.tenant.findUnique({ where: { id: tenantId }, select: { name: true, logoUrl: true } }),
      )
    : null;
  return toProfile(user, tenant);
}

export async function updateCurrentProfile(
  userId: string,
  input: UpdateCurrentUserInput,
): Promise<{ profile?: CurrentUserProfile; sessionRevoked: boolean }> {
  const current = await withUserContext(userId, (tx) =>
    tx.user.findUnique({
      where: { id: userId },
      select: { tenantId: true, passwordHash: true, email: true },
    }),
  );
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
    const update = async (transaction: Prisma.TransactionClient) => {
      await transaction.user.update({ where: { id: userId }, data });
      if (sessionRevoked) await revokeAllUserSessions(userId);
    };
    if (current.tenantId) await withTenantContext(userId, current.tenantId, update);
    else await withUserContext(userId, update);
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

  const current = await withUserContext(userId, (tx) =>
    tx.user.findUnique({ where: { id: userId }, select: { avatarUrl: true, tenantId: true } }),
  );
  if (!current) throw new AppError(404, 'User not found', 'NOT_FOUND');

  const transformed = await transformAvatar(file.buffer, file.mimetype);
  const mediaStorage = storage ?? createMediaStorage();
  const uploaded = await mediaStorage.uploadAvatar(userId, transformed);

  try {
    const update = (tx: Prisma.TransactionClient) =>
      tx.user.update({
        where: { id: userId },
        data: { avatarUrl: uploaded.url },
        select: userProfileSelect,
      });
    if (current.tenantId) await withTenantContext(userId, current.tenantId, update);
    else await withUserContext(userId, update);
  } catch (error) {
    try {
      await mediaStorage.deletePath(uploaded.path);
    } catch {
      // New object cleanup is best effort after a database failure.
    }
    throw error;
  }

  const profile = await getCurrentProfile(userId);
  await deleteOwnedAvatar(mediaStorage, current.avatarUrl, userId);
  return profile;
}
