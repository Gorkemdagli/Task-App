import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LandingProductDemo } from './LandingProductDemo';

function renderDemo() {
  const onManualInteraction = vi.fn();
  const user = userEvent.setup();

  render(<LandingProductDemo guidedBeat={0} onManualInteraction={onManualInteraction} />);

  return { onManualInteraction, user };
}

describe('LandingProductDemo', () => {
  it('switches between board and task views manually', async () => {
    const { onManualInteraction, user } = renderDemo();

    expect(screen.getByRole('tab', { name: 'Pano' })).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('tab', { name: 'Görevler' }));

    expect(screen.getByRole('tab', { name: 'Görevler' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('region', { name: 'Görev listesi' })).toBeInTheDocument();
    expect(onManualInteraction).toHaveBeenCalledTimes(1);
  });

  it('supports roving keyboard focus for view tabs', async () => {
    const { onManualInteraction, user } = renderDemo();
    const boardTab = screen.getByRole('tab', { name: 'Pano' });
    const tasksTab = screen.getByRole('tab', { name: 'Görevler' });

    boardTab.focus();
    await user.keyboard('{ArrowRight}');
    expect(tasksTab).toHaveFocus();
    expect(tasksTab).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{Home}');
    expect(boardTab).toHaveFocus();

    await user.keyboard('{End}');
    expect(tasksTab).toHaveFocus();
    expect(onManualInteraction).toHaveBeenCalledTimes(3);
  });

  it('selects a team and shows only that team tasks', async () => {
    const { onManualInteraction, user } = renderDemo();

    await user.click(screen.getByRole('button', { name: 'Ürün Takımı' }));

    expect(screen.getByRole('button', { name: 'Ürün Takımı' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      screen.getByRole('button', { name: 'Bildirim panelini sadeleştir' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'OAuth akışı' })).not.toBeInTheDocument();
    expect(onManualInteraction).toHaveBeenCalledTimes(1);
  });

  it('opens and closes the inline task inspector', async () => {
    const { onManualInteraction, user } = renderDemo();

    await user.click(screen.getByRole('button', { name: 'OAuth akışı' }));

    const inspector = screen.getByRole('complementary', { name: 'Görev ayrıntısı' });
    expect(within(inspector).getByRole('heading', { name: 'OAuth akışı' })).toBeInTheDocument();
    expect(within(inspector).getByText('Görkem Kaya')).toBeInTheDocument();

    await user.click(within(inspector).getByRole('button', { name: 'Ayrıntıyı kapat' }));

    expect(
      screen.queryByRole('complementary', { name: 'Görev ayrıntısı' }),
    ).not.toBeInTheDocument();
    expect(onManualInteraction).toHaveBeenCalledTimes(2);
  });

  it('changes task status from the inspector', async () => {
    const { onManualInteraction, user } = renderDemo();

    await user.click(screen.getByRole('button', { name: 'OAuth akışı' }));
    const inspector = screen.getByRole('complementary', { name: 'Görev ayrıntısı' });
    await user.click(within(inspector).getByRole('button', { name: 'Yapıldı' }));

    const doneColumn = screen.getByRole('region', { name: 'Yapıldı görevleri' });
    expect(within(doneColumn).getByRole('button', { name: 'OAuth akışı' })).toBeInTheDocument();
    expect(onManualInteraction).toHaveBeenCalledTimes(2);
  });

  it('resets the exact fixture and resumes guided mode', async () => {
    const { user } = renderDemo();

    await user.click(screen.getByRole('button', { name: 'OAuth akışı' }));
    await user.click(
      within(screen.getByRole('complementary', { name: 'Görev ayrıntısı' })).getByRole('button', {
        name: 'Yapıldı',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Demoyu sıfırla' }));

    expect(screen.getByRole('tab', { name: 'Pano' })).toHaveAttribute('aria-selected', 'true');
    expect(
      screen.queryByRole('complementary', { name: 'Görev ayrıntısı' }),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Yapılacak görevleri' })).getByRole('button', {
        name: 'OAuth akışı',
      }),
    ).toBeInTheDocument();
  });

  it('moves a focused task across fixed columns with the keyboard', async () => {
    const { user } = renderDemo();
    const rects: Record<string, number> = {
      'Yapılacak görevleri': 0,
      'Yapılıyor görevleri': 320,
      'Yapıldı görevleri': 640,
    };
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function getRect() {
        const left = rects[this.getAttribute('aria-label') ?? ''] ?? 16;

        return {
          x: left,
          y: 0,
          top: 0,
          left,
          right: left + 280,
          bottom: 400,
          width: 280,
          height: 400,
          toJSON: () => undefined,
        };
      });
    const task = screen.getByRole('button', { name: 'OAuth akışı' });

    task.focus();
    await user.keyboard('[Space]');
    await user.keyboard('[ArrowRight][ArrowRight]');
    await user.keyboard('[Space]');

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('OAuth akışı Yapıldı durumuna taşındı.');
    });
    expect(
      within(screen.getByRole('region', { name: 'Yapıldı görevleri' })).getByRole('button', {
        name: 'OAuth akışı',
      }),
    ).toBeInTheDocument();

    rectSpy.mockRestore();
  });
});
