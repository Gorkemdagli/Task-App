import type { CompanyInvitationStatus } from '@prisma/client';
import type { TenantDb } from '../db/types';
import { AppError } from '../lib/appError';
import type { Actor } from '../lib/permissions';
import { assertCompanyAdmin } from './company-users.service';
import type { AuthUser } from './auth.service';
import type { AddCompanyInvitationInput } from '../schemas/company-invitations.schema';
import { commitThenThrow } from '../db/withUser';

const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export type CompanyInvitationDTO = {
  id: string;
  tenantId: string;
  companyName: string;
  inviterName: string;
  status: CompanyInvitationStatus;
  createdAt: string;
  expiresAt: string;
  respondedAt: string | null;
};

export type CompanyInvitationAdminDTO = CompanyInvitationDTO & {
  recipientUserId: string;
  recipientDisplayId: string;
  recipientEmail: string;
  recipientFullName: string;
};

export type AcceptCompanyInvitationResult = {
  invitation: CompanyInvitationDTO;
  user: AuthUser;
};

const invitationSelect = {
  id: true,
  tenantId: true,
  recipientUserId: true,
  invitedByUserId: true,
  status: true,
  companyName: true,
  inviterName: true,
  createdAt: true,
  expiresAt: true,
  respondedAt: true,
  cancelledAt: true,
} as const;

const adminInvitationSelect = {
  ...invitationSelect,
  recipient: {
    select: { id: true, displayId: true, email: true, fullName: true },
  },
} as const;

type InvitationRow = {
  id: string;
  tenantId: string;
  recipientUserId: string;
  status: CompanyInvitationStatus;
  companyName: string;
  inviterName: string;
  createdAt: Date;
  expiresAt: Date;
  respondedAt: Date | null;
};

function toInvitationDTO(invitation: InvitationRow): CompanyInvitationDTO {
  return {
    id: invitation.id,
    tenantId: invitation.tenantId,
    companyName: invitation.companyName,
    inviterName: invitation.inviterName,
    status: invitation.status,
    createdAt: invitation.createdAt.toISOString(),
    expiresAt: invitation.expiresAt.toISOString(),
    respondedAt: invitation.respondedAt?.toISOString() ?? null,
  };
}

function toAdminInvitationDTO(
  invitation: InvitationRow & {
    recipient: { id: string; displayId: string; email: string; fullName: string };
  },
): CompanyInvitationAdminDTO {
  return {
    ...toInvitationDTO(invitation),
    recipientUserId: invitation.recipient.id,
    recipientDisplayId: invitation.recipient.displayId,
    recipientEmail: invitation.recipient.email,
    recipientFullName: invitation.recipient.fullName,
  };
}

function identifierWhere(
  input: AddCompanyInvitationInput,
): { displayId: string } | { email: string } {
  return 'displayId' in input ? { displayId: input.displayId } : { email: input.email };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

async function expireStaleInvitations(
  db: TenantDb,
  where: { tenantId?: string; recipientUserId?: string },
) {
  await db.companyInvitation.updateMany({
    where: { ...where, status: 'pending', expiresAt: { lte: new Date() } },
    data: { status: 'expired' },
  });
}

async function expireStaleInvitationAfterRace(
  db: TenantDb,
  where: { tenantId?: string; recipientUserId?: string },
  invitationId: string,
  knownInvitation?: InvitationRow,
): Promise<never> {
  const invitationWhere = { id: invitationId, ...where };
  let current: InvitationRow | null = knownInvitation ?? null;
  if (!current) {
    current = await db.companyInvitation.findFirst({
      where: invitationWhere,
      select: invitationSelect,
    });
  }

  if (!current) throwInvitationNotFound();
  if (current.status === 'expired') commitThenThrow(invitationExpiredError());
  if (current.status !== 'pending' || current.expiresAt > new Date()) {
    throwInvitationNotPending();
  }

  const expired = await db.companyInvitation.updateMany({
    where: {
      ...invitationWhere,
      status: 'pending',
      expiresAt: { lte: new Date() },
    },
    data: { status: 'expired' },
  });
  if (expired.count === 1) commitThenThrow(invitationExpiredError());

  current = await db.companyInvitation.findFirst({
    where: invitationWhere,
    select: invitationSelect,
  });
  if (!current) throwInvitationNotFound();
  if (current.status === 'expired') commitThenThrow(invitationExpiredError());
  throwInvitationNotPending();
}

function throwInvitationNotFound(): never {
  throw new AppError(404, 'Davet bulunamadı', 'INVITATION_NOT_FOUND');
}

function throwInvitationNotPending(): never {
  throw new AppError(409, 'Davet artık beklemede değil', 'INVITATION_NOT_PENDING');
}

function invitationExpiredError(): AppError {
  return new AppError(410, 'Davetin süresi doldu', 'INVITATION_EXPIRED');
}

async function loadRecipientInvitation(db: TenantDb, actorId: string, invitationId: string) {
  const invitation = await db.companyInvitation.findFirst({
    where: { id: invitationId, recipientUserId: actorId },
    select: invitationSelect,
  });
  if (!invitation) throwInvitationNotFound();
  return invitation;
}

async function assertPendingRecipientInvitation(
  db: TenantDb,
  actorId: string,
  invitationId: string,
) {
  const invitation = await loadRecipientInvitation(db, actorId, invitationId);
  if (invitation.status === 'expired') throw invitationExpiredError();
  if (invitation.status !== 'pending') throwInvitationNotPending();
  const now = new Date();
  if (invitation.expiresAt > now) return invitation;
  return expireStaleInvitationAfterRace(
    db,
    { recipientUserId: actorId },
    invitation.id,
    invitation,
  );
}

export async function createInvitation(
  db: TenantDb,
  actor: Actor,
  input: AddCompanyInvitationInput,
): Promise<CompanyInvitationAdminDTO> {
  const tenantId = assertCompanyAdmin(actor);
  const identifier = identifierWhere(input);
  const recipient = await db.user.findFirst({
    where: { ...identifier, tenantId: null },
    select: { id: true, displayId: true, email: true, fullName: true },
  });

  if (!recipient) {
    const sameCompanyUser = await db.user.findFirst({
      where: { ...identifier, tenantId },
      select: { id: true },
    });
    if (sameCompanyUser) {
      throw new AppError(409, 'Kullanıcı zaten bu şirkette', 'USER_ALREADY_IN_COMPANY');
    }
    throw new AppError(404, 'Kullanıcı bulunamadı', 'USER_NOT_FOUND');
  }

  await expireStaleInvitations(db, { tenantId, recipientUserId: recipient.id });

  const [inviter, tenant] = await Promise.all([
    db.user.findFirst({ where: { id: actor.id, tenantId }, select: { fullName: true } }),
    db.tenant.findFirst({ where: { id: tenantId }, select: { name: true } }),
  ]);
  if (!inviter || !tenant) throw new AppError(404, 'Kullanıcı bulunamadı', 'USER_NOT_FOUND');

  try {
    const invitation = await db.companyInvitation.create({
      data: {
        tenantId,
        recipientUserId: recipient.id,
        invitedByUserId: actor.id,
        status: 'pending',
        companyName: tenant.name,
        inviterName: inviter.fullName,
        expiresAt: new Date(Date.now() + INVITATION_LIFETIME_MS),
      },
      select: adminInvitationSelect,
    });
    return toAdminInvitationDTO(invitation);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(
        409,
        'Bu kullanıcıya zaten bekleyen davet var',
        'INVITATION_ALREADY_PENDING',
      );
    }
    throw error;
  }
}

export async function listCompanyInvitations(
  db: TenantDb,
  actor: Actor,
): Promise<CompanyInvitationAdminDTO[]> {
  const tenantId = assertCompanyAdmin(actor);
  await expireStaleInvitations(db, { tenantId });
  const invitations = await db.companyInvitation.findMany({
    where: { tenantId, status: 'pending' },
    select: adminInvitationSelect,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  return invitations.map(toAdminInvitationDTO);
}

export async function cancelInvitation(
  db: TenantDb,
  actor: Actor,
  invitationId: string,
): Promise<CompanyInvitationAdminDTO> {
  const tenantId = assertCompanyAdmin(actor);
  const existing = await db.companyInvitation.findFirst({
    where: { id: invitationId, tenantId },
    select: invitationSelect,
  });
  if (!existing) throwInvitationNotFound();
  if (existing.status !== 'pending') throwInvitationNotPending();

  const now = new Date();
  const cancelled = await db.companyInvitation.updateMany({
    where: {
      id: invitationId,
      tenantId,
      status: 'pending',
      expiresAt: { gt: now },
    },
    data: { status: 'cancelled', cancelledAt: new Date() },
  });
  if (cancelled.count !== 1) {
    return expireStaleInvitationAfterRace(db, { tenantId }, invitationId);
  }

  const invitation = await db.companyInvitation.findFirst({
    where: { id: invitationId, tenantId },
    select: adminInvitationSelect,
  });
  if (!invitation) throwInvitationNotFound();
  return toAdminInvitationDTO(invitation);
}

export async function listMyInvitations(
  db: TenantDb,
  actor: Actor,
): Promise<CompanyInvitationDTO[]> {
  await expireStaleInvitations(db, { recipientUserId: actor.id });
  const invitations = await db.companyInvitation.findMany({
    where: { recipientUserId: actor.id, status: 'pending', expiresAt: { gt: new Date() } },
    select: invitationSelect,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  return invitations.map(toInvitationDTO);
}

export async function rejectInvitation(
  db: TenantDb,
  actor: Actor,
  invitationId: string,
): Promise<CompanyInvitationDTO> {
  const invitation = await assertPendingRecipientInvitation(db, actor.id, invitationId);
  const respondedAt = new Date();
  const transition = await db.companyInvitation.updateMany({
    where: {
      id: invitation.id,
      recipientUserId: actor.id,
      status: 'pending',
      expiresAt: { gt: respondedAt },
    },
    data: { status: 'rejected', respondedAt },
  });
  if (transition.count !== 1) {
    return expireStaleInvitationAfterRace(db, { recipientUserId: actor.id }, invitation.id);
  }

  const rejected = await loadRecipientInvitation(db, actor.id, invitation.id);
  return toInvitationDTO(rejected);
}

export async function acceptInvitation(
  db: TenantDb,
  actor: Actor,
  invitationId: string,
): Promise<AcceptCompanyInvitationResult> {
  const invitation = await assertPendingRecipientInvitation(db, actor.id, invitationId);

  await db.$executeRaw`SELECT set_config('app.tenant_id', ${invitation.tenantId}, true)`;
  await db.$executeRaw`SAVEPOINT company_invitation_claim`;
  const claimed = await db.user.updateMany({
    where: { id: actor.id, tenantId: null },
    data: { tenantId: invitation.tenantId, role: 'member' },
  });
  if (claimed.count !== 1) {
    const current = await loadRecipientInvitation(db, actor.id, invitation.id);
    if (current.status !== 'pending') throwInvitationNotPending();
    await db.companyInvitation.updateMany({
      where: { id: invitation.id, recipientUserId: actor.id, status: 'pending' },
      data: { status: 'expired' },
    });
    commitThenThrow(
      new AppError(409, 'Davet hedefi artık uygun değil', 'INVITATION_TARGET_NOT_AVAILABLE'),
    );
  }

  const respondedAt = new Date();
  const transition = await db.companyInvitation.updateMany({
    where: {
      id: invitation.id,
      recipientUserId: actor.id,
      status: 'pending',
      expiresAt: { gt: respondedAt },
    },
    data: { status: 'accepted', respondedAt },
  });
  if (transition.count !== 1) {
    await db.$executeRaw`ROLLBACK TO SAVEPOINT company_invitation_claim`;
    return expireStaleInvitationAfterRace(db, { recipientUserId: actor.id }, invitation.id);
  }

  await db.companyInvitation.updateMany({
    where: {
      recipientUserId: actor.id,
      status: 'pending',
      id: { not: invitation.id },
    },
    data: { status: 'expired' },
  });

  const accepted = await loadRecipientInvitation(db, actor.id, invitation.id);

  const user = await db.user.findFirst({
    where: { id: actor.id, tenantId: invitation.tenantId },
    select: {
      id: true,
      displayId: true,
      email: true,
      fullName: true,
      role: true,
      tenantId: true,
      tenant: { select: { name: true } },
    },
  });
  if (!user)
    throw new AppError(409, 'Davet hedefi artık uygun değil', 'INVITATION_TARGET_NOT_AVAILABLE');

  return {
    invitation: toInvitationDTO(accepted),
    user: {
      id: user.id,
      displayId: user.displayId,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      tenantId: user.tenantId,
      tenantName: user.tenant?.name ?? null,
    },
  };
}
