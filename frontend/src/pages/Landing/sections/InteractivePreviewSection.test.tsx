import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { InteractivePreviewSection } from './InteractivePreviewSection';

describe('InteractivePreviewSection', () => {
  it('tracks the four sandbox tasks and clears them with reset', async () => {
    const user = userEvent.setup();
    render(<InteractivePreviewSection />);
    const challenges = screen.getByRole('list', { name: 'Demo görevleri' });

    expect(within(challenges).getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByText(/Dört küçük adımı tamamlayın/)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Ürün turu' })).not.toBeInTheDocument();
    expect(within(challenges).queryByText('Tamamlandı')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Liste' }));
    expect(within(challenges).getAllByText('Tamamlandı')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'OAuth akışı' }));
    expect(within(challenges).getAllByText('Tamamlandı')).toHaveLength(2);

    const inspector = screen.getByRole('complementary', { name: 'Görev ayrıntısı' });
    await user.click(within(inspector).getByRole('button', { name: 'Yapıldı' }));
    expect(within(challenges).getAllByText('Tamamlandı')).toHaveLength(3);

    await user.click(screen.getByRole('button', { name: 'Ürün Takımı' }));
    expect(within(challenges).getAllByText('Tamamlandı')).toHaveLength(4);

    await user.click(screen.getByRole('button', { name: 'Demoyu sıfırla' }));
    expect(within(challenges).queryByText('Tamamlandı')).not.toBeInTheDocument();
  });
});
