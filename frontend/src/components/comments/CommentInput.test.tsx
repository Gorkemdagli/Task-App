import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommentInput } from './CommentInput';
import type * as TaskHooks from '@/hooks/tasks';

const { mutateAsyncMock } = vi.hoisted(() => ({ mutateAsyncMock: vi.fn() }));

vi.mock('@/hooks/tasks', async (importOriginal) => {
  const actual = await importOriginal<typeof TaskHooks>();
  return {
    ...actual,
    useCreateComment: () => ({ mutateAsync: mutateAsyncMock, isPending: false }),
  };
});

describe('CommentInput', () => {
  beforeEach(() => {
    mutateAsyncMock.mockReset().mockResolvedValue(undefined);
  });

  it('keeps submission disabled for blank comments and when disabled by the parent', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<CommentInput taskId="task-1" />);
    const input = screen.getByTestId('comment-input');
    const submit = screen.getByRole('button', { name: 'Yorum yap' });

    expect(submit).toBeDisabled();
    await user.type(input, '   ');
    expect(submit).toBeDisabled();
    rerender(<CommentInput taskId="task-1" disabled />);
    expect(input).toBeDisabled();
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it('trims the submitted comment and clears the draft on success', async () => {
    const user = userEvent.setup();
    render(<CommentInput taskId="task-1" />);
    const input = screen.getByTestId('comment-input');

    await user.type(input, '  Looks good  ');
    await user.click(screen.getByRole('button', { name: 'Yorum yap' }));

    await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalledWith({ body: 'Looks good' }));
    await waitFor(() => expect(input).toHaveValue(''));
  });

  it('shows a retry message and preserves the draft after an API failure', async () => {
    const user = userEvent.setup();
    mutateAsyncMock.mockRejectedValue(new Error('network error'));
    render(<CommentInput taskId="task-1" />);
    const input = screen.getByTestId('comment-input');

    await user.type(input, 'Keep this comment');
    await user.click(screen.getByRole('button', { name: 'Yorum yap' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Yorum gönderilemedi. Tekrar deneyin.');
    expect(input).toHaveValue('Keep this comment');
    await user.type(input, '!');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
