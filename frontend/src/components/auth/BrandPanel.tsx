import { ListTodo, MessageCircle, Users } from 'lucide-react';

const features = [
  { title: 'Kanban', description: 'İşlerinizi görsel olarak yönetin.', Icon: ListTodo },
  { title: 'Mesajlaşma', description: 'Ekibinizle tek yerde iletişim kurun.', Icon: MessageCircle },
  { title: 'Rol bazlı yetki', description: 'Ekibinize uygun erişim sağlayın.', Icon: Users },
] as const;

const columns = [
  { title: 'Yapılacak', bars: ['w-full', 'w-3/4', 'w-1/2'], color: 'bg-status-todo/40' },
  { title: 'Yapılıyor', bars: ['w-2/3', 'w-full', 'w-1/2'], color: 'bg-primary' },
  { title: 'Yapıldı', bars: ['w-1/2', 'w-full', 'w-3/4'], color: 'bg-status-done' },
] as const;

/**
 * BrandPanel (FRONTEND.md §4.8, Faz 3 update):
 * - 50/50 split with form panel inside a centered card container (AuthLayout)
 * - Hidden below the desktop breakpoint (mobile shows only the form panel)
 * - Content: logo, tagline, three feature rows and a mini Kanban proof
 *
 * Signature element: the amber left stripe (FRONTEND.md §7) anchors the panel.
 */
export function BrandPanel() {
  return (
    <aside
      className="hidden flex-col justify-between border-r border-l-4 border-border border-l-primary bg-background p-6 sm:p-8 lg:flex lg:p-10"
      aria-label="Uygulama tanıtımı"
    >
      <div>
        <h1 className="text-4xl font-bold leading-none tracking-tight text-foreground">
          <span aria-hidden="true">
            Task<span className="text-primary">Flow</span>
          </span>
          <span className="sr-only">TaskFlow</span>
        </h1>
        <p className="mt-4 max-w-xs text-lg leading-relaxed text-muted-foreground">
          İşleri planlayın.
          <br />
          Ekibinizle birlikte ilerleyin.
        </p>

        <ul className="mt-10 space-y-5 text-sm text-foreground">
          {features.map(({ title, description, Icon }) => (
            <li key={title} className="flex items-center gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-border text-foreground">
                <Icon className="h-6 w-6" strokeWidth={1.5} aria-hidden />
              </span>
              <span>
                <strong className="block font-semibold">{title}</strong>
                <span className="mt-1 block text-muted-foreground">{description}</span>
              </span>
            </li>
          ))}
        </ul>

        <section className="mt-10" aria-label="İş akışı özeti">
          <h2 className="text-base font-semibold text-foreground">İş akışınız, daha düzenli.</h2>
          <div
            className="mt-4 grid grid-cols-3 gap-1"
            role="img"
            aria-label="Yapılacak, Yapılıyor ve Yapıldı kanban kolonları"
          >
            {columns.map(({ title, bars, color }) => (
              <div key={title} className="rounded-md border border-border bg-card p-2">
                <span className="block truncate text-[11px] font-semibold text-foreground">
                  {title}
                </span>
                <div className="mt-3 space-y-2" aria-hidden="true">
                  {bars.map((width, index) => (
                    <span
                      key={`${title}-${index}`}
                      className={`block h-2 rounded-sm ${index === 1 ? color : 'bg-muted-foreground/30'} ${width}`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <p className="pt-10 text-xs leading-relaxed text-muted-foreground">
        Daha iyi ekip çalışmaları için.
        <br />
        <span className="text-foreground">TaskFlow</span>
      </p>
    </aside>
  );
}
