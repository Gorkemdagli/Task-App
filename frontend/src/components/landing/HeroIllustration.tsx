import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function readPrefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

export function HeroIllustration() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(readPrefersReducedMotion);
  const [motionOverride, setMotionOverride] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    const handleChange = () => {
      setPrefersReducedMotion(mediaQuery.matches);
      if (!mediaQuery.matches) setMotionOverride(false);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return (
    <div className="landing-hero-illustration">
      <a
        href="#interactive-app-preview"
        className="landing-hero-board"
        data-motion-override={motionOverride ? 'on' : undefined}
        aria-label="Etkileşimli TaskFlow demosuna git"
      >
        <span className="landing-hero-board__progress" aria-hidden>
          <span className="landing-hero-board__progress-edge landing-hero-board__progress-edge--top" />
          <span className="landing-hero-board__progress-edge landing-hero-board__progress-edge--right" />
          <span className="landing-hero-board__progress-edge landing-hero-board__progress-edge--bottom" />
          <span className="landing-hero-board__progress-edge landing-hero-board__progress-edge--left" />
        </span>

        <div className="landing-hero-board__toolbar" aria-hidden>
          <strong>Platform Takımı</strong>
          <span>Canlı pano</span>
        </div>

        <div className="landing-hero-board__columns" aria-hidden>
          <div className="landing-hero-board__column">
            <header>
              <span>Yapılacak</span>
              <span>2</span>
            </header>
            <div className="landing-hero-board__task landing-hero-board__task--quiet">
              <strong>WebSocket bağlantısını izle</strong>
              <span>SD</span>
            </div>
            <div className="landing-hero-board__task landing-hero-board__task--moving">
              <strong>API sınırlarını doğrula</strong>
              <span>GK</span>
            </div>
          </div>

          <div className="landing-hero-board__column">
            <header>
              <span>Yapılıyor</span>
              <span>1</span>
            </header>
            <div className="landing-hero-board__task landing-hero-board__task--quiet">
              <strong>Bildirim akışını sadeleştir</strong>
              <span>DA</span>
            </div>
          </div>
        </div>

        <span className="landing-hero-board__link" aria-hidden>
          Canlı demoyu aç <span>↘</span>
        </span>
      </a>

      {prefersReducedMotion ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="landing-hero-motion-toggle"
          aria-pressed={motionOverride}
          onClick={() => setMotionOverride((current) => !current)}
        >
          {motionOverride ? 'Animasyonu durdur' : 'Animasyonu oynat'}
        </Button>
      ) : null}
    </div>
  );
}
