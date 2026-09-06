import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as companyUsersService from './companyUsers';

describe('company users service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('does not expose the obsolete direct role mutation', () => {
    expect(companyUsersService).not.toHaveProperty('updateCompanyRole');
  });
});
