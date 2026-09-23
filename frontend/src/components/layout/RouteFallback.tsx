export function RouteFallback() {
  return (
    <div
      data-testid="route-fallback"
      className="flex min-h-screen items-center justify-center bg-background text-secondary-foreground"
      role="status"
      aria-label="Sayfa yükleniyor"
    >
      Yükleniyor...
    </div>
  );
}
