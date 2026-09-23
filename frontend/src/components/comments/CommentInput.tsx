import { useState } from 'react';
import { useCreateComment } from '@/hooks/tasks';
import { useAuthStore } from '@/stores/authStore';

interface CommentInputProps {
  taskId: string;
  disabled?: boolean;
}

export function CommentInput({ taskId, disabled }: CommentInputProps) {
  const [body, setBody] = useState('');
  const [error, setError] = useState(false);
  const create = useCreateComment(taskId);
  const user = useAuthStore((state) => state.user);
  const initials = (user?.fullName ?? '?')
    .split(' ')
    .map((part) => part[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = body.trim();
    if (trimmed.length === 0) return;
    setError(false);
    try {
      await create.mutateAsync({ body: trimmed });
      setBody('');
    } catch {
      setError(true);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-3 grid grid-cols-[36px_minmax(0,1fr)] gap-3 border-t border-border pt-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
        {initials || '?'}
      </span>
      <div className="min-w-0">
        <textarea
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setError(false);
          }}
          maxLength={2000}
          rows={2}
          placeholder="Yorumunuzu yazın…"
          disabled={disabled}
          className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="comment-input"
        />
        {error && <p role="alert" className="mt-2 text-xs text-destructive">Yorum gönderilemedi. Tekrar deneyin.</p>}
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">{body.length}/2000</span>
          <button
            type="submit"
            disabled={disabled || body.trim().length === 0 || create.isPending}
            className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-black transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {create.isPending ? 'Gönderiliyor…' : 'Yorum yap'}
          </button>
        </div>
      </div>
    </form>
  );
}
