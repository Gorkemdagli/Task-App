import type { FooterGroup } from '@/pages/Landing/data/mockData';

interface FooterLinkGroupProps {
  group: FooterGroup;
}

/**
 * Footer link column with title + flat link list.
 * Hash links (e.g. #features) are anchor-only — no router navigation.
 */
export function FooterLinkGroup({ group }: FooterLinkGroupProps) {
  return (
    <div className="flex flex-col gap-3">
      <h5 className="text-xs font-semibold tracking-wide text-landing-muted uppercase">
        {group.title}
      </h5>
      <ul className="flex flex-col gap-2">
        {group.links.map((link) => (
          <li key={link.url}>
            <a href={link.url} className="text-sm transition-colors hover:text-landing-primary">
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
