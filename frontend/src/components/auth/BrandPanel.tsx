import { Check } from 'lucide-react';

/**
 * BrandPanel (FRONTEND.md §4.8, Faz 3 update):
 * - 50/50 split with form panel inside a centered card container (AuthLayout)
 * - Width: flex-1 inside the card; height matches form panel (grid stretch)
 * - Hidden <768px (mobile shows only the form panel)
 * - Content: logo + tagline + 4 feature bullets
 *
 * Signature element: thin amber left stripe (FRONTEND.md §7) is provided by
 * the parent card's border-radius; the active page already inherits it via
 * the brand chip. Here we keep the visual calm — amber logo + amber checkmarks.
 */
export function BrandPanel() {
  return (
    <aside
      className="hidden flex-col justify-between border-r border-border bg-background p-8 lg:flex lg:p-12"
      aria-label="Uygulama tanıtımı"
    >
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-primary">TaskFlow</h1>
        <p className="mt-3 text-base leading-relaxed text-secondary-foreground">
          Görevlerini tek panoda yönet. Takımlarınla hizalan, deadline'ları kaçırma, her şey tek
          bakışta.
        </p>
      </div>

      <ul className="mt-12 space-y-4 text-sm text-foreground">
        <li className="flex items-start gap-3">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <div>
            <span className="font-medium">Kanban</span>
            <span className="text-secondary-foreground"> — Yapılacak / Yapılıyor / Yapıldı.</span>
          </div>
        </li>
        <li className="flex items-start gap-3">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <div>
            <span className="font-medium">Mesajlaşma</span>
            <span className="text-secondary-foreground"> — DM ve takım kanalları.</span>
          </div>
        </li>
        <li className="flex items-start gap-3">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <div>
            <span className="font-medium">Rol bazlı yetki</span>
            <span className="text-secondary-foreground"> — Şirket & takım admini ayrımı.</span>
          </div>
        </li>
        <li className="flex items-start gap-3">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <div>
            <span className="font-medium">Tenant izolasyonu</span>
            <span className="text-secondary-foreground"> — Şirket verileri ayrı kalır.</span>
          </div>
        </li>
      </ul>

      <p className="mt-12 font-mono text-xs text-secondary-foreground">
        v0.1 · Faz 3 · Temel Layout
      </p>
    </aside>
  );
}
