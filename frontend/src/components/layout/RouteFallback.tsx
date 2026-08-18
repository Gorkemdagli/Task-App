export function RouteFallback() {
  return (
    <div
      data-testid="route-fallback"
      className="space-y-3"
      role="status"
      aria-label="Sayfa yükleniyor"
    >
      <div className="h-8 w-48 animate-pulse rounded-md bg-secondary" />
      <div className="h-24 w-full animate-pulse rounded-md bg-secondary" />
    </div>
  );
}
