import { useEffect, useState } from 'react';
import { Menu, Moon, Sun } from 'lucide-react';
import { Link } from 'react-router-dom';
import { buttonVariants } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { scrollToLandingSection } from '../landingScroll';

const sectionLinks = [
  { href: '#features', label: 'Özellikler' },
  { href: '#workflow', label: 'İş akışı' },
  { href: '#interactive-app-preview', label: 'Demo' },
] as const;

type LandingSectionId = 'hero' | 'features' | 'workflow' | 'interactive-app-preview';

export function NavSection() {
  const { isAuthenticated } = useAuth();
  const { mode, toggleMode } = useTheme();
  const [open, setOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<LandingSectionId>('hero');
  const themeLabel = mode === 'dark' ? 'Aydınlık temaya geç' : 'Karanlık temaya geç';

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

    (['hero', 'features', 'workflow', 'interactive-app-preview'] as const).forEach((id) => {
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
          aria-label="TaskFlow anasayfa"
          aria-current={activeSection === 'hero' ? 'location' : undefined}
          onClick={(event) => scrollToLandingSection(event, '#hero')}
        >
          TaskFlow
        </a>

        <nav className="landing-nav__links" aria-label="Sayfa bölümleri">
          {sectionLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              aria-current={activeSection === link.href.slice(1) ? 'location' : undefined}
              onClick={(event) => scrollToLandingSection(event, link.href)}
            >
              {link.label}
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

          {isAuthenticated ? (
            <Link to="/dashboard" className={buttonVariants({ variant: 'primary', size: 'md' })}>
              Panoya git
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className={`${buttonVariants({ variant: 'ghost', size: 'md' })} text-landing-text`}
              >
                Giriş yap
              </Link>
              <Link to="/register" className={buttonVariants({ variant: 'primary', size: 'md' })}>
                Ücretsiz başla
              </Link>
            </>
          )}
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button type="button" className="landing-nav__menu" aria-label="Menüyü aç">
              <Menu aria-hidden />
            </button>
          </SheetTrigger>
          <SheetContent side="right" className="theme-landing landing-mobile-sheet">
            <SheetTitle className="text-landing-text">TaskFlow</SheetTitle>

            <nav className="landing-mobile-links" aria-label="Mobil sayfa bölümleri">
              {sectionLinks.map((link) => (
                <SheetClose key={link.href} asChild>
                  <a
                    href={link.href}
                    aria-current={activeSection === link.href.slice(1) ? 'location' : undefined}
                    onClick={(event) => scrollToLandingSection(event, link.href)}
                  >
                    {link.label}
                  </a>
                </SheetClose>
              ))}
            </nav>

            <button type="button" onClick={toggleMode} className="landing-mobile-theme">
              {mode === 'dark' ? <Sun aria-hidden /> : <Moon aria-hidden />}
              {mode === 'dark' ? 'Aydınlık tema' : 'Karanlık tema'}
            </button>

            <div className="mt-6 flex flex-col gap-3">
              {isAuthenticated ? (
                <SheetClose asChild>
                  <Link
                    to="/dashboard"
                    className={buttonVariants({ variant: 'primary', size: 'md' })}
                  >
                    Panoya git
                  </Link>
                </SheetClose>
              ) : (
                <>
                  <SheetClose asChild>
                    <Link
                      to="/login"
                      className={`${buttonVariants({ variant: 'secondary', size: 'md' })} text-landing-text`}
                    >
                      Giriş yap
                    </Link>
                  </SheetClose>
                  <SheetClose asChild>
                    <Link
                      to="/register"
                      className={buttonVariants({ variant: 'primary', size: 'md' })}
                    >
                      Ücretsiz başla
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
