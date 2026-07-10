import { useParams } from 'react-router-dom';
import { PagePlaceholder } from '@/components/layout/PagePlaceholder';

export function TaskDetailPage() {
  const { id } = useParams();
  return (
    <PagePlaceholder
      title="Görev Detay"
      description="Görevin açıklaması, yorumlar, durum geçmişi ve atanan kişi bilgileri. Yalnızca ilgili kullanıcılar erişir."
      source="ROADMAP.md:96-110 (Faz 4)"
    >
      <p className="text-xs text-secondary-foreground">
        URL parametresi: <span className="font-mono text-foreground">{id ?? '—'}</span>
      </p>
    </PagePlaceholder>
  );
}
