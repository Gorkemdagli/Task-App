import { useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useCompanySettings,
  useUpdateCompanySettings,
  useUploadCompanyLogo,
} from '@/hooks/queries/useCompanySettings';
import { useAddCompanyUser } from '@/hooks/queries/useCompanyUsers';
import { useAuth } from '@/hooks/useAuth';
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
  addCompanyUser: ReturnType<typeof useAddCompanyUser>;
};

function CompanySettingsContent({
  settings,
  updateSettings,
  uploadLogo,
  addCompanyUser,
}: CompanySettingsContentProps) {
  const [name, setName] = useState(settings.name);
  const [description, setDescription] = useState(settings.description ?? '');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [userDisplayId, setUserDisplayId] = useState('');
  const [userError, setUserError] = useState<string | null>(null);

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

  const handleAddUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setUserError(null);
    try {
      await addCompanyUser.mutateAsync(userDisplayId.trim().toUpperCase());
      setUserDisplayId('');
    } catch (error) {
      const code = getErrorCode(error);
      if (code === 'USER_ALREADY_IN_COMPANY') {
        setUserError('Bu kullanıcı zaten bu şirkette.');
      } else if (code === 'USER_NOT_FOUND') {
        setUserError('Kullanıcı bulunamadı.');
      } else {
        setUserError(getErrorMessage(error, 'Kullanıcı eklenemedi.'));
      }
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
        onSubmit={handleAddUser}
        className="space-y-4 rounded-lg border border-border bg-card p-6"
      >
        <h2 className="text-lg font-semibold">Şirkete kullanıcı ekle</h2>
        <div className="space-y-2">
          <label htmlFor="company-user-display-id" className="text-sm font-medium">
            Kullanıcı display ID
          </label>
          <Input
            id="company-user-display-id"
            aria-label="Kullanıcı display ID"
            value={userDisplayId}
            onChange={(event) => setUserDisplayId(event.target.value)}
          />
        </div>
        {userError && (
          <p role="alert" className="text-sm text-priority-high">
            {userError}
          </p>
        )}
        <Button type="submit" loading={addCompanyUser.isPending}>
          Kullanıcı ekle
        </Button>
      </form>
    </section>
  );
}

export function CompanySettingsPage() {
  const { isCompanyAdmin } = useAuth();
  const settingsQuery = useCompanySettings();
  const updateSettings = useUpdateCompanySettings();
  const uploadLogo = useUploadCompanyLogo();
  const addCompanyUser = useAddCompanyUser();

  if (!isCompanyAdmin) return <Navigate to="/dashboard" replace />;

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
      addCompanyUser={addCompanyUser}
    />
  );
}
