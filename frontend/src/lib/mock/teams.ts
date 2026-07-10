// TODO(Faz 5): Replace with real /api/v1/teams query. Do not consume in production-like flows.

export interface MockTeam {
  id: string;
  name: string;
}

export const MOCK_TEAMS: MockTeam[] = [
  { id: 'team-design', name: 'Tasarım' },
  { id: 'team-engineering', name: 'Geliştirme' },
  { id: 'team-marketing', name: 'Pazarlama' },
];

export const MOCK_DEFAULT_TEAM_ID = MOCK_TEAMS[0].id;
