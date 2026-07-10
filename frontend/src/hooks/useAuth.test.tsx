import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAuth } from './useAuth';
import { useAuthStore, type AuthUser } from '../stores/authStore';

const baseUser: AuthUser = {
  id: '1',
  displayId: 'A3X9K',
  email: 'a@x.com',
  fullName: 'Ada',
  role: 'member',
  tenantId: 't1',
};

describe('useAuth', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: null, user: null });
  });

  it('isAuthenticated false when no token', () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it('isAuthenticated true when token present', () => {
    useAuthStore.setState({ accessToken: 't', user: baseUser });
    const { result } = renderHook(() => useAuth());
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('isCompanyAdmin only for companyAdmin role', () => {
    useAuthStore.setState({ accessToken: 't', user: { ...baseUser, role: 'companyAdmin' } });
    const { result } = renderHook(() => useAuth());
    expect(result.current.isCompanyAdmin).toBe(true);
    expect(result.current.isTeamAdmin).toBe(true);
  });

  it('isCompanyAdmin false for teamAdmin and member', () => {
    useAuthStore.setState({ accessToken: 't', user: { ...baseUser, role: 'teamAdmin' } });
    const { result } = renderHook(() => useAuth());
    expect(result.current.isCompanyAdmin).toBe(false);
    expect(result.current.isTeamAdmin).toBe(true);
  });

  it('member has neither admin flag', () => {
    useAuthStore.setState({ accessToken: 't', user: { ...baseUser, role: 'member' } });
    const { result } = renderHook(() => useAuth());
    expect(result.current.isCompanyAdmin).toBe(false);
    expect(result.current.isTeamAdmin).toBe(false);
  });
});
