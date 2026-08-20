import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddMemberModal } from './AddMemberModal';

const mocks = vi.hoisted(() => ({
  useAddMember: vi.fn(),
  useTeamMemberCandidates: vi.fn(),
}));

vi.mock('@/hooks/queries/useTeamMutations', () => ({
  useAddMember: mocks.useAddMember,
}));

vi.mock('@/hooks/queries/useTeams', () => ({
  useTeamMemberCandidates: mocks.useTeamMemberCandidates,
}));

const candidate = {
  id: 'user-1',
  displayId: 'B3X9K',
  email: 'selin@example.com',
  fullName: 'Selin Demir',
  avatarUrl: null,
};

describe('AddMemberModal', () => {
  beforeEach(() => {
    mocks.useTeamMemberCandidates.mockReturnValue({
      data: [],
      isFetching: false,
      isError: false,
    });
    mocks.useAddMember.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
    });
  });

  it('shows company matches while typing and adds selected user', async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue({});
    mocks.useAddMember.mockReturnValue({ mutateAsync, isPending: false });
    mocks.useTeamMemberCandidates.mockReturnValue({
      data: [candidate],
      isFetching: false,
      isError: false,
    });

    render(<AddMemberModal teamId="team-1" />);
    await user.click(screen.getByRole('button', { name: 'Üye Ekle' }));
    await user.type(screen.getByRole('combobox', { name: 'Takım üyesi ara' }), 'selin');

    expect(await screen.findByRole('option', { name: /Selin Demir/ })).toHaveTextContent(
      'selin@example.com',
    );
    await user.click(screen.getByRole('option', { name: /Selin Demir/ }));
    await user.click(screen.getByRole('button', { name: 'Ekle' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ displayId: 'B3X9K' }));
  });

  it('requires selecting a matching company user', async () => {
    const user = userEvent.setup();
    render(<AddMemberModal teamId="team-1" />);
    await user.click(screen.getByRole('button', { name: 'Üye Ekle' }));
    await user.type(screen.getByRole('combobox', { name: 'Takım üyesi ara' }), 'unknown');
    await user.click(screen.getByRole('button', { name: 'Ekle' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Şirket kullanıcısı seçin.');
  });
});
