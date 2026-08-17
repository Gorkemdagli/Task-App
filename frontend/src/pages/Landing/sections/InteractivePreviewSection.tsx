import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { LandingProductDemo } from '@/components/landing/LandingProductDemo';
import { cn } from '@/lib/utils';
import type { DemoBeat } from '@/pages/Landing/demo/demoState';

const storyBeats: ReadonlyArray<{ beat: DemoBeat; title: string; copy: string }> = [
  {
    beat: 0,
    title: 'Takımı seç, açık işi gör.',
    copy: 'Takım kapsamını değiştir; sabit sütunlarda kimin neyi üstlendiğini tek bakışta izle.',
  },
  {
    beat: 1,
    title: 'Kartı taşı, sorumluluk kaybolmasın.',
    copy: 'Görevi klavye, pointer veya açık durum kontrolleriyle ilerlet; sorumlu ve öncelik görünür kalsın.',
  },
  {
    beat: 2,
    title: 'Detayı aç, listeye dön, devam et.',
    copy: 'Aynı yerel veri üzerinde pano ile liste arasında geç; görev bağlamını ayrıntı panelinde koru.',
  },
];

export function InteractivePreviewSection() {
  const [activeBeat, setActiveBeat] = useState<DemoBeat>(0);
  const guidedModeRef = useRef(true);
  const beatRefs = useRef<Array<HTMLLIElement | null>>([]);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 60rem)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    if (!desktop.matches || reducedMotion.matches) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!guidedModeRef.current) return;

        const closestEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const nextBeat = Number(
          (closestEntry?.target as HTMLElement | undefined)?.dataset.storyBeat,
        );

        if (nextBeat === 0 || nextBeat === 1 || nextBeat === 2) {
          setActiveBeat(nextBeat);
        }
      },
      { rootMargin: '-35% 0px -35% 0px', threshold: [0.25, 0.5, 0.75] },
    );

    beatRefs.current.forEach((beat) => {
      if (beat) observer.observe(beat);
    });

    return () => observer.disconnect();
  }, []);

  function pauseGuidedMode() {
    guidedModeRef.current = false;
  }

  function handleDemoClickCapture(event: MouseEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('[data-demo-reset]')) {
      guidedModeRef.current = true;
      setActiveBeat(0);
    }
  }

  return (
    <section
      id="interactive-app-preview"
      aria-labelledby="preview-title"
      className="landing-preview-section bg-landing-bg-alt"
    >
      <div className="landing-section-shell">
        <header className="landing-section-heading">
          <h2 id="preview-title">TaskFlow’u iş üstünde deneyin.</h2>
          <p>
            Takımı değiştirin, görevi açın ve sabit durumlar arasında taşıyın. Bu demo yalnızca
            tarayıcınızda çalışır; hesabınızı veya gerçek verinizi değiştirmez.
          </p>
        </header>

        <div className="landing-story-grid">
          <div className="landing-story-stage" onClickCapture={handleDemoClickCapture}>
            <LandingProductDemo guidedBeat={activeBeat} onManualInteraction={pauseGuidedMode} />
          </div>

          <ol className="landing-story-beats" aria-label="Ürün turu">
            {storyBeats.map((item) => (
              <li
                key={item.beat}
                ref={(node) => {
                  beatRefs.current[item.beat] = node;
                }}
                data-story-beat={item.beat}
                className={cn('landing-story-beat', activeBeat === item.beat && 'is-active')}
              >
                <span aria-hidden>{String(item.beat + 1).padStart(2, '0')}</span>
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
