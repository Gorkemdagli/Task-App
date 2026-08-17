import { useState } from 'react';
import { Menu, Moon, Sun } from 'lucide-react';
import { Link } from 'react-router-dom';
import { buttonVariants } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';

export function NavSection() {
  const { isAuthenticated } = useAuth();
  const { mode, toggleMode } = useTheme();
  const [open, setOpen] = useState(false);
  const themeLabel = mode === 'dark' ? 'Aydınlık temaya geç' : 'Karanlık temaya geç';

  return (
    <header className="landing-nav">
      <div className="landing-nav__inner">
        <Link to="/" className="landing-wordmark" aria-label="TaskFlow anasayfa">
          TaskFlow
        </Link>

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
          <SheetContent
            side="right"
            className="border-l-landing-border bg-landing-card text-landing-text"
          >
            <SheetTitle className="text-landing-text">TaskFlow</SheetTitle>

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
