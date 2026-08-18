import { api } from '@/lib/api';

export type CompanySettings = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
};

export type UpdateCompanySettingsInput = {
  name?: string;
  description?: string | null;
};

export async function getCompanySettings(): Promise<CompanySettings> {
  const response = await api.get<CompanySettings>('/company/settings');
  return response.data;
}

export async function updateCompanySettings(
  input: UpdateCompanySettingsInput,
): Promise<CompanySettings> {
  const response = await api.patch<CompanySettings>('/company/settings', input);
  return response.data;
}

export async function uploadCompanyLogo(file: File): Promise<CompanySettings> {
  const formData = new FormData();
  formData.append('logo', file);
  const response = await api.post<CompanySettings>('/company/settings/logo', formData);
  return response.data;
}
