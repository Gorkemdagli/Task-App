import { PagePlaceholder } from '@/components/layout/PagePlaceholder';
import { useAuth } from '@/hooks/useAuth';

export function ProfilePage() {
  const { user } = useAuth();
  return (
    <PagePlaceholder
      title="Profil"
      description="Kullanıcının kişisel bilgileri, görünen adı ve avatarı. Şifre değiştirme akışı Faz 9'da eklenecek."
      source="ROADMAP.md:222-228 (Faz 9)"
    >
      <p className="text-xs text-secondary-foreground">
        Şu anki kullanıcı: <span className="font-mono text-foreground">{user?.email ?? '—'}</span>
      </p>
    </PagePlaceholder>
  );
}
