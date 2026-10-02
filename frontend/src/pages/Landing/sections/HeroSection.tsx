import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ListTodo, MessageCircle, Users } from 'lucide-react';
import { HeroIllustration } from '@/components/landing/HeroIllustration';
import { buttonVariants } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';

export function HeroSection() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const primaryHref = isAuthenticated ? '/dashboard' : '/register';
  const primaryLabel = isAuthenticated ? t('landing.cta.dashboard') : t('landing.cta.register');

  return (
    <section id="hero" aria-labelledby="hero-title" className="landing-hero">
      <div className="landing-section-shell landing-hero__inner">
        <div className="landing-hero__split">
          <div className="landing-hero__copy">
            <p className="landing-hero-kicker">{t('landing.hero.kicker')}</p>
            <h1
              id="hero-title"
              className="max-w-6xl"
              aria-label={t('landing.hero.headline')}
            >
              <span className="landing-hero-heading-line">{t('landing.hero.headlineFirst')}</span> <br />
              <span className="landing-hero-heading-line landing-hero-heading-line--wide">
                {t('landing.hero.headlineSecond')}
              </span>
            </h1>
            <p>{t('landing.hero.lede')}</p>

            <div className="landing-hero__actions">
              <Link
                to={primaryHref}
                className={`${buttonVariants({ variant: 'primary', size: 'lg' })} landing-hero-cta`}
              >
                {primaryLabel}
              </Link>
              <a
                href="#workflow"
                className={`${buttonVariants({ variant: 'secondary', size: 'lg' })} landing-hero-cta`}
              >
                {t('landing.hero.workflowLink')}
              </a>
            </div>

            <div className="landing-hero-proof-strip" aria-label={t('landing.hero.principles')}>
              <div>
                <ListTodo aria-hidden />
                <strong>{t('landing.hero.proofTasks')}</strong>
                <p>{t('landing.hero.proofTasksCopy')}</p>
              </div>
              <div>
                <Users aria-hidden />
                <strong>{t('landing.hero.proofTeams')}</strong>
                <p>{t('landing.hero.proofTeamsCopy')}</p>
              </div>
              <div>
                <MessageCircle aria-hidden />
                <strong>{t('landing.hero.proofCommunication')}</strong>
                <p>{t('landing.hero.proofCommunicationCopy')}</p>
              </div>
            </div>
          </div>

          <HeroIllustration />
        </div>
      </div>
    </section>
  );
}
