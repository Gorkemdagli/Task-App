import { Navigate } from 'react-router-dom';
import { PagePlaceholder } from '@/components/layout/PagePlaceholder';
import { useAuth } from '@/hooks/useAuth';

/**
 * PermissionsPage — Yalnızca Şirket Admini.
 * Frontend guard: member / teamAdmin URL'e doğrudan giderse /dashboard'a yönlendirilir.
 * Backend tarafı Faz 8'de eklenecek (requireRole middleware).
 */
export function PermissionsPage() {
  const { isCompanyAdmin } = useAuth();
  if (!isCompanyAdmin) return <Navigate to="/dashboard" replace />;
  return (
    <PagePlaceholder
      title="Yetkiler"
      description="Şirket genelinde kullanıcıların ve takımların rol matrisini yönet. Yalnızca Şirket Admini erişir."
      source="ROADMAP.md:196-206 (Faz 8)"
    />
  );
}
