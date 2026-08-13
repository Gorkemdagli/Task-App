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
  onPageChange: (page: number) => void;
}

export function TaskPagination({ page, totalPages, onPageChange }: TaskPaginationProps) {
  return (
    <nav aria-label="Görev sayfaları" className="flex items-center justify-center gap-1 p-4">
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
    </nav>
  );
}
