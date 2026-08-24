import { describe, it, expect } from 'vitest';
import { canSeeNavItem, PRIMARY_NAV, ALL_NAV } from './navigation';

describe('navigation', () => {
  it('PRIMARY_NAV contains the five core items', () => {
    const paths = PRIMARY_NAV.map((i) => i.path);
    expect(paths).toContain('/dashboard');
    expect(paths).toContain('/teams');
    expect(paths).toContain('/tasks');
    expect(paths).toContain('/permissions');
    expect(paths).toContain('/profile');
  });

  it('ALL_NAV includes chat and company management', () => {
    const paths = ALL_NAV.map((i) => i.path);
    expect(paths).toContain('/chat/:id');
    expect(paths).toContain('/company');
    expect(ALL_NAV.find((item) => item.path === '/company')).toMatchObject({
      label: 'Şirket Yönetimi',
      requiredRoles: ['companyAdmin'],
    });
  });

  it('canSeeNavItem returns true for items without requiredRoles', () => {
    const dashboard = PRIMARY_NAV.find((i) => i.path === '/dashboard')!;
    expect(canSeeNavItem(dashboard, undefined)).toBe(true);
    expect(canSeeNavItem(dashboard, 'member')).toBe(true);
  });

  it('canSeeNavItem gates by requiredRoles', () => {
    const permissions = PRIMARY_NAV.find((i) => i.path === '/permissions')!;
    expect(canSeeNavItem(permissions, 'companyAdmin')).toBe(true);
    expect(canSeeNavItem(permissions, 'member')).toBe(false);
    expect(canSeeNavItem(permissions, undefined)).toBe(false);
  });
});
