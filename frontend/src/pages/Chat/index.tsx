import { useParams } from 'react-router-dom';
import { PagePlaceholder } from '@/components/layout/PagePlaceholder';

export function ChatPage() {
  const { id } = useParams();
  return (
    <PagePlaceholder
      title="Mesajlaşma"
      description="Takım veya bireysel mesajlaşma akışı. WebSocket bağlantısı Faz 11'de eklenecek."
      source="ROADMAP.md:174-188 (Faz 8)"
    >
      <p className="text-xs text-secondary-foreground">
        Konuşma ID: <span className="font-mono text-foreground">{id ?? '—'}</span>
      </p>
    </PagePlaceholder>
  );
}
