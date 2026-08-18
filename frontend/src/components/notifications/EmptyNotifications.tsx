import { BellOff } from 'lucide-react';

export function EmptyNotifications() {
  return (
    <div
      data-testid="empty-notifications"
      className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center"
    >
      <BellOff className="h-8 w-8 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium text-foreground">Henüz bildirim yok</p>
      <p className="text-xs text-muted-foreground">
        Yeni görev atamaları ve yorumlar burada görünecek.
      </p>
    </div>
  );
}
