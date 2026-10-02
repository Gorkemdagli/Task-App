import { useEffect, useState, type FormEvent } from 'react';
import { Camera, UserRound } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
  const { t, i18n } = useTranslation();
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
    isTranslationKey?: boolean;
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
      setLogoError('company.settings.logoSizeError');
      return;
    }
    if (!LOGO_TYPES.includes(file.type)) {
      setLogoPreview(null);
      setLogoError('company.settings.logoTypeError');
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
      setUserFeedback({
        type: 'success',
        message: 'company.settings.invitationSent',
        isTranslationKey: true,
      });
    } catch (error) {
      const code = getErrorCode(error);
      let message = 'company.settings.invitationSendError';
      let isTranslationKey = true;
      if (code === 'USER_NOT_FOUND') {
        message = 'company.settings.userNotFound';
      } else if (code === 'INVITATION_ALREADY_PENDING') {
        message = 'company.settings.invitationPending';
      } else {
        const fallback = t(message);
        message = getApiErrorMessage(error, fallback);
        isTranslationKey = message === fallback;
      }
      setUserFeedback({ type: 'error', message, isTranslationKey });
    }
  };

  const handleCancelInvitation = async () => {
    if (!invitationToCancel) return;
    try {
      await cancelInvitation.mutateAsync(invitationToCancel.id);
      setInvitationToCancel(null);
      setUserFeedback({
        type: 'success',
        message: 'company.settings.invitationCanceled',
        isTranslationKey: true,
      });
    } catch (error) {
      const fallback = t('company.settings.invitationCancelError');
      const message = getApiErrorMessage(error, fallback);
      setUserFeedback({
        type: 'error',
        message: message === fallback ? 'company.settings.invitationCancelError' : message,
        isTranslationKey: message === fallback,
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
        <h1 className="text-4xl font-bold leading-tight text-foreground">
          {t('company.settings.title')}
        </h1>
        <p className="text-sm text-secondary-foreground">
          {t('company.settings.subtitle')}
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
          <div className="flex flex-col items-center gap-5 text-center">
            <label
              htmlFor="company-logo-upload"
              className="group relative block h-40 w-40 shrink-0 cursor-pointer self-center rounded-lg focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
            >
              <Avatar className="h-40 w-40 rounded-lg">
                {logoPreview || settings.logoUrl ? (
                  <img
                    src={logoPreview ?? settings.logoUrl ?? undefined}
                    alt={logoPreview ? t('company.settings.logoPreview') : t('company.settings.logo')}
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
                  ? t('company.settings.uploadLoading')
                  : logoPreview || settings.logoUrl
                    ? t('company.settings.changeLogo')
                    : t('company.settings.uploadLogo')}
              </span>
              <Input
                id="company-logo-upload"
                aria-label={t('company.settings.logo')}
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
          <div className="w-full min-w-0 space-y-1 text-center">
              <h2 className="break-words text-2xl font-semibold">{settings.name}</h2>
              <p className="break-all text-sm text-secondary-foreground">{settings.slug}</p>
            </div>
          </div>
          {logoError && (
            <p role="alert" className="mt-3 text-sm text-priority-high">
              {t(logoError)}
            </p>
          )}
          {uploadLogo.isError && (
            <p role="alert" className="mt-3 text-sm text-priority-high">
              {t('company.settings.logoUploadError')}
            </p>
          )}
          <div
            data-testid="company-settings-summary"
          className="mt-5 space-y-3 border-t border-border pt-5 text-center"
          >
            <div>
              <h3 className="text-sm font-semibold">{t('company.settings.status')}</h3>
              <p className="text-sm">{t('company.settings.current')}</p>
            </div>
          <dl className="grid grid-cols-2 gap-3 text-center text-sm">
              <div>
                <dt className="text-secondary-foreground">{t('company.settings.teamCount')}</dt>
                <dd className="font-semibold">{teamCount}</dd>
              </div>
              <div>
                <dt className="text-secondary-foreground">{t('company.settings.memberCount')}</dt>
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
            <h2 className="text-lg font-semibold">{t('company.settings.profile')}</h2>
            <div className="space-y-2">
              <label htmlFor="company-name" className="text-sm font-medium">
                {t('company.settings.name')}
              </label>
              <Input
                id="company-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="company-description" className="text-sm font-medium">
                {t('company.settings.description')}
              </label>
              <textarea
                id="company-description"
                aria-label={t('company.settings.description')}
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
                {t('company.settings.slug')}
              </label>
              <Input
                id="company-slug"
                aria-label={t('company.settings.slug')}
                aria-describedby="company-slug-description"
                value={settings.slug}
                readOnly
              />
              <p id="company-slug-description" className="text-xs text-secondary-foreground">
                {t('company.settings.readonlySlug')}
              </p>
            </div>
            {updateSettings.isError && (
              <p role="alert" className="text-sm text-priority-high">
                {t('company.settings.saveError')}
              </p>
            )}
            <div className="flex justify-end">
              <Button type="submit" loading={updateSettings.isPending}>
                {t('company.settings.save')}
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
          <h2 className="text-lg font-semibold">{t('company.settings.invitationTitle')}</h2>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="space-y-2">
              <label htmlFor="company-user-identifier" className="text-sm font-medium">
                {t('company.settings.identifier')}
              </label>
              <Input
                id="company-user-identifier"
                aria-label={t('company.settings.identifier')}
                placeholder={t('company.settings.identifierPlaceholder')}
                value={userIdentifier}
                onChange={(event) => setUserIdentifier(event.target.value)}
              />
            </div>
            <Button type="submit" loading={createInvitation.isPending} className="w-full lg:w-auto">
              {t('company.settings.sendInvitation')}
            </Button>
          </div>
          {userFeedback && (
            <p
              role={userFeedback.type === 'success' ? 'status' : 'alert'}
              className={`rounded-md border border-border bg-muted px-3 py-2 text-sm ${
                userFeedback.type === 'success' ? 'text-priority-low' : 'text-priority-high'
              }`}
            >
              {userFeedback.isTranslationKey ? t(userFeedback.message) : userFeedback.message}
            </p>
          )}
        </form>

          <section
            data-testid="company-settings-invitation-ledger"
            className="space-y-4 overflow-hidden border-t border-border pt-6"
          >
            <div>
              <h2 className="text-lg font-semibold">{t('company.settings.pendingInvitations')}</h2>
              <p className="text-sm text-secondary-foreground">
                {t('company.settings.noAcceptedInvitations')}
              </p>
            </div>
            {invitations.isPending ? (
              <p
                data-testid="company-invitations-loading"
                className="text-sm text-secondary-foreground"
              >
                {t('company.settings.invitationsLoading')}
              </p>
            ) : invitations.isError ? (
              <p role="alert" className="text-sm text-priority-high">
                {t('company.settings.invitationsError')}
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
                          {t('company.settings.expires')}{' '}
                          {new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-US' : 'tr-TR').format(
                            new Date(invitation.expiresAt),
                          )}
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
                      {t('company.settings.cancel')}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p data-testid="company-invitations-empty" className="text-sm text-secondary-foreground">
                {t('company.settings.noPendingInvitations')}
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
            <DialogTitle>{t('company.settings.cancelDialogTitle')}</DialogTitle>
            <DialogDescription>
              {t('company.settings.cancelDialogDescription', {
                email: invitationToCancel?.recipientEmail,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setInvitationToCancel(null)}>
              {t('company.settings.dismiss')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              loading={cancelInvitation.isPending}
              onClick={handleCancelInvitation}
            >
              {t('company.settings.cancelInvitation')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function CompanySettingsContentPage() {
  const { t } = useTranslation();
  const settingsQuery = useCompanySettings();
  const updateSettings = useUpdateCompanySettings();
  const uploadLogo = useUploadCompanyLogo();
  const invitations = useCompanyInvitationAdmin();
  const createInvitation = useCreateCompanyInvitation();
  const cancelInvitation = useCancelCompanyInvitation();

  if (settingsQuery.isLoading) {
    return <p className="text-sm text-secondary-foreground">{t('company.settings.loading')}</p>;
  }

  if (settingsQuery.isError || !settingsQuery.data) {
    return (
      <p role="alert" className="text-sm text-priority-high">
        {t('company.settings.error')}
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
