import { describe, expect, it } from 'vitest';
import { companyDashboardQuerySchema } from './company-dashboard.schema';

describe('companyDashboardQuerySchema', () => {
  it('accepts empty input and one UUID teamId', () => {
    expect(companyDashboardQuerySchema.parse({})).toEqual({});
    expect(
      companyDashboardQuerySchema.parse({
        teamId: '11111111-1111-4111-8111-111111111111',
      }),
    ).toEqual({ teamId: '11111111-1111-4111-8111-111111111111' });
  });

  it.each(['7d', '30d', '90d'])('accepts range %s', (range) => {
    expect(companyDashboardQuerySchema.parse({ range })).toEqual({ range });
  });

  it.each([
    { teamId: 'not-a-uuid' },
    { teamId: '' },
    { range: '1d' },
    { unknown: 'field' },
  ])(
    'rejects invalid input %#',
    (input) => {
      expect(companyDashboardQuerySchema.safeParse(input).success).toBe(false);
    },
  );
});
