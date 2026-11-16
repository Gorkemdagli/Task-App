import { Prisma } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import { hashPassword, verifyPassword } from '../lib/password';
import { AppError } from '../lib/appError';
import { logger } from '../lib/logger';
import { revokeAllUserSessions } from '../lib/sessionStore';
import { transformAvatar } from '../lib/media';
import { createMediaStorage, deleteOwnedAvatar, type MediaStorage } from '../lib/mediaStorage';
import type {
  CreateCurrentUserCompanyInput,
  DeleteCurrentUserInput,
  UpdateCurrentUserInput,
} from '../schemas/users.schema';
import { withTenantContext } from '../db/withTenant';
import { withUserContext } from '../db/withUser';
import { cancelPendingStatusesForDeletedUser } from './tasks.service';
import { companyNameKey, slugify } from './tenant.service';

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
    tx.user.findFirst({ where: { id: userId, deletedAt: null }, select: userProfileSelect }),
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

export async function createCompanyForCurrentUser(
  userId: string,
  input: CreateCurrentUserCompanyInput,
): Promise<CurrentUserProfile> {
  const tenantId = randomUUID();
  try {
    await withTenantContext(userId, tenantId, async (tx) => {
      await tx.tenant.create({
        data: {
          id: tenantId,
          slug: slugify(input.companyName),
          nameKey: companyNameKey(input.companyName),
          name: input.companyName,
        },
      });
      const claimed = await tx.user.updateMany({
        where: { id: userId, tenantId: null, role: 'member', deletedAt: null },
        data: { tenantId, role: 'companyAdmin' },
      });
      if (claimed.count !== 1) {
        throw new AppError(409, 'Account already belongs to a company', 'COMPANY_ALREADY_ASSIGNED');
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError(409, 'Company name already in use', 'CONFLICT_SLUG');
    }
    throw error;
  }

  return getCurrentProfile(userId);
}

export async function updateCurrentProfile(
  userId: string,
  input: UpdateCurrentUserInput,
): Promise<{ profile?: CurrentUserProfile; sessionRevoked: boolean }> {
  const current = await withUserContext(userId, (tx) =>
    tx.user.findFirst({
      where: { id: userId, deletedAt: null },
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
      const updated = await transaction.user.updateMany({
        where: { id: userId, deletedAt: null },
        data,
      });
      if (updated.count !== 1) throw new AppError(404, 'User not found', 'NOT_FOUND');
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
    tx.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { avatarUrl: true, tenantId: true },
    }),
  );
  if (!current) throw new AppError(404, 'User not found', 'NOT_FOUND');

  const transformed = await transformAvatar(file.buffer, file.mimetype);
  const mediaStorage = storage ?? createMediaStorage();
  const uploaded = await mediaStorage.uploadAvatar(userId, transformed);

  try {
    const update = async (tx: Prisma.TransactionClient) => {
      const result = await tx.user.updateMany({
        where: { id: userId, deletedAt: null },
        data: { avatarUrl: uploaded.url },
      });
      if (result.count !== 1) throw new AppError(404, 'User not found', 'NOT_FOUND');
    };
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

export async function deleteCurrentAccount(
  userId: string,
  input: DeleteCurrentUserInput,
): Promise<void> {
  const current = await withUserContext(userId, (tx) =>
    tx.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { tenantId: true, email: true },
    }),
  );
  if (!current) throw new AppError(404, 'User not found', 'NOT_FOUND');

  const matchesEmail = (email: string) => input.confirmationEmail === email;
  if (!matchesEmail(current.email)) {
    throw new AppError(400, 'Confirmation email does not match', 'CONFIRMATION_EMAIL_MISMATCH');
  }

  const replacementId = randomUUID();
  const replacementPasswordHash = await hashPassword(randomBytes(32).toString('hex'));
  const deletedAt = new Date();
  const anonymize = async (tx: Prisma.TransactionClient) => {
    const rows = await tx.$queryRaw<
      Array<{ tenantId: string | null; email: string; avatarUrl: string | null; role: string }>
    >`
      SELECT tenant_id AS "tenantId", email, avatar_url AS "avatarUrl", role
      FROM users
      WHERE id = ${userId}::uuid AND deleted_at IS NULL
      FOR UPDATE
    `;
    const locked = rows[0];
    if (!locked) throw new AppError(404, 'User not found', 'NOT_FOUND');
    if (locked.tenantId !== current.tenantId) {
      throw new AppError(409, 'Account state changed; retry deletion', 'ACCOUNT_STATE_CHANGED');
    }
    if (!matchesEmail(locked.email)) {
      throw new AppError(400, 'Confirmation email does not match', 'CONFIRMATION_EMAIL_MISMATCH');
    }

    if (locked.tenantId) {
      if (
        locked.role === 'companyAdmin' &&
        (await tx.user.count({
          where: { tenantId: locked.tenantId, role: 'companyAdmin', deletedAt: null },
        })) < 2
      ) {
        throw new AppError(
          409,
          'A company must have another administrator before this account can be deleted',
          'LAST_COMPANY_ADMIN_REQUIRED',
        );
      }

      await cancelPendingStatusesForDeletedUser(tx, userId);
      await tx.teamMember.deleteMany({ where: { userId } });
      await tx.companyInvitation.updateMany({
        where: { recipientUserId: userId, status: 'pending' },
        data: { status: 'cancelled', cancelledAt: deletedAt },
      });
    } else {
      await tx.companyInvitation.updateMany({
        where: { recipientUserId: userId, status: 'pending' },
        data: { status: 'cancelled', cancelledAt: deletedAt },
      });
    }
    await tx.notification.deleteMany({ where: { userId } });

    const result = await tx.user.updateMany({
      where: { id: userId, deletedAt: null },
      data: {
        email: `deleted-${replacementId}@account.invalid`,
        displayId: `deleted-${replacementId}`,
        fullName: 'Silinmiş kullanıcı',
        avatarUrl: null,
        passwordHash: replacementPasswordHash,
        role: 'member',
        notifyTaskAssigned: false,
        notifyTaskCommented: false,
        notifyMessageReceived: false,
        deletedAt,
      },
    });
    if (result.count !== 1) throw new AppError(404, 'User not found', 'NOT_FOUND');
    return locked.avatarUrl;
  };

  const avatarUrl = current.tenantId
    ? await withTenantContext(userId, current.tenantId, async (tx) => {
        const tenantRows = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM tenants WHERE id = ${current.tenantId}::uuid FOR UPDATE
        `;
        if (tenantRows.length !== 1) throw new AppError(404, 'Tenant not found', 'NOT_FOUND');
        return anonymize(tx);
      })
    : await withUserContext(userId, anonymize);

  // Database tombstones deny access and refresh even if Redis is temporarily unavailable.
  try {
    await revokeAllUserSessions(userId);
  } catch (error) {
    // The account is already unusable through the database auth check.
    logger.error(
      { error: error instanceof Error ? error.message : 'unknown' },
      'account deletion session cleanup failed',
    );
  }
  await deleteOwnedAvatar(createMediaStorage(), avatarUrl, userId);
}
