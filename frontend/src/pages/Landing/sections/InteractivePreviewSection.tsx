import { useState } from 'react';
import { Check } from 'lucide-react';
import { LandingProductDemo, type DemoInteraction } from '@/components/landing/LandingProductDemo';

const demoChallenges: ReadonlyArray<{
  id: Exclude<DemoInteraction, 'reset'>;
  label: string;
}> = [
  { id: 'move-task', label: 'Kartı taşı' },
  { id: 'switch-view', label: 'Listeye geç' },
  { id: 'open-task', label: 'Detayı aç' },
  { id: 'switch-team', label: 'Diğer takıma geç' },
];

export function InteractivePreviewSection() {
  const [completed, setCompleted] = useState<ReadonlySet<DemoInteraction>>(() => new Set());

  function handleInteraction(interaction?: DemoInteraction) {
    if (interaction === 'reset') {
      setCompleted(new Set());
      return;
    }

    if (!interaction) return;

    setCompleted((current) => new Set(current).add(interaction));
  }

  return (
    <section
      id="interactive-app-preview"
      aria-labelledby="preview-title"
      className="landing-preview-section"
    >
      <div className="landing-section-shell">
        <header className="landing-preview-heading">
          <h2 id="preview-title">TaskFlow’u 30 saniyede deneyin.</h2>
          <p>
            Dört küçük adımı tamamlayın; dört gerçek etkileşimle panoyu, listeyi ve görev detayını
            hesap açmadan deneyin.
          </p>
        </header>

        <div className="landing-demo-sandbox">
          <ol className="landing-demo-challenges" aria-label="Demo görevleri">
            {demoChallenges.map((challenge, index) => {
              const isComplete = completed.has(challenge.id);

              return (
                <li key={challenge.id} data-complete={isComplete || undefined}>
                  <span className="landing-demo-challenge__marker" aria-hidden>
                    {isComplete ? <Check /> : index + 1}
                  </span>
                  <span>{challenge.label}</span>
                  {isComplete ? <span className="sr-only">Tamamlandı</span> : null}
                </li>
              );
            })}
          </ol>

          <LandingProductDemo guidedBeat={0} onManualInteraction={handleInteraction} />
        </div>
      </div>
    </section>
  );
}
