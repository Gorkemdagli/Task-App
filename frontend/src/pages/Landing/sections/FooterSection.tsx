import { Link } from 'react-router-dom';
import { FooterLinkGroup } from '@/components/landing/FooterLinkGroup';
import { footerGroups, legalLinks, copyright } from '@/pages/Landing/data/mockData';

export function FooterSection() {
  return (
    <footer className="border-t border-landing-border bg-landing-bg py-12 md:py-16">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 md:px-6">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-3">
          {/* Brand block */}
          <div className="flex flex-col gap-3">
            <Link to="/" className="text-2xl font-bold tracking-tight text-landing-primary">
              TaskFlow
            </Link>
            <p className="max-w-xs text-sm leading-relaxed text-landing-muted">
              The uncompromising task management system for high-performing technical teams.
            </p>
          </div>

          {/* Link groups */}
          {footerGroups.map((group) => (
            <FooterLinkGroup key={group.title} group={group} />
          ))}
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col-reverse items-start gap-4 border-t border-landing-border pt-6 md:flex-row md:items-center md:justify-between">
          <p className="text-xs text-landing-muted">{copyright}</p>
          <nav aria-label="Yasal">
            <ul className="flex flex-wrap gap-4">
              {legalLinks.map((link) => (
                <li key={link.url}>
                  <Link
                    to={link.url}
                    className="text-xs text-landing-muted transition-colors hover:text-landing-text"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  );
}
