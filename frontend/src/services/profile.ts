import { api } from '@/lib/api';
import type { AuthUser } from '@/stores/authStore';

export type CurrentUserProfile = AuthUser & {
  avatarUrl: string | null;
  notifyTaskAssigned: boolean;
  notifyTaskCommented: boolean;
  notifyMessageReceived: boolean;
};

export type UpdateProfileInput = {
  fullName?: string;
  email?: string;
  currentPassword?: string;
  newPassword?: string;
  notifyTaskAssigned?: boolean;
  notifyTaskCommented?: boolean;
  notifyMessageReceived?: boolean;
};

export type UpdateProfileResult = CurrentUserProfile | { sessionRevoked: true };

export async function getProfile(): Promise<CurrentUserProfile> {
  const response = await api.get<CurrentUserProfile>('/users/me');
  return response.data;
}

export async function updateProfile(input: UpdateProfileInput): Promise<UpdateProfileResult> {
  const response = await api.patch<UpdateProfileResult>('/users/me', input);
  return response.data;
}

export async function uploadAvatar(file: File): Promise<CurrentUserProfile> {
  const formData = new FormData();
  formData.append('avatar', file);
  const response = await api.post<CurrentUserProfile>('/users/me/avatar', formData);
  return response.data;
}
