export function BrandPanel() {
  return (
    <div className="hidden min-h-screen w-[260px] flex-col justify-center gap-8 bg-card p-8 md:flex">
      <div>
        <h1 className="text-4xl font-bold text-primary">TaskFlow</h1>
        <p className="mt-2 text-base text-secondary-foreground">Görevlerini tek panoda yönet.</p>
      </div>
      <div className="h-px bg-border" />
      <ul className="space-y-3 text-sm text-secondary-foreground">
        <li>✓ Kanban (Yapılacak / Yapılıyor / Yapıldı)</li>
        <li>✓ Mesajlaşma (DM + takım kanalları)</li>
        <li>✓ Rol bazlı yetki yönetimi</li>
      </ul>
    </div>
  );
}
