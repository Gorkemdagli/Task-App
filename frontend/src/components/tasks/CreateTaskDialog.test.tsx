import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateTaskDialog } from './CreateTaskDialog';
import type * as TaskHooks from '@/hooks/tasks';

const { mutateAsyncMock } = vi.hoisted(() => ({ mutateAsyncMock: vi.fn() }));

vi.mock('@/hooks/tasks', async (importOriginal) => {
  const actual = await importOriginal<typeof TaskHooks>();
  return {
    ...actual,
    useCreateTask: () => ({ mutateAsync: mutateAsyncMock, isPending: false }),
  };
});

const members = [{ id: 'user-1', fullName: 'Ada Lovelace', avatarUrl: null }];

function renderDialog(onOpenChange = vi.fn()) {
  const view = render(
    <CreateTaskDialog open onOpenChange={onOpenChange} teamId="team-a" members={members} />,
  );
  return { ...view, onOpenChange };
}

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  const dialog = screen.getByTestId('create-task-dialog');
  fireEvent.change(dialog.querySelector('input[type="text"]')!, {
    target: { value: '  Release v1  ' },
  });
  fireEvent.change(screen.getByLabelText(/Kapsam/), {
    target: { value: ' First item  \n  Second item ' },
  });
  fireEvent.change(screen.getByLabelText(/Beklenen çıktı/), {
    target: { value: '  Delivery note  ' },
  });
  fireEvent.change(screen.getByLabelText('Son Tarih'), {
    target: { value: '2099-01-01' },
  });
  await user.click(screen.getByTestId('assignee-picker-trigger'));
  await user.click(await screen.findByTestId('assignee-option-user-1'));
}

describe('CreateTaskDialog', () => {
  beforeEach(() => {
    mutateAsyncMock.mockReset().mockResolvedValue(undefined);
  });

  it('requires a valid title, assignee, and deadline before submission', async () => {
    const user = userEvent.setup();
    renderDialog();
    const submit = screen.getByRole('button', { name: 'Görev Oluştur' });

    expect(submit).toBeDisabled();
    expect(screen.getByTestId('assignee-required-hint')).toBeInTheDocument();

    const title = screen.getByTestId('create-task-dialog').querySelector('input[type="text"]')!;
    await user.type(title, 'ab');
    expect(submit).toBeDisabled();
    await user.type(title, 'c');
    expect(submit).toBeDisabled();
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it('trims and submits task fields, then closes on success', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();
    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Görev Oluştur' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mutateAsyncMock).toHaveBeenCalledWith({
      title: 'Release v1',
      description: undefined,
      scopeItems: ['First item', 'Second item'],
      expectedOutput: 'Delivery note',
      deadline: '2099-01-01',
      estimateMinutes: null,
      priority: 'medium',
      assigneeIds: ['user-1'],
      teamId: 'team-a',
    });
  }, 15_000);

  it('shows the API error and leaves the dialog open on failure', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();
    mutateAsyncMock.mockRejectedValue({ response: { data: { message: 'Yetki yok' } } });
    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Görev Oluştur' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Yetki yok');
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  }, 15_000);
});
