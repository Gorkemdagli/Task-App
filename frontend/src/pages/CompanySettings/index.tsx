import { useEffect, useState, type FormEvent } from 'react';
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
import { useAuth } from '@/hooks/useAuth';
import type { CompanyInvitationAdminDTO } from '@/services/companyInvitations';
import type { CompanySettings } from '@/services/companySettings';

const MAX_LOGO_SIZE = 25 * 1024 * 1024;
const LOGO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function getErrorCode(error: unknown) {
  if (!error || typeof error !== 'object') return undefined;
  const response = (error as { response?: { data?: { error?: unknown } } }).response;
  return typeof response?.data?.error === 'string' ? response.data.error : undefined;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (!error || typeof error !== 'object') return fallback;
  const response = (error as { response?: { data?: { message?: unknown } } }).response;
  return typeof response?.data?.message === 'string' ? response.data.message : fallback;
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
  const [name, setName] = useState(settings.name);
  const [description, setDescription] = useState(settings.description ?? '');
  const [logoFile, setLogoFile] = useState<File | null>(null);
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

  const handleLogoChange = (file: File | undefined) => {
    setLogoError(null);
    if (!file) return;
    if (file.size > MAX_LOGO_SIZE) {
      setLogoFile(null);
      setLogoPreview(null);
      setLogoError('Logo dosyası 25 MB veya daha küçük olmalı.');
      return;
    }
    if (!LOGO_TYPES.includes(file.type)) {
      setLogoFile(null);
      setLogoPreview(null);
      setLogoError('Logo JPEG, PNG veya WebP olmalı.');
      return;
    }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleLogoSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!logoFile) return;
    await uploadLogo.mutateAsync(logoFile);
    setLogoFile(null);
    setLogoPreview(null);
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
        message = getErrorMessage(error, message);
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
        message: getErrorMessage(error, 'Davet iptal edilemedi.'),
      });
    }
  };

  return (
    <section className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-foreground">Şirket Ayarları</h1>
        <p className="text-sm text-secondary-foreground">
          Şirket kimliği ve kullanıcı erişimini yönetin.
        </p>
      </header>

      <form
        onSubmit={handleLogoSubmit}
        className="space-y-4 rounded-lg border border-border bg-card p-6"
      >
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            {logoPreview || settings.logoUrl ? (
              <img
                src={logoPreview ?? settings.logoUrl ?? undefined}
                alt={logoPreview ? 'Şirket logosu önizleme' : 'Şirket logosu'}
                className="aspect-square h-full w-full"
              />
            ) : (
              <AvatarFallback>{settings.name.slice(0, 2).toUpperCase()}</AvatarFallback>
            )}
          </Avatar>
          <div>
            <h2 className="text-lg font-semibold">Şirket logosu</h2>
            <p className="text-sm text-secondary-foreground">
              JPEG, PNG veya WebP; en fazla 25 MB.
            </p>
          </div>
        </div>
        <Input
          aria-label="Şirket logosu"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => handleLogoChange(event.target.files?.[0])}
        />
        {logoError && (
          <p role="alert" className="text-sm text-priority-high">
            {logoError}
          </p>
        )}
        {uploadLogo.isError && (
          <p role="alert" className="text-sm text-priority-high">
            Logo yüklenemedi.
          </p>
        )}
        <Button type="submit" loading={uploadLogo.isPending} disabled={!logoFile}>
          Logoyu yükle
        </Button>
      </form>

      <form
        onSubmit={handleSettingsSubmit}
        className="space-y-4 rounded-lg border border-border bg-card p-6"
      >
        <h2 className="text-lg font-semibold">Şirket bilgileri</h2>
        <div className="space-y-2">
          <label htmlFor="company-name" className="text-sm font-medium">
            Şirket adı
          </label>
          <Input id="company-name" value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="space-y-2">
          <label htmlFor="company-slug" className="text-sm font-medium">
            Şirket slug
          </label>
          <Input id="company-slug" aria-label="Şirket slug" value={settings.slug} readOnly />
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
            className="flex min-h-20 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="text-right text-xs text-secondary-foreground">{description.length}/500</p>
        </div>
        {updateSettings.isError && (
          <p role="alert" className="text-sm text-priority-high">
            Şirket değişiklikleri kaydedilemedi.
          </p>
        )}
        <Button type="submit" loading={updateSettings.isPending}>
          Şirket değişikliklerini kaydet
        </Button>
      </form>

      <form
        onSubmit={handleCreateInvitation}
        className="space-y-4 rounded-lg border border-border bg-card p-6"
      >
        <h2 className="text-lg font-semibold">Davet gönder</h2>
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
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={createInvitation.isPending}>
            Davet Gönder
          </Button>
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
        </div>
      </form>

      <section className="space-y-4 rounded-lg border border-border bg-card p-6">
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
                className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 last:border-b-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {invitation.recipientFullName}
                  </p>
                  <p className="text-xs text-secondary-foreground">
                    {invitation.recipientEmail} · {invitation.recipientDisplayId}
                  </p>
                  <p className="text-xs text-secondary-foreground">
                    Son geçerlilik:{' '}
                    {new Intl.DateTimeFormat('tr-TR').format(new Date(invitation.expiresAt))}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
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
