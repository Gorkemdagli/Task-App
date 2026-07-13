import { Kanban, MessageSquare, Shield, type LucideIcon } from 'lucide-react';
import type { FeatureItem } from '@/pages/Landing/data/mockData';
import { cn } from '@/lib/utils';

interface FeatureCardProps {
  feature: FeatureItem;
}

const iconMap: Record<FeatureItem['icon'], LucideIcon> = {
  kanban: Kanban,
  message: MessageSquare,
  shield: Shield,
};

// Per-size visual sizing only. NO min-heights here — CSS Grid's default
// `align-items: stretch` makes cards in the same row match the tallest
// card's intrinsic height (i.e. content-driven). Inflating with min-h
// makes f1 (large) taller than its content and breaks row equality.
const gridSizeClass: Record<FeatureItem['size'], string> = {
  large: 'lg:p-10',
  small: '',
  'full-width': 'lg:col-span-2 lg:p-8',
};

const iconBoxClass: Record<FeatureItem['size'], string> = {
  large: 'h-14 w-14 lg:h-16 lg:w-16',
  small: 'h-12 w-12',
  'full-width': 'h-12 w-12 lg:h-14 lg:w-14',
};

const iconClass: Record<FeatureItem['size'], string> = {
  large: 'h-7 w-7 lg:h-8 lg:w-8',
  small: 'h-6 w-6',
  'full-width': 'h-6 w-6 lg:h-7 lg:w-7',
};

const titleClass: Record<FeatureItem['size'], string> = {
  large: 'text-2xl lg:text-3xl',
  small: 'text-xl',
  'full-width': 'text-xl lg:text-2xl',
};

export function FeatureCard({ feature }: FeatureCardProps) {
  const Icon = iconMap[feature.icon];

  return (
    <article
      className={cn(
        'group flex flex-col gap-4 rounded-lg bg-landing-card border border-landing-border transition-colors duration-200 hover:border-landing-primary p-6',
        gridSizeClass[feature.size],
      )}
    >
      <div
        className={cn(
          'flex items-center justify-center rounded-lg bg-landing-primary-soft text-landing-primary',
          iconBoxClass[feature.size],
        )}
      >
        <Icon className={iconClass[feature.size]} aria-hidden />
      </div>

      <div className="flex flex-col gap-2">
        <h3 className={cn('font-semibold tracking-tight', titleClass[feature.size])}>
          {feature.title}
        </h3>
        <p className="text-sm leading-relaxed text-landing-muted lg:text-base">
          {feature.description}
        </p>
      </div>

      {feature.badges && feature.badges.length > 0 && (
        <div className="mt-auto flex flex-wrap gap-2 pt-2">
          {feature.badges.map((badge) => (
            <span
              key={badge}
              className="inline-flex items-center rounded-md bg-landing-bg-alt px-2 py-1 text-xs font-semibold tracking-wide uppercase text-landing-muted border border-landing-border"
            >
              {badge}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}
