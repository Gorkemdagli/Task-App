// TODO(Faz 5): Replace with real /api/v1/users/me + /api/v1/teams/:id/members query. Do not consume in production-like flows.

export interface MockMember {
  id: string;
  fullName: string;
  initials: string;
  role: 'companyAdmin' | 'teamAdmin' | 'member';
}

export const MOCK_MEMBERS: MockMember[] = [
  { id: 'u1', fullName: 'Ada Yılmaz', initials: 'AY', role: 'companyAdmin' },
  { id: 'u2', fullName: 'Berk Demir', initials: 'BD', role: 'teamAdmin' },
  { id: 'u3', fullName: 'Cem Aydın', initials: 'CA', role: 'member' },
  { id: 'u4', fullName: 'Deniz Kaya', initials: 'DK', role: 'member' },
  { id: 'u5', fullName: 'Ece Polat', initials: 'EP', role: 'teamAdmin' },
  { id: 'u6', fullName: 'Fırat Acar', initials: 'FA', role: 'member' },
];
