import { ArrowRight, UserRound } from 'lucide-react';

export function HeroIllustration() {
  return (
    <div role="group" className="landing-hero-artifact" aria-label="TaskFlow görev durumu örneği">
      <div className="landing-hero-artifact__rail" aria-hidden>
        <span>Yapılacak</span>
        <ArrowRight />
        <strong>Yapılıyor</strong>
        <ArrowRight />
        <span>Yapıldı</span>
      </div>

      <article>
        <div>
          <span className="landing-hero-artifact__priority">Yüksek öncelik</span>
          <span className="landing-hero-artifact__status">Yapılıyor</span>
        </div>
        <h2>OAuth akışı</h2>
        <dl>
          <div>
            <dt>
              <UserRound aria-hidden /> Sorumlu
            </dt>
            <dd>Görkem Kaya</dd>
          </div>
          <div>
            <dt>Termin</dt>
            <dd>
              <time dateTime="2026-08-22">22 Ağu 2026</time>
            </dd>
          </div>
        </dl>
      </article>
    </div>
  );
}
