import { Link } from 'react-router-dom';
import { HeroIllustration } from '@/components/landing/HeroIllustration';
import { buttonVariants } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';

export function HeroSection() {
  const { isAuthenticated } = useAuth();
  const primaryHref = isAuthenticated ? '/dashboard' : '/register';
  const primaryLabel = isAuthenticated ? 'Panoya git' : 'Ücretsiz başla';

  return (
    <section id="hero" aria-labelledby="hero-title" className="landing-hero">
      <div className="landing-section-shell landing-hero__inner">
        <h1 id="hero-title" className="max-w-6xl">
          İşin nerede{' '}
          <span data-testid="hero-inline-product" className="landing-inline-product" aria-hidden>
            <span />
            <span />
            <span />
          </span>
          kaldığını herkes görsün.
        </h1>
        <div className="landing-hero__split">
          <div className="landing-hero__copy">
            <p>
              Görev, sorumluluk ve yetki aynı görünür akışta kalsın. Ekip neyin sırada olduğunu
              tahmin etmeden ilerlesin.
            </p>

            <div className="landing-hero__actions">
              <Link
                to={primaryHref}
                className={`${buttonVariants({ variant: 'primary', size: 'lg' })} landing-hero-cta`}
              >
                {primaryLabel}
              </Link>
              <a
                href="#interactive-app-preview"
                className={`${buttonVariants({ variant: 'secondary', size: 'lg' })} landing-hero-cta`}
              >
                Demo’yu dene
              </a>
            </div>
          </div>

          <HeroIllustration />
        </div>
      </div>
    </section>
  );
}
