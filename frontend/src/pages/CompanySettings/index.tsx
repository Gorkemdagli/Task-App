import { Navigate } from 'react-router-dom';
import { PagePlaceholder } from '@/components/layout/PagePlaceholder';
import { useAuth } from '@/hooks/useAuth';

/**
 * CompanySettingsPage — Yalnızca Şirket Admini.
 * Frontend guard: member / teamAdmin URL'e doğrudan giderse /dashboard'a yönlendirilir.
 * Backend tarafı Faz 8'de eklenecek (requireRole middleware).
 */
export function CompanySettingsPage() {
  const { isCompanyAdmin } = useAuth();
  if (!isCompanyAdmin) return <Navigate to="/dashboard" replace />;
  return (
    <PagePlaceholder
      title="Şirket Ayarları"
      description="Şirket adı, davet politikası, fatura ve tenant kapatma. Yalnızca Şirket Admini erişir."
      source="ROADMAP.md:196-206 (Faz 8)"
    />
  );
}
