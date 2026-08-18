import { ArrowDown, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { HeroIllustration } from '@/components/landing/HeroIllustration';
import { buttonVariants } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';

export function HeroSection() {
  const { isAuthenticated } = useAuth();
  const primaryHref = isAuthenticated ? '/dashboard' : '/register';
  const primaryLabel = isAuthenticated ? 'Panoya git' : 'Ücretsiz başla';

  return (
    <section
      id="hero"
      aria-labelledby="hero-title"
      className="landing-hero landing-viewport-section"
    >
      <div className="landing-section-shell landing-hero__grid">
        <div className="landing-hero__copy">
          <h1 id="hero-title">İşin nerede kaldığını herkes görsün.</h1>
          <p>
            TaskFlow, teknik ekiplerin görevleri üç sabit durumda izlemesini, sorumluluğu
            netleştirmesini ve yetki sınırlarını korumasını sağlar.
          </p>

          <div className="landing-hero__actions">
            <Link to={primaryHref} className={buttonVariants({ variant: 'primary', size: 'lg' })}>
              {primaryLabel}
              {!isAuthenticated ? <ArrowRight aria-hidden /> : null}
            </Link>
            <a
              href="#interactive-app-preview"
              className={buttonVariants({ variant: 'secondary', size: 'lg' })}
            >
              Panoyu dene
              <ArrowDown aria-hidden />
            </a>
          </div>
        </div>

        <HeroIllustration />
      </div>
    </section>
  );
}
