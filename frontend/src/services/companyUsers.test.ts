import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as companyUsersService from './companyUsers';

describe('company users service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('removes obsolete direct company-user claim method', () => {
    expect(companyUsersService).not.toHaveProperty('addCompanyUser');
  });
});
