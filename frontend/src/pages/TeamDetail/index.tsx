import { useParams } from 'react-router-dom';
import { PagePlaceholder } from '@/components/layout/PagePlaceholder';

export function TeamDetailPage() {
  const { id } = useParams();
  return (
    <PagePlaceholder
      title="Takım Detay"
      description="Seçili takımın üye listesi, rol matrisi ve takıma özel ayarlar burada yer alacak."
      source="ROADMAP.md:114-128 (Faz 5)"
    >
      <p className="text-xs text-secondary-foreground">
        URL parametresi: <span className="font-mono text-foreground">{id ?? '—'}</span>
      </p>
    </PagePlaceholder>
  );
}
