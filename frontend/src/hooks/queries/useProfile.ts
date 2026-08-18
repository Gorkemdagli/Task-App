import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as profileService from '@/services/profile';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore, type AuthUser } from '@/stores/authStore';

function toAuthUser(profile: profileService.CurrentUserProfile): AuthUser {
  return {
    id: profile.id,
    displayId: profile.displayId,
    email: profile.email,
    fullName: profile.fullName,
    role: profile.role,
    tenantId: profile.tenantId,
    tenantName: profile.tenantName,
    avatarUrl: profile.avatarUrl,
  };
}

function syncProfile(
  profile: profileService.CurrentUserProfile,
  queryClient: ReturnType<typeof useQueryClient>,
) {
  queryClient.setQueryData(queryKeys.profile(profile.id), profile);
  useAuthStore.getState().setUser(toAuthUser(profile));
}

export function useProfile() {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  return useQuery({
    queryKey: queryKeys.profile(userId ?? 'none'),
    queryFn: profileService.getProfile,
    enabled: Boolean(userId),
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: profileService.updateProfile,
    onSuccess: (result) => {
      if ('sessionRevoked' in result) {
        queryClient.clear();
        useAuthStore.getState().clearAuth();
        return;
      }
      syncProfile(result, queryClient);
    },
  });
}

export function useUploadAvatar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: profileService.uploadAvatar,
    onSuccess: (profile) => syncProfile(profile, queryClient),
  });
}
