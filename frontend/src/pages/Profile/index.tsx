import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { Check, Copy, KeyRound, Save, Upload } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useProfile, useUpdateProfile, useUploadAvatar } from '@/hooks/queries/useProfile';
import type { CurrentUserProfile, UpdateProfileInput } from '@/services/profile';

const MAX_AVATAR_BYTES = 25 * 1024 * 1024;

type ProfileFormValues = {
  fullName: string;
  email: string;
};

type PasswordFormValues = {
  currentPassword: string;
  newPassword: string;
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
    <section className="space-y-6 rounded-lg border border-border bg-card p-6">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
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
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const syncedProfileKey = useRef<string | null>(null);

  const profileForm = useForm<ProfileFormValues>({
    defaultValues: { fullName: '', email: '' },
  });
  const passwordForm = useForm<PasswordFormValues>({
    defaultValues: { currentPassword: '', newPassword: '' },
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
    resetPassword({ currentPassword: '', newPassword: '' });
    resetPreferences({
      notifyTaskAssigned: profile.notifyTaskAssigned,
      notifyTaskCommented: profile.notifyTaskCommented,
      notifyMessageReceived: profile.notifyMessageReceived,
    });
  }, [profile, resetPassword, resetPreferences, resetProfile]);

  useEffect(() => {
    return () => {
      if (avatarPreview?.startsWith('blob:')) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

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
      const result = await updateMutation.mutateAsync(values satisfies UpdateProfileInput);
      handleCredentialResult(result);
      if (!('sessionRevoked' in result)) passwordForm.reset();
    } catch (error) {
      setPasswordError(getErrorMessage(error));
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

  const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setAvatarError(null);
    setAvatarFile(null);
    setAvatarPreview(null);

    if (!file) return;
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError('Avatar dosyası 25 MB veya daha küçük olmalı.');
      event.target.value = '';
      return;
    }

    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const onAvatarSubmit = async () => {
    if (!avatarFile) return;
    setAvatarError(null);
    try {
      await uploadMutation.mutateAsync(avatarFile);
      setAvatarFile(null);
      setAvatarPreview(null);
    } catch (error) {
      setAvatarError(getErrorMessage(error));
    }
  };

  const copyDisplayId = async () => {
    if (!profile) return;
    await navigator.clipboard?.writeText(profile.displayId);
    setCopied(true);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-foreground">Profil</h1>
        <p className="text-sm text-secondary-foreground">
          Kişisel bilgilerini, avatarını, şifreni ve bildirim tercihlerini yönet.
        </p>
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
          <Section title="Avatar">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
              <Avatar className="h-20 w-20">
                <AvatarImage src={avatarPreview ?? profile.avatarUrl ?? undefined} alt="Avatar" />
                <AvatarFallback>{initials(profile.fullName)}</AvatarFallback>
              </Avatar>
              <div className="space-y-3">
                <label className="block space-y-2 text-sm font-medium text-foreground">
                  <span>Avatar dosyası</span>
                  <Input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleAvatarChange}
                  />
                </label>
                <p className="text-xs text-secondary-foreground">
                  JPEG, PNG veya WebP · en fazla 25 MB
                </p>
                <FieldError message={avatarError ?? undefined} />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onAvatarSubmit}
                  loading={uploadMutation.isPending}
                  disabled={!avatarFile}
                >
                  <Upload size={16} aria-hidden="true" />
                  Avatarı yükle
                </Button>
              </div>
            </div>
          </Section>

          <Section title="Kişisel bilgiler">
            <form className="space-y-6" onSubmit={profileForm.handleSubmit(onProfileSubmit)}>
              <div className="grid gap-6 sm:grid-cols-2">
                <label className="space-y-2 text-sm font-medium text-foreground">
                  <span>Ad soyad</span>
                  <Input
                    {...profileForm.register('fullName', {
                      required: 'Ad soyad zorunlu.',
                      minLength: { value: 2, message: 'Ad soyad en az 2 karakter olmalı.' },
                      maxLength: { value: 100, message: 'Ad soyad en fazla 100 karakter olmalı.' },
                    })}
                  />
                  <FieldError message={profileForm.formState.errors.fullName?.message} />
                </label>
                <label className="space-y-2 text-sm font-medium text-foreground">
                  <span>E-posta</span>
                  <Input
                    type="email"
                    {...profileForm.register('email', {
                      required: 'E-posta zorunlu.',
                      maxLength: { value: 255, message: 'E-posta en fazla 255 karakter olmalı.' },
                    })}
                  />
                  <FieldError message={profileForm.formState.errors.email?.message} />
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <Button type="submit" loading={updateMutation.isPending}>
                  <Save size={16} aria-hidden="true" />
                  Profil bilgilerini kaydet
                </Button>
                <FieldError message={profileError ?? undefined} />
              </div>
            </form>
          </Section>

          <Section title="Hesap kimliği">
            <div className="flex flex-wrap items-center gap-4">
              <code className="rounded bg-muted px-3 py-2 text-sm text-foreground">
                {profile.displayId}
              </code>
              <Button type="button" variant="secondary" onClick={copyDisplayId}>
                {copied ? (
                  <Check size={16} aria-hidden="true" />
                ) : (
                  <Copy size={16} aria-hidden="true" />
                )}
                {copied ? 'Kopyalandı' : 'Görünen ID kopyala'}
              </Button>
            </div>
          </Section>

          <Section title="Şifre">
            <form className="space-y-6" onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}>
              <div className="grid gap-6 sm:grid-cols-2">
                <label className="space-y-2 text-sm font-medium text-foreground">
                  <span>Mevcut şifre</span>
                  <Input
                    type="password"
                    autoComplete="current-password"
                    {...passwordForm.register('currentPassword', {
                      required: 'Mevcut şifre zorunlu.',
                    })}
                  />
                  <FieldError message={passwordForm.formState.errors.currentPassword?.message} />
                </label>
                <label className="space-y-2 text-sm font-medium text-foreground">
                  <span>Yeni şifre</span>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    {...passwordForm.register('newPassword', {
                      required: 'Yeni şifre zorunlu.',
                      minLength: { value: 8, message: 'Yeni şifre en az 8 karakter olmalı.' },
                    })}
                  />
                  <FieldError message={passwordForm.formState.errors.newPassword?.message} />
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <Button type="submit" loading={updateMutation.isPending}>
                  <KeyRound size={16} aria-hidden="true" />
                  Şifreyi güncelle
                </Button>
                <FieldError message={passwordError ?? undefined} />
              </div>
            </form>
          </Section>

          <Section title="Bildirim tercihleri">
            <form className="space-y-6" onSubmit={preferenceForm.handleSubmit(onPreferenceSubmit)}>
              <div className="space-y-4">
                <label className="flex items-center gap-3 text-sm text-foreground">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    {...preferenceForm.register('notifyTaskAssigned')}
                  />
                  Görev atamaları
                </label>
                <label className="flex items-center gap-3 text-sm text-foreground">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    {...preferenceForm.register('notifyTaskCommented')}
                  />
                  Görev yorumları
                </label>
                <label className="flex items-center gap-3 text-sm text-foreground">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    {...preferenceForm.register('notifyMessageReceived')}
                  />
                  Yeni mesajlar
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <Button type="submit" loading={updateMutation.isPending}>
                  <Save size={16} aria-hidden="true" />
                  Tercihleri kaydet
                </Button>
                <FieldError message={preferenceError ?? undefined} />
              </div>
            </form>
          </Section>
        </>
      )}
    </div>
  );
}
