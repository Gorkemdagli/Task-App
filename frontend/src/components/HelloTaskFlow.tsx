import { Button } from './ui/button';

export function HelloTaskFlow() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="rounded-lg bg-card p-8 shadow-card">
        <h1 className="text-4xl font-bold text-primary">TaskFlow</h1>
        <p className="mt-2 text-secondary-foreground">Hello from TaskFlow</p>
        <div className="mt-4 flex gap-2">
          <span
            className="rounded-sm bg-priority-high px-2 py-1 text-xs font-medium text-white"
            aria-label="Yüksek öncelik"
          >
            Yüksek
          </span>
          <span
            className="rounded-sm bg-priority-medium px-2 py-1 text-xs font-medium text-black"
            aria-label="Orta öncelik"
          >
            Orta
          </span>
          <span
            className="rounded-sm bg-priority-low px-2 py-1 text-xs font-medium text-white"
            aria-label="Düşük öncelik"
          >
            Düşük
          </span>
        </div>
        <div className="mt-6 flex gap-2">
          <Button>Ana Aksiyon</Button>
          <Button variant="secondary">İkincil</Button>
          <Button variant="destructive">Sil</Button>
        </div>
      </div>
    </div>
  );
}
