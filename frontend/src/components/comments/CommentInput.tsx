import { useState } from 'react';
import { useCreateComment } from '@/hooks/tasks';

interface CommentInputProps {
  taskId: string;
  disabled?: boolean;
}

export function CommentInput({ taskId, disabled }: CommentInputProps) {
  const [body, setBody] = useState('');
  const create = useCreateComment(taskId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = body.trim();
    if (trimmed.length === 0) return;
    await create.mutateAsync({ body: trimmed });
    setBody('');
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={2000}
        rows={3}
        placeholder="Yorum yaz…"
        disabled={disabled}
        className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
        data-testid="comment-input"
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{body.length}/2000</span>
        <button
          type="submit"
          disabled={disabled || body.trim().length === 0 || create.isPending}
          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-black transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {create.isPending ? 'Gönderiliyor…' : 'Gönder'}
        </button>
      </div>
    </form>
  );
}
