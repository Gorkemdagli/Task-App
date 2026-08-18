import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { TenantDb } from '../db/types';
import {
  getCompanySettings,
  replaceCompanyLogo,
  updateCompanyLogoUrl,
  updateCompanySettings,
} from './company-settings.service';

function mockDb() {
  return {
    tenant: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  } as unknown as TenantDb;
}

const admin = { id: 'admin', role: 'companyAdmin' as const, tenantId: 'tenant-a' };
const member = { id: 'member', role: 'member' as const, tenantId: 'tenant-a' };
const settings = {
  id: 'tenant-a',
  name: 'Acme Corp',
  slug: 'acme-corp',
  description: 'Description',
  logoUrl: null,
};

describe('company settings service', () => {
  it('blocks non-company-admin reads', async () => {
    const db = mockDb();

    await expect(getCompanySettings(db, member)).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
    expect(db.tenant.findFirst).not.toHaveBeenCalled();
  });

  it('reads only actor tenant settings', async () => {
    const db = mockDb();
    vi.mocked(db.tenant.findFirst).mockResolvedValue(settings as never);

    await expect(getCompanySettings(db, admin)).resolves.toEqual(settings);
    expect(db.tenant.findFirst).toHaveBeenCalledWith({
      where: { id: 'tenant-a' },
      select: { id: true, name: true, slug: true, description: true, logoUrl: true },
    });
  });

  it('updates name key and description without changing slug', async () => {
    const db = mockDb();
    vi.mocked(db.tenant.update).mockResolvedValue({
      ...settings,
      name: 'New Company',
      description: 'Updated',
    } as never);

    await expect(
      updateCompanySettings(db, admin, { name: 'New Company', description: 'Updated' }),
    ).resolves.toEqual({ ...settings, name: 'New Company', description: 'Updated' });
    expect(db.tenant.update).toHaveBeenCalledWith({
      where: { id: 'tenant-a' },
      data: { name: 'New Company', nameKey: 'new-company', description: 'Updated' },
      select: { id: true, name: true, slug: true, description: true, logoUrl: true },
    });
  });

  it('maps concurrent company name conflicts', async () => {
    const db = mockDb();
    vi.mocked(db.tenant.update).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: '5.22.0',
      }),
    );

    await expect(updateCompanySettings(db, admin, { name: 'New Company' })).rejects.toMatchObject({
      statusCode: 409,
      code: 'COMPANY_NAME_ALREADY_IN_USE',
    });
  });

  it('updates only tenant logo URL', async () => {
    const db = mockDb();
    vi.mocked(db.tenant.update).mockResolvedValue({
      ...settings,
      logoUrl: 'https://storage.test/new.webp',
    } as never);

    await expect(updateCompanyLogoUrl(db, admin, 'https://storage.test/new.webp')).resolves.toEqual(
      { ...settings, logoUrl: 'https://storage.test/new.webp' },
    );
    expect(db.tenant.update).toHaveBeenCalledWith({
      where: { id: 'tenant-a' },
      data: { logoUrl: 'https://storage.test/new.webp' },
      select: { id: true, name: true, slug: true, description: true, logoUrl: true },
    });
  });

  it('returns previous tenant-owned logo for post-commit cleanup', async () => {
    const db = mockDb();
    vi.mocked(db.tenant.findFirst).mockResolvedValue({ logoUrl: 'old-logo' } as never);
    vi.mocked(db.tenant.update).mockResolvedValue({ ...settings, logoUrl: 'new-logo' } as never);

    await expect(replaceCompanyLogo(db, admin, 'new-logo')).resolves.toEqual({
      settings: { ...settings, logoUrl: 'new-logo' },
      previousLogoUrl: 'old-logo',
    });
  });
});
