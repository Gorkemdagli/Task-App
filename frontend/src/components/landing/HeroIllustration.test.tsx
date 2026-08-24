import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HeroIllustration } from './HeroIllustration';

describe('HeroIllustration', () => {
  it('links the product teaser to the real interactive demo without a motion override', () => {
    render(<HeroIllustration />);
    const teaser = screen.getByRole('link', { name: 'Etkileşimli TaskFlow demosuna git' });

    expect(teaser).toHaveAttribute('href', '#interactive-app-preview');
    expect(teaser).not.toHaveAttribute('data-motion-override');
    expect(screen.queryByRole('button', { name: /Animasyonu/ })).not.toBeInTheDocument();
  });
});
