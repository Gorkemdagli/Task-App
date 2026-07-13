import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, Moon, Sun } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetClose, SheetTitle } from '@/components/ui/sheet';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';

const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'Pricing', href: '#pricing' },
] as const;

export function NavSection() {
  const { isAuthenticated } = useAuth();
  const { mode, toggleMode } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-landing-border bg-landing-bg/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-2 px-4 md:px-6">
        {/* Logo */}
        <Link
          to="/"
          className="text-xl font-bold tracking-tight text-landing-primary"
          aria-label="TaskFlow anasayfa"
        >
          TaskFlow
        </Link>

        {/* Desktop nav links (md+) */}
        <nav className="hidden items-center gap-6 md:flex" aria-label="Birincil gezinme">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-landing-muted transition-colors hover:text-landing-text"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Right cluster (md+): theme toggle + CTAs */}
        <div className="hidden items-center gap-2 md:flex">
          <button
            type="button"
            onClick={toggleMode}
            aria-label={mode === 'dark' ? 'Aydınlık temaya geç' : 'Karanlık temaya geç'}
            title={mode === 'dark' ? 'Aydınlık temaya geç' : 'Karanlık temaya geç'}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-landing-text transition-colors hover:bg-landing-card-hover"
          >
            {mode === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>

          {isAuthenticated ? (
            <Link to="/dashboard" className={buttonVariants({ variant: 'primary', size: 'md' })}>
              Dashboard'a git
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className={buttonVariants({ variant: 'ghost', size: 'md' }) + ' text-landing-text'}
              >
                Login
              </Link>
              <Link to="/register" className={buttonVariants({ variant: 'primary', size: 'md' })}>
                Start Free
              </Link>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md text-landing-text md:hidden"
              aria-label="Menüyü aç"
            >
              <Menu className="h-5 w-5" />
            </button>
          </SheetTrigger>
          <SheetContent
            side="right"
            className="border-l-landing-border bg-landing-card text-landing-text"
          >
            <SheetTitle className="text-landing-text">TaskFlow</SheetTitle>

            <nav className="mt-6 flex flex-col gap-4" aria-label="Mobil gezinme">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="text-base font-medium"
                >
                  {link.label}
                </a>
              ))}
            </nav>

            {/* Theme toggle inside mobile drawer */}
            <button
              type="button"
              onClick={toggleMode}
              className="mt-6 inline-flex items-center gap-2 self-start rounded-md border border-landing-border bg-landing-bg-alt px-3 py-2 text-sm font-medium"
            >
              {mode === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {mode === 'dark' ? 'Aydınlık tema' : 'Karanlık tema'}
            </button>

            <div className="mt-6 flex flex-col gap-3">
              {isAuthenticated ? (
                <SheetClose asChild>
                  <Link
                    to="/dashboard"
                    className={buttonVariants({ variant: 'primary', size: 'md' })}
                  >
                    Dashboard'a git
                  </Link>
                </SheetClose>
              ) : (
                <>
                  <SheetClose asChild>
                    <Link
                      to="/login"
                      className={
                        buttonVariants({ variant: 'secondary', size: 'md' }) + ' text-landing-text'
                      }
                    >
                      Login
                    </Link>
                  </SheetClose>
                  <SheetClose asChild>
                    <Link
                      to="/register"
                      className={buttonVariants({ variant: 'primary', size: 'md' })}
                    >
                      Start Free
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
