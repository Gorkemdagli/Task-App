import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AssigneePicker } from './AssigneePicker';

describe('AssigneePicker', () => {
  it('uses the shared overlapping avatar stack in the picker trigger', () => {
    render(
      <AssigneePicker
        members={[
          { id: 'u1', fullName: 'Ada', avatarUrl: null },
          { id: 'u2', fullName: 'Selin', avatarUrl: null },
        ]}
        value={['u1', 'u2']}
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByTestId('assignee-picker-trigger').querySelector('.bg-background.p-1'),
    ).toBeInTheDocument();
  });

  it('dimension lazy-loaded picker avatar', async () => {
    render(
      <AssigneePicker
        members={[{ id: 'u1', fullName: 'Ada', avatarUrl: '/avatar.png' }]}
        value={[]}
        onChange={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByTestId('assignee-picker-trigger'));
    const image = await screen.findByRole('img');
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image).toHaveAttribute('decoding', 'async');
    expect(image).toHaveAttribute('width', '24');
    expect(image).toHaveAttribute('height', '24');
  });
});
