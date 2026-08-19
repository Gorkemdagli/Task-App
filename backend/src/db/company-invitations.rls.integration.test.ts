import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { acceptInvitation } from '../services/company-invitations.service';
import { withUserContext } from './withUser';

const tenantAId = randomUUID();
const tenantBId = randomUUID();
const inviterId = randomUUID();
const recipientId = randomUUID();
const cancellationRecipientId = randomUUID();
const claimedRecipientId = randomUUID();
const tenantlessExpiryRecipientId = randomUUID();
const memberRecipientId = randomUUID();
const rejectionRecipientId = randomUUID();
const staleRecipientId = randomUUID();
const invitationId = randomUUID();
const cancellationInvitationId = randomUUID();
const claimedRecipientInvitationId = randomUUID();
const tenantlessExpiryInvitationId = randomUUID();
const memberInvitationId = randomUUID();
const rejectionInvitationId = randomUUID();
const staleInvitationId = randomUUID();

async function createInvitation(
  id: string,
  recipientUserId = recipientId,
  expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "company_invitations" (
      "id", "tenant_id", "recipient_user_id", "invited_by_user_id", "company_name", "inviter_name", "expires_at"
    ) VALUES (
      ${id}::uuid, ${tenantAId}::uuid, ${recipientUserId}::uuid, ${inviterId}::uuid,
      'Company A', 'Inviter', ${expiresAt}
    )
  `;
}

describe('company invitation update RLS', () => {
  beforeAll(async () => {
    await prisma.tenant.createMany({
      data: [
        {
          id: tenantAId,
          name: 'Company A',
          slug: `company-a-${tenantAId}`,
          nameKey: `company-a-${tenantAId}`,
        },
        {
          id: tenantBId,
          name: 'Company B',
          slug: `company-b-${tenantBId}`,
          nameKey: `company-b-${tenantBId}`,
        },
      ],
    });
    await prisma.user.createMany({
      data: [
        {
          id: inviterId,
          tenantId: tenantAId,
          email: `inviter-${inviterId}@test.com`,
          fullName: 'Inviter',
          passwordHash: 'test',
          displayId: `INV${inviterId.slice(0, 6)}`,
          role: 'companyAdmin',
        },
        {
          id: recipientId,
          email: `recipient-${recipientId}@test.com`,
          fullName: 'Recipient',
          passwordHash: 'test',
          displayId: `REC${recipientId.slice(0, 6)}`,
          role: 'member',
        },
        {
          id: cancellationRecipientId,
          email: `cancellation-recipient-${cancellationRecipientId}@test.com`,
          fullName: 'Cancellation Recipient',
          passwordHash: 'test',
          displayId: `CAN${cancellationRecipientId.slice(0, 6)}`,
          role: 'member',
        },
        {
          id: claimedRecipientId,
          tenantId: tenantBId,
          email: `claimed-recipient-${claimedRecipientId}@test.com`,
          fullName: 'Claimed Recipient',
          passwordHash: 'test',
          displayId: `CLM${claimedRecipientId.slice(0, 6)}`,
          role: 'member',
        },
        {
          id: tenantlessExpiryRecipientId,
          email: `tenantless-expiry-${tenantlessExpiryRecipientId}@test.com`,
          fullName: 'Tenantless Expiry Recipient',
          passwordHash: 'test',
          displayId: `EXP${tenantlessExpiryRecipientId.slice(0, 6)}`,
          role: 'member',
        },
        {
          id: memberRecipientId,
          tenantId: tenantAId,
          email: `member-recipient-${memberRecipientId}@test.com`,
          fullName: 'Member Recipient',
          passwordHash: 'test',
          displayId: `MEM${memberRecipientId.slice(0, 6)}`,
          role: 'member',
        },
        {
          id: rejectionRecipientId,
          email: `rejection-recipient-${rejectionRecipientId}@test.com`,
          fullName: 'Rejection Recipient',
          passwordHash: 'test',
          displayId: `REJ${rejectionRecipientId.slice(0, 6)}`,
          role: 'member',
        },
        {
          id: staleRecipientId,
          email: `stale-recipient-${staleRecipientId}@test.com`,
          fullName: 'Stale Recipient',
          passwordHash: 'test',
          displayId: `STA${staleRecipientId.slice(0, 6)}`,
          role: 'member',
        },
      ],
    });
    await createInvitation(invitationId);
    await createInvitation(cancellationInvitationId, cancellationRecipientId);
    await createInvitation(claimedRecipientInvitationId, claimedRecipientId);
    await createInvitation(tenantlessExpiryInvitationId, tenantlessExpiryRecipientId);
    await createInvitation(memberInvitationId, memberRecipientId);
    await createInvitation(rejectionInvitationId, rejectionRecipientId);
    await createInvitation(staleInvitationId, staleRecipientId, new Date(Date.now() - 60_000));
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
  });

  it('rejects recipient attempts to change invitation identity and expiry fields', async () => {
    await expect(
      withUserContext(
        recipientId,
        (db) =>
          db.$executeRaw`
          UPDATE "company_invitations"
          SET
            "tenant_id" = ${tenantBId}::uuid,
            "invited_by_user_id" = ${recipientId}::uuid,
            "expires_at" = CURRENT_TIMESTAMP + INTERVAL '30 days'
          WHERE "id" = ${invitationId}::uuid
        `,
      ),
    ).rejects.toBeDefined();
  });

  it('rejects raw acceptance while the recipient is tenantless', async () => {
    await expect(
      withUserContext(
        recipientId,
        (db) =>
          db.$executeRaw`
          UPDATE "company_invitations"
          SET "status" = 'accepted', "responded_at" = CURRENT_TIMESTAMP
          WHERE "id" = ${invitationId}::uuid
        `,
      ),
    ).rejects.toBeDefined();

    await expect(
      prisma.companyInvitation.findUniqueOrThrow({
        where: { id: invitationId },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: 'pending' });
  });

  it('allows acceptance after the recipient has membership in the invited tenant', async () => {
    await expect(
      withUserContext(
        memberRecipientId,
        (db) =>
          db.$executeRaw`
          UPDATE "company_invitations"
          SET "status" = 'accepted', "responded_at" = CURRENT_TIMESTAMP
          WHERE "id" = ${memberInvitationId}::uuid
        `,
      ),
    ).resolves.toBe(1);
  });

  it('keeps rejection recipient-owned without requiring membership', async () => {
    await expect(
      withUserContext(
        rejectionRecipientId,
        (db) =>
          db.$executeRaw`
          UPDATE "company_invitations"
          SET "status" = 'rejected', "responded_at" = CURRENT_TIMESTAMP
          WHERE "id" = ${rejectionInvitationId}::uuid
        `,
      ),
    ).resolves.toBe(1);
  });

  it('allows tenant context to cancel a pending invitation', async () => {
    await expect(
      withUserContext(inviterId, async (db) => {
        await db.$executeRaw`SELECT set_config('app.tenant_id', ${tenantAId}, true)`;
        return db.$executeRaw`
          UPDATE "company_invitations"
          SET "status" = 'cancelled', "cancelled_at" = CURRENT_TIMESTAMP
          WHERE "id" = ${cancellationInvitationId}::uuid
        `;
      }),
    ).resolves.toBe(1);
  });

  it('commits expiry before returning target unavailable for a claimed recipient', async () => {
    await expect(
      withUserContext(claimedRecipientId, (db) =>
        acceptInvitation(
          db,
          { id: claimedRecipientId, role: 'member', tenantId: tenantBId },
          claimedRecipientInvitationId,
        ),
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'INVITATION_TARGET_NOT_AVAILABLE',
    });

    await expect(
      prisma.companyInvitation.findUniqueOrThrow({
        where: { id: claimedRecipientInvitationId },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: 'expired' });
  });

  it('commits stale expiry before returning expired to the recipient', async () => {
    await expect(
      withUserContext(staleRecipientId, (db) =>
        acceptInvitation(
          db,
          { id: staleRecipientId, role: 'member', tenantId: null },
          staleInvitationId,
        ),
      ),
    ).rejects.toMatchObject({
      statusCode: 410,
      code: 'INVITATION_EXPIRED',
    });

    await expect(
      prisma.companyInvitation.findUniqueOrThrow({
        where: { id: staleInvitationId },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: 'expired' });
  });

  it('rejects early expiry while the recipient remains tenantless', async () => {
    await expect(
      withUserContext(tenantlessExpiryRecipientId, async (db) => {
        await db.$executeRaw`SELECT set_config('app.tenant_id', ${tenantAId}, true)`;
        return db.$executeRaw`
          UPDATE "company_invitations"
          SET "status" = 'expired'
          WHERE "id" = ${tenantlessExpiryInvitationId}::uuid
        `;
      }),
    ).rejects.toBeDefined();
  });
});
