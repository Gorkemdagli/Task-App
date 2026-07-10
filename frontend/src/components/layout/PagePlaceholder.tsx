import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * PagePlaceholder: standardized "Faz X'te implement edilecek" screen used
 * across all routes whose real content ships in a later phase.
 *
 * Visual rules (FRONTEND.md §2, density "ferah" — content area):
 * - max-w-3xl, generous vertical spacing
 * - H1 text-3xl font-bold, body text-sm text-secondary-foreground
 * - 2-3 Skeleton rows below to telegraph that real content will arrive
 *
 * When the real page lands, this component should be deleted and the route's
 * `element` swapped to the real component.
 */
export interface PagePlaceholderProps {
  title: string;
  /** Markdown-flavored description (kept plain text to avoid extra deps). */
  description: ReactNode;
  /** Where the real implementation will land. e.g. "ROADMAP.md:96-110 (Faz 4)" */
  source: string;
  /** Optional extra content (e.g. :id preview). */
  children?: ReactNode;
}

export function PagePlaceholder({ title, description, source, children }: PagePlaceholderProps) {
  return (
    <section className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-foreground">{title}</h1>
        <p className="text-sm text-secondary-foreground">{description}</p>
        <p className="text-xs text-secondary-foreground">
          İmplementasyon referansı: <span className="font-mono">{source}</span>
        </p>
      </header>

      <div className="space-y-3 rounded-lg border border-border bg-card p-6">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-3/5" />
      </div>

      {children}
    </section>
  );
}
