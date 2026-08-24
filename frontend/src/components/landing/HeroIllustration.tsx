import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const DEFAULT_LANE_OFFSETS = {
  firstToSecondX: '0px',
  secondToThirdX: '0px',
  thirdToArchiveX: '0px',
  firstToSecond: '-0.75rem',
  secondToThird: '-1.5rem',
  thirdToArchive: '-1.5rem',
};

function readPrefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

export function HeroIllustration() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(readPrefersReducedMotion);
  const [motionOverride, setMotionOverride] = useState(false);
  const [laneOffsets, setLaneOffsets] = useState(DEFAULT_LANE_OFFSETS);
  const boardRef = useRef<HTMLAnchorElement>(null);
  const sourceCardRef = useRef<HTMLDivElement>(null);
  const movingTaskRef = useRef<HTMLDivElement>(null);
  const targetCardRef = useRef<HTMLDivElement>(null);
  const doneHeaderRef = useRef<HTMLElement>(null);
  const archiveColumnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    const handleChange = () => {
      setPrefersReducedMotion(mediaQuery.matches);
      if (!mediaQuery.matches) setMotionOverride(false);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useLayoutEffect(() => {
    const board = boardRef.current;
    const sourceCard = sourceCardRef.current;
    const movingTask = movingTaskRef.current;
    const targetCard = targetCardRef.current;
    const doneHeader = doneHeaderRef.current;
    const archiveColumn = archiveColumnRef.current;

    if (!board || !sourceCard || !movingTask || !targetCard || !doneHeader || !archiveColumn)
      return;

    const measureLanes = () => {
      const previousAnimation = movingTask.style.animation;
      const previousTransform = movingTask.style.transform;

      movingTask.style.animation = 'none';
      movingTask.style.transform = 'none';

      const sourceRect = sourceCard.getBoundingClientRect();
      const movingRect = movingTask.getBoundingClientRect();
      const targetRect = targetCard.getBoundingClientRect();
      const doneHeaderRect = doneHeader.getBoundingClientRect();
      const archiveColumnRect = archiveColumn.getBoundingClientRect();
      const doneColumn = doneHeader.parentElement;
      const columnGap = doneColumn
        ? Number.parseFloat(
            window.getComputedStyle(doneColumn).rowGap || window.getComputedStyle(doneColumn).gap,
          ) || 0
        : 0;

      movingTask.style.animation = previousAnimation;
      movingTask.style.transform = previousTransform;

      const sourceCardGap = movingRect.top - sourceRect.bottom;
      const movingTop = movingRect.top;
      const secondColumnTop = targetRect.bottom + sourceCardGap;
      const thirdColumnTop = doneHeaderRect.bottom + columnGap;
      const nextOffsets = {
        firstToSecondX: `${Math.round(targetRect.left - movingRect.left)}px`,
        secondToThirdX: `${Math.round(doneHeaderRect.left - movingRect.left)}px`,
        thirdToArchiveX: `${Math.round(archiveColumnRect.left - movingRect.left)}px`,
        firstToSecond: `${Math.round(secondColumnTop - movingTop)}px`,
        secondToThird: `${Math.round(thirdColumnTop - movingTop)}px`,
        thirdToArchive: `${Math.round(thirdColumnTop - movingTop)}px`,
      };

      setLaneOffsets((current) =>
        current.firstToSecondX === nextOffsets.firstToSecondX &&
        current.secondToThirdX === nextOffsets.secondToThirdX &&
        current.thirdToArchiveX === nextOffsets.thirdToArchiveX &&
        current.firstToSecond === nextOffsets.firstToSecond &&
        current.secondToThird === nextOffsets.secondToThird &&
        current.thirdToArchive === nextOffsets.thirdToArchive
          ? current
          : nextOffsets,
      );
    };

    measureLanes();
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measureLanes);
    resizeObserver?.observe(board);
    resizeObserver?.observe(sourceCard);
    resizeObserver?.observe(targetCard);
    resizeObserver?.observe(doneHeader);
    resizeObserver?.observe(archiveColumn);
    window.addEventListener('resize', measureLanes);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', measureLanes);
    };
  }, []);

  const boardStyle = {
    '--landing-hero-lane-x-1': laneOffsets.firstToSecondX,
    '--landing-hero-lane-x-2': laneOffsets.secondToThirdX,
    '--landing-hero-lane-x-3': laneOffsets.thirdToArchiveX,
    '--landing-hero-lane-y-1': laneOffsets.firstToSecond,
    '--landing-hero-lane-y-2': laneOffsets.secondToThird,
    '--landing-hero-lane-y-3': laneOffsets.thirdToArchive,
  } as CSSProperties;

  return (
    <div className="landing-hero-illustration">
      <a
        ref={boardRef}
        href="#interactive-app-preview"
        className="landing-hero-board group"
        style={boardStyle}
        data-motion-override={motionOverride ? 'on' : undefined}
        aria-label="Etkileşimli TaskFlow demosuna git"
      >
        <span
          className="landing-hero-board__progress landing-hero-board__progress--outer"
          aria-hidden
        >
          <span className="landing-hero-board__progress-edge landing-hero-board__progress-edge--top" />
          <span className="landing-hero-board__progress-edge landing-hero-board__progress-edge--right" />
          <span className="landing-hero-board__progress-edge landing-hero-board__progress-edge--bottom" />
          <span className="landing-hero-board__progress-edge landing-hero-board__progress-edge--left" />
        </span>

        <div className="landing-hero-board__toolbar" aria-hidden>
          <strong>Platform Takımı</strong>
          <span>Canlı pano</span>
        </div>

        <div
          className="landing-hero-board__columns landing-hero-board__columns--lifecycle"
          aria-hidden
        >
          <div className="landing-hero-board__column">
            <header>
              <span>Yapılacak</span>
              <span>2</span>
            </header>
            <div
              ref={sourceCardRef}
              className="landing-hero-board__task landing-hero-board__task--quiet"
            >
              <strong>WebSocket bağlantısını izle</strong>
              <span>SD</span>
            </div>
            <div
              ref={movingTaskRef}
              className="landing-hero-board__task landing-hero-board__task--moving"
            >
              <strong>API sınırlarını doğrula</strong>
              <span>GK</span>
            </div>
          </div>

          <div className="landing-hero-board__column">
            <header>
              <span>Yapılıyor</span>
              <span>1</span>
            </header>
            <div
              ref={targetCardRef}
              className="landing-hero-board__task landing-hero-board__task--quiet"
            >
              <strong>Bildirim akışını sadeleştir</strong>
              <span>DA</span>
            </div>
          </div>

          <div className="landing-hero-board__column">
            <header ref={doneHeaderRef}>
              <span>Yapıldı</span>
              <span>0</span>
            </header>
          </div>

          <div ref={archiveColumnRef} className="landing-hero-board__column--archive">
            <div className="landing-hero-board__archive">
              <div className="landing-hero-board__archive-visual">
                <strong className="landing-hero-board__archive-count">+1</strong>
                <svg
                  className="landing-hero-board__archive-illustration"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    d="M4 7.9966C3.83599 7.99236 3.7169 7.98287 3.60982 7.96157C2.81644 7.80376 2.19624 7.18356 2.03843 6.39018C2 6.19698 2 5.96466 2 5.5C2 5.03534 2 4.80302 2.03843 4.60982C2.19624 3.81644 2.81644 3.19624 3.60982 3.03843C3.80302 3 4.03534 3 4.5 3H19.5C19.9647 3 20.197 3 20.3902 3.03843C21.1836 3.19624 21.8038 3.81644 21.9616 4.60982C22 4.80302 22 5.03534 22 5.5C22 5.96466 22 6.19698 21.9616 6.39018C21.8038 7.18356 21.1836 7.80376 20.3902 7.96157C20.2831 7.98287 20.164 7.99236 20 7.9966M10 13H14M4 8H20V16.2C20 17.8802 20 18.7202 19.673 19.362C19.3854 19.9265 18.9265 20.3854 18.362 20.673C17.7202 21 16.8802 21 15.2 21H8.8C7.11984 21 6.27976 21 5.63803 20.673C5.07354 20.3854 4.6146 19.9265 4.32698 19.362C4 18.7202 4 17.8802 4 16.2V8Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <span className="landing-hero-board__archive-label">Arşiv</span>
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
