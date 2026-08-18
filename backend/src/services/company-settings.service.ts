import { Prisma } from '@prisma/client';
import type { TenantDb } from '../db/types';
import { AppError } from '../lib/appError';
import { companyNameKey } from './tenant.service';
import { assertCompanyAdmin } from './company-users.service';
import type { Actor } from '../lib/permissions';
import type { UpdateCompanySettingsInput } from '../schemas/users.schema';

export type CompanySettings = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
};

const companySettingsSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  logoUrl: true,
} as const;

export async function getCompanySettings(db: TenantDb, actor: Actor): Promise<CompanySettings> {
  const tenantId = assertCompanyAdmin(actor);
  const tenant = await db.tenant.findFirst({
    where: { id: tenantId },
    select: companySettingsSelect,
  });
  if (!tenant) throw new AppError(404, 'Şirket bulunamadı', 'NOT_FOUND');
  return tenant;
}

export async function updateCompanySettings(
  db: TenantDb,
  actor: Actor,
  input: UpdateCompanySettingsInput,
): Promise<CompanySettings> {
  const tenantId = assertCompanyAdmin(actor);
  const data = {
    ...(input.name !== undefined && { name: input.name, nameKey: companyNameKey(input.name) }),
    ...(input.description !== undefined && { description: input.description }),
  };

  try {
    return await db.tenant.update({
      where: { id: tenantId },
      data,
      select: companySettingsSelect,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError(
        409,
        'Bu şirket adı başka bir şirket tarafından kullanılıyor',
        'COMPANY_NAME_ALREADY_IN_USE',
      );
    }
    throw error;
  }
}

export async function updateCompanyLogoUrl(
  db: TenantDb,
  actor: Actor,
  logoUrl: string,
): Promise<CompanySettings> {
  const tenantId = assertCompanyAdmin(actor);
  return db.tenant.update({
    where: { id: tenantId },
    data: { logoUrl },
    select: companySettingsSelect,
  });
}

export async function replaceCompanyLogo(
  db: TenantDb,
  actor: Actor,
  logoUrl: string,
): Promise<{ settings: CompanySettings; previousLogoUrl: string | null }> {
  const tenantId = assertCompanyAdmin(actor);
  const current = await db.tenant.findFirst({
    where: { id: tenantId },
    select: { logoUrl: true },
  });
  if (!current) throw new AppError(404, 'Şirket bulunamadı', 'NOT_FOUND');

  return {
    settings: await updateCompanyLogoUrl(db, actor, logoUrl),
    previousLogoUrl: current.logoUrl,
  };
}
