import { useEffect, useState, type FormEvent } from 'react';
import { Camera, UserRound } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  useCompanySettings,
  useUpdateCompanySettings,
  useUploadCompanyLogo,
} from '@/hooks/queries/useCompanySettings';
import {
  useCancelCompanyInvitation,
  useCompanyInvitationAdmin,
  useCreateCompanyInvitation,
} from '@/hooks/queries/useCompanyInvitations';
import { useCompanyUsers } from '@/hooks/queries/useCompanyUsers';
import { useTeams } from '@/hooks/queries/useTeams';
import { useAuth } from '@/hooks/useAuth';
import { getApiErrorMessage } from '@/lib/apiError';
import type { CompanyInvitationAdminDTO } from '@/services/companyInvitations';
import type { CompanySettings } from '@/services/companySettings';

const MAX_LOGO_SIZE = 25 * 1024 * 1024;
const LOGO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function getErrorCode(error: unknown) {
  if (!error || typeof error !== 'object') return undefined;
  const response = (error as { response?: { data?: { error?: unknown } } }).response;
  return typeof response?.data?.error === 'string' ? response.data.error : undefined;
}

type CompanySettingsContentProps = {
  settings: CompanySettings;
  updateSettings: ReturnType<typeof useUpdateCompanySettings>;
  uploadLogo: ReturnType<typeof useUploadCompanyLogo>;
  invitations: ReturnType<typeof useCompanyInvitationAdmin>;
  createInvitation: ReturnType<typeof useCreateCompanyInvitation>;
  cancelInvitation: ReturnType<typeof useCancelCompanyInvitation>;
};

function CompanySettingsContent({
  settings,
  updateSettings,
  uploadLogo,
  invitations,
  createInvitation,
  cancelInvitation,
}: CompanySettingsContentProps) {
  const teamsQuery = useTeams();
  const usersQuery = useCompanyUsers();
  const [name, setName] = useState(settings.name);
  const [description, setDescription] = useState(settings.description ?? '');
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [userIdentifier, setUserIdentifier] = useState('');
  const [userFeedback, setUserFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [invitationToCancel, setInvitationToCancel] = useState<CompanyInvitationAdminDTO | null>(
    null,
  );

  useEffect(() => {
    return () => {
      if (logoPreview && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(logoPreview);
      }
    };
  }, [logoPreview]);

  const handleSettingsSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await updateSettings.mutateAsync({
      name: name.trim(),
      description: description.trim() || null,
    });
  };

  const handleLogoChange = async (file: File | undefined) => {
    setLogoError(null);
    if (!file) return;
    if (file.size > MAX_LOGO_SIZE) {
      setLogoPreview(null);
      setLogoError('Logo dosyası 25 MB veya daha küçük olmalı.');
      return;
    }
    if (!LOGO_TYPES.includes(file.type)) {
      setLogoPreview(null);
      setLogoError('Logo JPEG, PNG veya WebP olmalı.');
      return;
    }
    setLogoPreview(URL.createObjectURL(file));
    try {
      await uploadLogo.mutateAsync(file);
      setLogoPreview(null);
    } catch {
      // The mutation state renders the existing upload error message.
    }
  };

  const handleCreateInvitation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setUserFeedback(null);
    try {
      await createInvitation.mutateAsync(userIdentifier);
      setUserIdentifier('');
      setUserFeedback({ type: 'success', message: 'Davet gönderildi.' });
    } catch (error) {
      const code = getErrorCode(error);
      let message = 'Davet gönderilemedi.';
      if (code === 'USER_NOT_FOUND') {
        message = 'Kullanıcı bulunamadı.';
      } else if (code === 'INVITATION_ALREADY_PENDING') {
        message = 'Bu kullanıcıya zaten bekleyen davet var.';
      } else {
        message = getApiErrorMessage(error, message);
      }
      setUserFeedback({ type: 'error', message });
    }
  };

  const handleCancelInvitation = async () => {
    if (!invitationToCancel) return;
    try {
      await cancelInvitation.mutateAsync(invitationToCancel.id);
      setInvitationToCancel(null);
      setUserFeedback({ type: 'success', message: 'Davet iptal edildi.' });
    } catch (error) {
      setUserFeedback({
        type: 'error',
        message: getApiErrorMessage(error, 'Davet iptal edilemedi.'),
      });
    }
  };

  const summaryUnavailable =
    teamsQuery.isPending || usersQuery.isPending || teamsQuery.isError || usersQuery.isError;
  const teamCount = summaryUnavailable || !teamsQuery.data ? '—' : teamsQuery.data.length;
  const memberCount = summaryUnavailable || !usersQuery.data ? '—' : usersQuery.data.length;

  return (
    <section data-testid="company-settings-page" className="mx-auto w-full max-w-6xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-4xl font-bold leading-tight text-foreground">Şirket Ayarları</h1>
        <p className="text-sm text-secondary-foreground">
          Şirket kimliği ve kullanıcı erişimini yönetin.
        </p>
      </header>

      <div
        data-testid="company-settings-main-grid"
        className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]"
      >
        <aside
          data-testid="company-settings-identity-rail"
          className="flex h-full min-w-0 flex-col rounded-lg border border-border bg-card p-6"
        >
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center lg:flex-col lg:items-start">
            <label
              htmlFor="company-logo-upload"
              className="group relative block h-40 w-40 shrink-0 cursor-pointer self-center rounded-lg focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 lg:self-auto"
            >
              <Avatar className="h-40 w-40 rounded-lg">
                {logoPreview || settings.logoUrl ? (
                  <img
                    src={logoPreview ?? settings.logoUrl ?? undefined}
                    alt={logoPreview ? 'Şirket logosu önizleme' : 'Şirket logosu'}
                    className="aspect-square h-full w-full"
                  />
                ) : (
                  <AvatarFallback className="text-4xl font-semibold">
                    {settings.name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                )}
              </Avatar>
              <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-lg bg-black/60 px-2 text-center text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <Camera className="h-5 w-5" aria-hidden="true" />
                {uploadLogo.isPending
                  ? 'Yükleniyor…'
                  : logoPreview || settings.logoUrl
                    ? 'Logoyu değiştir'
                    : 'Logo yükle'}
              </span>
              <Input
                id="company-logo-upload"
                aria-label="Şirket logosu"
                className="sr-only"
                type="file"
                accept={LOGO_TYPES.join(',')}
                disabled={uploadLogo.isPending}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.currentTarget.value = '';
                  void handleLogoChange(file);
                }}
              />
            </label>
            <div className="min-w-0 space-y-1">
              <h2 className="break-words text-2xl font-semibold">{settings.name}</h2>
              <p className="break-all text-sm text-secondary-foreground">{settings.slug}</p>
            </div>
          </div>
          {logoError && (
            <p role="alert" className="mt-3 text-sm text-priority-high">
              {logoError}
            </p>
          )}
          {uploadLogo.isError && (
            <p role="alert" className="mt-3 text-sm text-priority-high">
              Logo yüklenemedi.
            </p>
          )}
          <div
            data-testid="company-settings-summary"
            className="mt-5 space-y-3 border-t border-border pt-5"
          >
            <div>
              <h3 className="text-sm font-semibold">Şirket durumu</h3>
              <p className="text-sm">Mevcut</p>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-secondary-foreground">Takım sayısı</dt>
                <dd className="font-semibold">{teamCount}</dd>
              </div>
              <div>
                <dt className="text-secondary-foreground">Üye sayısı</dt>
                <dd className="font-semibold">{memberCount}</dd>
              </div>
            </dl>
          </div>
        </aside>

        <div
          data-testid="company-settings-profile-panel"
          className="h-full min-w-0 rounded-lg border border-border bg-card p-6"
        >
          <form onSubmit={handleSettingsSubmit} className="space-y-5">
            <h2 className="text-lg font-semibold">Şirket bilgileri</h2>
            <div className="space-y-2">
              <label htmlFor="company-name" className="text-sm font-medium">
                Şirket adı
              </label>
              <Input
                id="company-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="company-description" className="text-sm font-medium">
                Şirket açıklaması
              </label>
              <textarea
                id="company-description"
                aria-label="Şirket açıklaması"
                maxLength={500}
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="flex min-h-20 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              />
              <p className="text-right text-xs text-secondary-foreground">{description.length}/500</p>
            </div>
            <div className="space-y-2">
              <label htmlFor="company-slug" className="text-sm font-medium">
                Şirket slug
              </label>
              <Input
                id="company-slug"
                aria-label="Şirket slug"
                aria-describedby="company-slug-description"
                value={settings.slug}
                readOnly
              />
              <p id="company-slug-description" className="text-xs text-secondary-foreground">
                Salt okunur şirket kimliği.
              </p>
            </div>
            {updateSettings.isError && (
              <p role="alert" className="text-sm text-priority-high">
                Şirket değişiklikleri kaydedilemedi.
              </p>
            )}
            <div className="flex justify-end">
              <Button type="submit" loading={updateSettings.isPending}>
                Şirket değişikliklerini kaydet
              </Button>
            </div>
          </form>
        </div>
      </div>

      <section
        data-testid="company-settings-operations-queue"
        className="w-full space-y-6 rounded-lg border border-border bg-card p-6"
      >
        <form
          onSubmit={handleCreateInvitation}
          data-testid="company-settings-invitation-band"
          className="space-y-4"
        >
          <h2 className="text-lg font-semibold">Davet gönder</h2>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="space-y-2">
              <label htmlFor="company-user-identifier" className="text-sm font-medium">
                Kullanıcı display ID veya e-posta
              </label>
              <Input
                id="company-user-identifier"
                aria-label="Kullanıcı display ID veya e-posta"
                placeholder="A3X9K veya user@example.com"
                value={userIdentifier}
                onChange={(event) => setUserIdentifier(event.target.value)}
              />
            </div>
            <Button type="submit" loading={createInvitation.isPending} className="w-full lg:w-auto">
              Davet Gönder
            </Button>
          </div>
          {userFeedback && (
            <p
              role={userFeedback.type === 'success' ? 'status' : 'alert'}
              className={`rounded-md border border-border bg-muted px-3 py-2 text-sm ${
                userFeedback.type === 'success' ? 'text-priority-low' : 'text-priority-high'
              }`}
            >
              {userFeedback.message}
            </p>
          )}
        </form>

          <section
            data-testid="company-settings-invitation-ledger"
            className="space-y-4 overflow-hidden border-t border-border pt-6"
          >
            <div>
              <h2 className="text-lg font-semibold">Bekleyen davetler</h2>
              <p className="text-sm text-secondary-foreground">
                Henüz kabul edilmemiş şirket davetleri.
              </p>
            </div>
            {invitations.isPending ? (
              <p
                data-testid="company-invitations-loading"
                className="text-sm text-secondary-foreground"
              >
                Davetler yükleniyor…
              </p>
            ) : invitations.isError ? (
              <p role="alert" className="text-sm text-priority-high">
                Davetler yüklenemedi.
              </p>
            ) : invitations.data && invitations.data.length > 0 ? (
              <ul data-testid="company-invitations-list" className="space-y-2">
                {invitations.data.map((invitation) => (
                  <li
                    key={invitation.id}
                    data-testid={`company-invitation-row-${invitation.id}`}
                    className="flex min-w-0 flex-col gap-3 border-b border-border pb-3 last:border-b-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                        <UserRound className="h-5 w-5 text-secondary-foreground" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 break-words">
                        <p className="break-words text-sm font-medium text-foreground">
                          {invitation.recipientFullName}
                        </p>
                        <p className="break-words text-xs text-secondary-foreground">
                          {invitation.recipientEmail} · {invitation.recipientDisplayId}
                        </p>
                        <p className="break-words text-xs text-secondary-foreground">
                          Son geçerlilik:{' '}
                          {new Intl.DateTimeFormat('tr-TR').format(new Date(invitation.expiresAt))}
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="shrink-0 self-start sm:self-auto"
                      onClick={() => setInvitationToCancel(invitation)}
                    >
                      İptal
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p data-testid="company-invitations-empty" className="text-sm text-secondary-foreground">
                Bekleyen davet yok.
              </p>
            )}
          </section>
      </section>

      <Dialog
        open={Boolean(invitationToCancel)}
        onOpenChange={(open) => {
          if (!open) setInvitationToCancel(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Daveti iptal et</DialogTitle>
            <DialogDescription>
              {invitationToCancel?.recipientEmail} adresine gönderilen davet iptal edilecek.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setInvitationToCancel(null)}>
              Vazgeç
            </Button>
            <Button
              type="button"
              variant="destructive"
              loading={cancelInvitation.isPending}
              onClick={handleCancelInvitation}
            >
              Daveti iptal et
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function CompanySettingsContentPage() {
  const settingsQuery = useCompanySettings();
  const updateSettings = useUpdateCompanySettings();
  const uploadLogo = useUploadCompanyLogo();
  const invitations = useCompanyInvitationAdmin();
  const createInvitation = useCreateCompanyInvitation();
  const cancelInvitation = useCancelCompanyInvitation();

  if (settingsQuery.isLoading) {
    return <p className="text-sm text-secondary-foreground">Yükleniyor…</p>;
  }

  if (settingsQuery.isError || !settingsQuery.data) {
    return (
      <p role="alert" className="text-sm text-priority-high">
        Şirket ayarları yüklenemedi.
      </p>
    );
  }

  return (
    <CompanySettingsContent
      key={settingsQuery.data.id}
      settings={settingsQuery.data}
      updateSettings={updateSettings}
      uploadLogo={uploadLogo}
      invitations={invitations}
      createInvitation={createInvitation}
      cancelInvitation={cancelInvitation}
    />
  );
}

export function CompanySettingsPage() {
  const { isCompanyAdmin } = useAuth();
  if (!isCompanyAdmin) return <Navigate to="/dashboard" replace />;
  return <CompanySettingsContentPage />;
}
