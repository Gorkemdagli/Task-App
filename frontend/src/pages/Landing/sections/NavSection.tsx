import { useEffect, useState } from 'react';
import { Menu, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import i18n from '@/i18n';
import usFlag from '@/assets/flags/us.png';
import trFlag from '@/assets/flags/tr.png';
import { buttonVariants } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { scrollToLandingSection } from '../landingScroll';

const sectionLinks = [
  { href: '#features', label: 'landing.nav.features' },
  { href: '#workflow', label: 'landing.nav.workflow' },
] as const;

type LandingSectionId = 'hero' | 'features' | 'workflow';

export function NavSection() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const { mode, toggleMode } = useTheme();
  const [open, setOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<LandingSectionId>('hero');
  const themeLabel = mode === 'dark' ? t('landing.nav.lightTheme') : t('landing.nav.darkTheme');
  const languageLabel = t(i18n.language === 'tr' ? 'Dili İngilizce yap' : 'Switch language to Turkish');
  const toggleLanguage = () => void i18n.changeLanguage(i18n.language === 'tr' ? 'en' : 'tr');

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) setActiveSection(visible.target.id as LandingSectionId);
      },
      { rootMargin: '-20% 0px -65% 0px', threshold: [0, 0.25, 0.5, 0.75] },
    );

    (['hero', 'features', 'workflow'] as const).forEach((id) => {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <header className="landing-nav">
      <div className="landing-nav__inner">
        <a
          href="#hero"
          className="landing-wordmark"
          aria-label={t('landing.nav.home')}
          aria-current={activeSection === 'hero' ? 'location' : undefined}
          onClick={(event) => scrollToLandingSection(event, '#hero')}
        >
          TaskFlow
        </a>

        <nav className="landing-nav__links" aria-label={t('landing.nav.sections')}>
          {sectionLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              aria-current={activeSection === link.href.slice(1) ? 'location' : undefined}
              onClick={(event) => scrollToLandingSection(event, link.href)}
            >
              {t(link.label)}
            </a>
          ))}
        </nav>

        <div className="landing-nav__actions">
          <button
            type="button"
            onClick={toggleMode}
            aria-label={themeLabel}
            title={themeLabel}
            className="landing-theme-toggle"
          >
            {mode === 'dark' ? <Sun aria-hidden /> : <Moon aria-hidden />}
          </button>

          <button
            type="button"
            onClick={toggleLanguage}
            aria-label={languageLabel}
            title={languageLabel}
            className="landing-theme-toggle"
          >
            <img src={i18n.language === 'tr' ? trFlag : usFlag} alt="" aria-hidden="true" className="h-6 w-6" />
          </button>

          {isAuthenticated ? (
            <Link to="/dashboard" className={buttonVariants({ variant: 'primary', size: 'md' })}>
              {t('landing.cta.dashboard')}
            </Link>
          ) : (
            <>
              <Link to="/register" className={buttonVariants({ variant: 'primary', size: 'md' })}>
                {t('landing.cta.signUp')}
              </Link>
              <Link
                to="/login"
                className={`${buttonVariants({ variant: 'ghost', size: 'md' })} text-landing-text`}
              >
                {t('landing.cta.login')}
              </Link>
            </>
          )}
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button type="button" className="landing-nav__menu" aria-label={t('landing.nav.openMenu')}>
              <Menu aria-hidden />
            </button>
          </SheetTrigger>
          <SheetContent side="right" className="theme-landing landing-mobile-sheet">
            <SheetTitle className="text-landing-text">TaskFlow</SheetTitle>

            <nav className="landing-mobile-links" aria-label={t('landing.nav.mobileSections')}>
              {sectionLinks.map((link) => (
                <SheetClose key={link.href} asChild>
                  <a
                    href={link.href}
                    aria-current={activeSection === link.href.slice(1) ? 'location' : undefined}
                    onClick={(event) => scrollToLandingSection(event, link.href)}
                  >
                    {t(link.label)}
                  </a>
                </SheetClose>
              ))}
            </nav>

            <button type="button" onClick={toggleMode} className="landing-mobile-theme">
              {mode === 'dark' ? <Sun aria-hidden /> : <Moon aria-hidden />}
              {mode === 'dark' ? t('landing.nav.lightThemeShort') : t('landing.nav.darkThemeShort')}
            </button>

            <button
              type="button"
              onClick={toggleLanguage}
              aria-label={languageLabel}
              className="landing-mobile-theme"
            >
              <img src={i18n.language === 'tr' ? trFlag : usFlag} alt="" aria-hidden="true" className="h-6 w-6" />
              {languageLabel}
            </button>

            <div className="mt-6 flex flex-col gap-3">
              {isAuthenticated ? (
                <SheetClose asChild>
                  <Link
                    to="/dashboard"
                    className={buttonVariants({ variant: 'primary', size: 'md' })}
                  >
                    {t('landing.cta.dashboard')}
                  </Link>
                </SheetClose>
              ) : (
                <>
                  <SheetClose asChild>
                    <Link to="/register" className={buttonVariants({ variant: 'primary', size: 'md' })}>
                      {t('landing.cta.signUp')}
                    </Link>
                  </SheetClose>
                  <SheetClose asChild>
                    <Link
                      to="/login"
                      className={`${buttonVariants({ variant: 'secondary', size: 'md' })} text-landing-text`}
                    >
                      {t('landing.cta.login')}
                    </Link>
                  </SheetClose>
                </>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
