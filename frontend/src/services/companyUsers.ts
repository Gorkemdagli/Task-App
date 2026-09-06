import { api } from '../lib/api';

export type CompanyUser = {
  id: string;
  displayId: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  role: 'member' | 'companyAdmin';
  teamRoles: Array<{ teamId: string; teamName: string; role: 'member' | 'teamAdmin' }>;
};

export type UpdateCompanyPermissionsInput = {
  userId: string;
  role: CompanyUser['role'];
  teamRoles: Array<{ teamId: string; role: 'member' | 'teamAdmin' }>;
};

export async function listCompanyUsers(): Promise<CompanyUser[]> {
  const response = await api.get<CompanyUser[]>('/company/users');
  return response.data;
}

export async function updateCompanyPermissions(
  input: UpdateCompanyPermissionsInput,
): Promise<CompanyUser> {
  const response = await api.patch<CompanyUser>(`/users/${input.userId}/permissions`, {
    role: input.role,
    teamRoles: input.teamRoles,
  });
  return response.data;
}
