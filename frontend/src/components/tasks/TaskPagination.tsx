import { Button } from '@/components/ui/button';

type PageItem = number | 'ellipsis-left' | 'ellipsis-right';

function pageItems(page: number, totalPages: number): PageItem[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, 'ellipsis-right', totalPages];
  if (page >= totalPages - 3) {
    return [
      1,
      'ellipsis-left',
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }
  return [1, 'ellipsis-left', page - 1, page, page + 1, 'ellipsis-right', totalPages];
}

interface TaskPaginationProps {
  page: number;
  totalPages: number;
  total?: number;
  onPageChange: (page: number) => void;
}

export function TaskPagination({ page, totalPages, total, onPageChange }: TaskPaginationProps) {
  const rangeStart = total === undefined || total === 0 ? 0 : (page - 1) * 15 + 1;
  const rangeEnd = total === undefined ? 0 : Math.min(page * 15, total);

  return (
    <nav
      aria-label="Görev sayfaları"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4"
    >
      {total !== undefined && (
        <span className="text-xs text-secondary-foreground">
          {rangeStart}–{rangeEnd} / {total} görev
        </span>
      )}
      <div className="ml-auto flex items-center gap-1">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Önceki
        </Button>
        {pageItems(page, totalPages).map((item) =>
          typeof item === 'number' ? (
            <Button
              key={item}
              type="button"
              variant={item === page ? 'primary' : 'secondary'}
              size="sm"
              aria-label={`Sayfa ${item}`}
              aria-current={item === page ? 'page' : undefined}
              onClick={() => onPageChange(item)}
            >
              {item}
            </Button>
          ) : (
            <span key={item} aria-hidden="true" className="px-1 text-sm text-muted-foreground">
              …
            </span>
          ),
        )}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Sonraki
        </Button>
      </div>
    </nav>
  );
}
