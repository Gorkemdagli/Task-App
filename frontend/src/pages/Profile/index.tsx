import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { Check, Copy, KeyRound, LogOut, Save, User } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useProfile, useUpdateProfile, useUploadAvatar } from '@/hooks/queries/useProfile';
import { authApi } from '@/lib/api';
import { queryClient } from '@/lib/react-query';
import type { CurrentUserProfile, UpdateProfileInput } from '@/services/profile';
import { useAuthStore } from '@/stores/authStore';
import { useTeamStore } from '@/stores/teamStore';

const MAX_AVATAR_BYTES = 25 * 1024 * 1024;

type ProfileFormValues = {
  fullName: string;
  email: string;
};

type PasswordFormValues = {
  currentPassword: string;
  newPassword: string;
  newPasswordConfirmation: string;
};

type PreferenceFormValues = {
  notifyTaskAssigned: boolean;
  notifyTaskCommented: boolean;
  notifyMessageReceived: boolean;
};

function recordOf(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function getErrorMessage(error: unknown): string {
  const root = recordOf(error);
  const response = recordOf(root?.response);
  const data = recordOf(response?.data);
  const code = typeof data?.code === 'string' ? data.code : null;

  switch (code) {
    case 'INVALID_CURRENT_PASSWORD':
      return 'Mevcut şifre hatalı.';
    case 'EMAIL_ALREADY_IN_USE':
      return 'Bu e-posta zaten kullanılıyor.';
    case 'INVALID_IMAGE':
      return 'Geçersiz görsel.';
    case 'FILE_TOO_LARGE':
      return 'Avatar dosyası 25 MB veya daha küçük olmalı.';
    default:
      return typeof data?.message === 'string'
        ? data.message
        : error instanceof Error
          ? error.message
          : 'İşlem başarısız.';
  }
}

function initials(fullName: string): string {
  return (
    fullName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-6 border-t border-border py-8">
      <h2 className="text-xl font-semibold leading-7 text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-xs text-priority-high">{message}</p> : null;
}

function ProfileLoading() {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-6">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

export function ProfilePage() {
  const navigate = useNavigate();
  const profileQuery = useProfile();
  const updateMutation = useUpdateProfile();
  const uploadMutation = useUploadAvatar();
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isPasswordExpanded, setIsPasswordExpanded] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [isAvatarPreviewOpen, setIsAvatarPreviewOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const syncedProfileKey = useRef<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const profileForm = useForm<ProfileFormValues>({
    defaultValues: { fullName: '', email: '' },
  });
  const passwordForm = useForm<PasswordFormValues>({
    defaultValues: { currentPassword: '', newPassword: '', newPasswordConfirmation: '' },
  });
  const preferenceForm = useForm<PreferenceFormValues>({
    defaultValues: {
      notifyTaskAssigned: true,
      notifyTaskCommented: true,
      notifyMessageReceived: true,
    },
  });

  const { reset: resetProfile } = profileForm;
  const { reset: resetPassword } = passwordForm;
  const { reset: resetPreferences } = preferenceForm;

  const profile = profileQuery.data;

  useEffect(() => {
    if (!profile) return;

    const profileKey = [
      profile.id,
      profile.fullName,
      profile.email,
      profile.notifyTaskAssigned,
      profile.notifyTaskCommented,
      profile.notifyMessageReceived,
    ].join('|');
    if (syncedProfileKey.current === profileKey) return;
    syncedProfileKey.current = profileKey;

    resetProfile({ fullName: profile.fullName, email: profile.email });
    resetPassword({ currentPassword: '', newPassword: '', newPasswordConfirmation: '' });
    resetPreferences({
      notifyTaskAssigned: profile.notifyTaskAssigned,
      notifyTaskCommented: profile.notifyTaskCommented,
      notifyMessageReceived: profile.notifyMessageReceived,
    });
  }, [profile, resetPassword, resetPreferences, resetProfile]);

  const handleCredentialResult = (result: CurrentUserProfile | { sessionRevoked: true }) => {
    if ('sessionRevoked' in result) {
      navigate('/login', { replace: true });
    }
  };

  const onProfileSubmit = async (values: ProfileFormValues) => {
    setProfileError(null);
    try {
      const result = await updateMutation.mutateAsync(values satisfies UpdateProfileInput);
      handleCredentialResult(result);
    } catch (error) {
      setProfileError(getErrorMessage(error));
    }
  };

  const onPasswordSubmit = async (values: PasswordFormValues) => {
    setPasswordError(null);
    try {
      const result = await updateMutation.mutateAsync({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      } satisfies UpdateProfileInput);
      handleCredentialResult(result);
      if (!('sessionRevoked' in result)) passwordForm.reset();
    } catch (error) {
      setPasswordError(getErrorMessage(error));
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await authApi.post('/logout');
    } catch {
      // Local cleanup still completes when the server session is already expired.
    } finally {
      queryClient.clear();
      useAuthStore.getState().clearAuth();
      useTeamStore.getState().clearActiveTeam();
      navigate('/login', { replace: true });
    }
  };

  const onPreferenceSubmit = async (values: PreferenceFormValues) => {
    setPreferenceError(null);
    try {
      const result = await updateMutation.mutateAsync(values satisfies UpdateProfileInput);
      handleCredentialResult(result);
    } catch (error) {
      setPreferenceError(getErrorMessage(error));
    }
  };

  const onAvatarSubmit = async (file: File) => {
    setAvatarError(null);
    try {
      await uploadMutation.mutateAsync(file);
    } catch (error) {
      setAvatarError(getErrorMessage(error));
    }
  };

  const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setAvatarError(null);

    if (!file) return;
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError('Avatar dosyası 25 MB veya daha küçük olmalı.');
      event.target.value = '';
      return;
    }

    void onAvatarSubmit(file);
  };

  const openAvatarPicker = () => {
    avatarInputRef.current?.click();
  };

  const copyDisplayId = async () => {
    if (!profile) return;
    await navigator.clipboard?.writeText(profile.displayId);
    setCopied(true);
  };

  return (
    <div className="mx-auto max-w-[760px] pb-8 pt-4 md:pt-5">
      <header className="mb-6">
        <h1 className="text-3xl font-bold leading-10 text-foreground">Profil</h1>
      </header>

      {profileQuery.isLoading ? <ProfileLoading /> : null}

      {profileQuery.isError || !profile ? (
        !profileQuery.isLoading && (
          <section className="rounded-lg border border-border bg-card p-6">
            <p className="text-sm text-priority-high">Profil yüklenemedi.</p>
          </section>
        )
      ) : (
        <>
          <section aria-label="Hesap kimliği" className="flex flex-wrap items-center gap-x-6 gap-y-4 pb-6">
            <div className="flex shrink-0 flex-col items-center gap-2">
              <button
                type="button"
                aria-label="Profil fotoğrafını görüntüle"
                onClick={() => setIsAvatarPreviewOpen(true)}
                className="rounded-full transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Avatar className="h-14 w-14">
                  <AvatarImage src={profile.avatarUrl ?? undefined} alt="" />
                  <AvatarFallback className="text-lg font-semibold">{initials(profile.fullName)}</AvatarFallback>
                </Avatar>
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleAvatarChange}
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
              />
              <Dialog open={isAvatarPreviewOpen} onOpenChange={setIsAvatarPreviewOpen}>
                <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-xl border-border bg-card p-4 sm:p-5">
                  <DialogHeader className="items-center text-center sm:text-center">
                    <DialogTitle className="text-base">Profil fotoğrafı</DialogTitle>
                    <DialogDescription>{profile.fullName}</DialogDescription>
                  </DialogHeader>
                  <Avatar className="mx-auto h-[min(16rem,55dvh)] w-[min(16rem,55dvh)] max-w-full">
                    <AvatarImage src={profile.avatarUrl ?? undefined} alt={`${profile.fullName} profil fotoğrafı`} />
                    <AvatarFallback className="text-4xl">{initials(profile.fullName)}</AvatarFallback>
                  </Avatar>
                </DialogContent>
              </Dialog>
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="break-words text-lg font-semibold text-foreground">{profile.fullName}</p>
              <p className="break-all text-sm text-muted-foreground">{profile.email}</p>
            </div>
            <Button type="button" variant="secondary" onClick={copyDisplayId} className="w-full bg-transparent sm:w-auto">
              <span>{profile.displayId}</span>
              {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
              <span className="sr-only">{copied ? 'Kopyalandı' : 'Görünen ID kopyala'}</span>
            </Button>
          </section>

          <Section title="Kişisel Bilgiler">
            <form className="space-y-6" onSubmit={profileForm.handleSubmit(onProfileSubmit)}>
              <div className="space-y-4">
                <label className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center sm:gap-6">
                  <span>Ad Soyad</span>
                  <div className="space-y-2">
                    <Input
                      className="h-11 text-foreground"
                      autoComplete="name"
                      {...profileForm.register('fullName', {
                        required: 'Ad soyad zorunlu.',
                        minLength: { value: 2, message: 'Ad soyad en az 2 karakter olmalı.' },
                        maxLength: { value: 100, message: 'Ad soyad en fazla 100 karakter olmalı.' },
                      })}
                    />
                    <FieldError message={profileForm.formState.errors.fullName?.message} />
                  </div>
                </label>
                <label className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center sm:gap-6">
                  <span>E-posta</span>
                  <div className="space-y-2">
                    <Input
                      type="email"
                      className="h-11 text-foreground"
                      autoComplete="email"
                      {...profileForm.register('email', {
                        required: 'E-posta zorunlu.',
                        maxLength: { value: 255, message: 'E-posta en fazla 255 karakter olmalı.' },
                      })}
                    />
                    <FieldError message={profileForm.formState.errors.email?.message} />
                  </div>
                </label>
                <Button type="button" variant="secondary" onClick={openAvatarPicker} loading={uploadMutation.isPending} className="h-11 w-full sm:w-auto">
                  <User className="h-4 w-4" />
                  Profil Fotoğrafı Değiştir
                </Button>
                <FieldError message={avatarError ?? undefined} />
              </div>
              <Button type="submit" className="h-11 w-full" loading={updateMutation.isPending}>
                Değişiklikleri Kaydet
              </Button>
              <FieldError message={profileError ?? undefined} />
            </form>
          </Section>

          <Section title="Bildirim Tercihleri">
            <form className="space-y-5" onSubmit={preferenceForm.handleSubmit(onPreferenceSubmit)}>
              <div className="divide-y divide-border">
                {([
                  ['notifyTaskAssigned', 'Görev atandığında'],
                  ['notifyTaskCommented', 'Yorum geldiğinde'],
                  ['notifyMessageReceived', 'Mesaj geldiğinde'],
                ] as const).map(([name, label]) => (
                  <label key={name} className="flex min-h-14 cursor-pointer items-center justify-between gap-4 py-3 text-sm text-foreground">
                    <span>{label}</span>
                    <input
                      type="checkbox"
                      role="switch"
                      className="relative h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full border border-border bg-secondary transition-colors before:absolute before:left-0.5 before:top-0.5 before:h-[18px] before:w-[18px] before:rounded-full before:bg-muted-foreground before:transition-transform checked:border-primary checked:bg-primary checked:before:translate-x-5 checked:before:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none motion-reduce:before:transition-none"
                      {...preferenceForm.register(name)}
                    />
                  </label>
                ))}
              </div>
              {preferenceForm.formState.isDirty || preferenceError ? (
                <div className="space-y-3">
                  <Button type="submit" className="w-full" loading={updateMutation.isPending}>
                    <Save size={16} aria-hidden="true" />
                    Tercihleri kaydet
                  </Button>
                  <FieldError message={preferenceError ?? undefined} />
                </div>
              ) : null}
            </form>
          </Section>

          <Section title="Güvenlik">
            <Button
              type="button"
              variant="secondary"
              className="h-11 w-full bg-transparent text-foreground"
              aria-expanded={isPasswordExpanded}
              aria-controls="profile-password-form"
              onClick={() => setIsPasswordExpanded((expanded) => !expanded)}
            >
              Şifreyi Değiştir
            </Button>
            {isPasswordExpanded ? (
              <form id="profile-password-form" className="space-y-6" onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}>
                <div className="space-y-4">
                  <label className="block space-y-2 text-sm font-medium text-foreground">
                    <span>Eski şifre</span>
                    <Input
                      type="password"
                      autoComplete="current-password"
                      {...passwordForm.register('currentPassword', {
                        required: 'Eski şifre zorunlu.',
                      })}
                    />
                    <FieldError message={passwordForm.formState.errors.currentPassword?.message} />
                  </label>
                  <label className="block space-y-2 text-sm font-medium text-foreground">
                    <span>Yeni şifre</span>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      {...passwordForm.register('newPassword', {
                        required: 'Yeni şifre zorunlu.',
                        minLength: { value: 8, message: 'Yeni şifre en az 8 karakter olmalı.' },
                        deps: ['newPasswordConfirmation'],
                      })}
                    />
                    <FieldError message={passwordForm.formState.errors.newPassword?.message} />
                  </label>
                  <label className="block space-y-2 text-sm font-medium text-foreground">
                    <span>Yeni şifre onayı</span>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      {...passwordForm.register('newPasswordConfirmation', {
                        required: 'Yeni şifre onayı zorunlu.',
                        validate: (value) => value === passwordForm.getValues('newPassword') || 'Yeni şifreler eşleşmiyor.',
                      })}
                    />
                    <FieldError message={passwordForm.formState.errors.newPasswordConfirmation?.message} />
                  </label>
                </div>
                <FieldError message={passwordError ?? undefined} />
                <Button type="submit" className="h-11 w-full" loading={updateMutation.isPending} disabled={isLoggingOut}>
                  <KeyRound size={16} aria-hidden="true" />
                  Şifreyi güncelle
                </Button>
              </form>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              className="h-11 w-full bg-transparent text-priority-high focus:bg-secondary focus:text-priority-high"
              onClick={handleLogout}
              loading={isLoggingOut}
              disabled={updateMutation.isPending}
            >
              <LogOut size={16} aria-hidden="true" />
              Çıkış Yap
            </Button>
          </Section>
        </>
      )}
    </div>
  );
}
