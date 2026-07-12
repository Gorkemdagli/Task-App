import { api } from '../lib/api';

/**
 * Backend response şeması ile birebir. Tarihler string olarak gelir (JSON).
 */
export type Team = {
  id: string;
  name: string;
  description: string | null;
  tenantId: string;
  memberCount: number;
  createdAt: string;
};

export type TeamMemberRole = 'member' | 'teamAdmin';

export type TeamMember = {
  userId: string;
  displayId: string;
  fullName: string;
  avatarUrl: string | null;
  role: TeamMemberRole;
  joinedAt: string;
};

export type TeamDetail = Team & {
  members: TeamMember[];
  taskCount: number;
};

export type CreateTeamInput = {
  name: string;
  description?: string;
};

export type AddMemberInput = {
  displayId: string;
};

export async function listTeams(): Promise<Team[]> {
  const r = await api.get<Team[]>('/teams');
  return r.data;
}

export async function getTeam(id: string): Promise<TeamDetail> {
  const r = await api.get<TeamDetail>(`/teams/${id}`);
  return r.data;
}

export async function createTeam(input: CreateTeamInput): Promise<Team> {
  const r = await api.post<Team>('/teams', input);
  return r.data;
}

export async function addMember(teamId: string, input: AddMemberInput): Promise<TeamMember> {
  const r = await api.post<TeamMember>(`/teams/${teamId}/members`, input);
  return r.data;
}

export async function removeMember(teamId: string, userId: string): Promise<void> {
  await api.delete(`/teams/${teamId}/members/${userId}`);
}
