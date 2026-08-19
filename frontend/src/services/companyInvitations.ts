import { api } from '@/lib/api';
import type { AuthUser } from '@/stores/authStore';

export type CompanyInvitationStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired';

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

export async function createCompanyInvitation(
  identifier: string,
): Promise<CompanyInvitationAdminDTO> {
  const normalized = identifier.trim();
  const payload = normalized.includes('@')
    ? { email: normalized.toLowerCase() }
    : { displayId: normalized.toUpperCase() };
  const response = await api.post<CompanyInvitationAdminDTO>('/company/invitations', payload);
  return response.data;
}

export async function listCompanyInvitations(): Promise<CompanyInvitationAdminDTO[]> {
  const response = await api.get<CompanyInvitationAdminDTO[]>(
    '/company/invitations?status=pending',
  );
  return response.data;
}

export async function cancelCompanyInvitation(id: string): Promise<CompanyInvitationAdminDTO> {
  const response = await api.delete<CompanyInvitationAdminDTO>(`/company/invitations/${id}`);
  return response.data;
}

export async function listMyCompanyInvitations(): Promise<CompanyInvitationDTO[]> {
  const response = await api.get<{ invitations: CompanyInvitationDTO[]; pendingCount: number }>(
    '/users/me/company-invitations',
  );
  return response.data.invitations;
}

export async function acceptCompanyInvitation(id: string): Promise<AcceptCompanyInvitationResult> {
  const response = await api.post<AcceptCompanyInvitationResult>(
    `/users/me/company-invitations/${id}/accept`,
  );
  return response.data;
}

export async function rejectCompanyInvitation(id: string): Promise<CompanyInvitationDTO> {
  const response = await api.post<CompanyInvitationDTO>(
    `/users/me/company-invitations/${id}/reject`,
  );
  return response.data;
}
