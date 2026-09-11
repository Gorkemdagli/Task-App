import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HeroIllustration } from './HeroIllustration';

describe('HeroIllustration', () => {
  it('renders the hero product surface as a static visual', () => {
    render(<HeroIllustration />);
    const board = screen.getByRole('img', { name: 'TaskFlow çalışma alanı önizlemesi' });

    expect(board).toBeVisible();
    expect(board.querySelector('.landing-hero-board__progress')).not.toBeInTheDocument();
    expect(board.querySelector('.landing-hero-board__task--moving')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Etkileşimli TaskFlow demosuna git' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Animasyonu/ })).not.toBeInTheDocument();
  });

  it('keeps the four-column product composition visible', () => {
    render(<HeroIllustration />);
    const board = screen.getByRole('img', { name: 'TaskFlow çalışma alanı önizlemesi' });
    const columns = board.querySelectorAll(
      '.landing-hero-board__column, .landing-hero-board__column--archive',
    );

    expect(board.querySelector('.landing-hero-board__columns')).toHaveClass(
      'landing-hero-board__columns--lifecycle',
    );
    expect(columns).toHaveLength(4);
    expect(
      Array.from(columns).map((column) => column.querySelector('header')?.textContent),
    ).toEqual(['Yapılacak2', 'Yapılıyor1', 'Yapıldı1', undefined]);
    expect(board.querySelector('.landing-hero-app__sidebar')).toHaveTextContent('Panolar');
    expect(board.querySelector('.landing-hero-board__inspector')).toHaveTextContent(
      'Mobil uygulama için tanıtım videosu',
    );
  });

  it('shows the selected task context from the reference board', () => {
    render(<HeroIllustration />);
    const board = screen.getByRole('img', { name: 'TaskFlow çalışma alanı önizlemesi' });

    expect(board.querySelector('.landing-hero-board__task--selected')).toHaveTextContent(
      'Mobil uygulama için tanıtım videosu',
    );
    expect(screen.getByText('video-senaryo-v1.pdf')).toBeVisible();
    expect(screen.getByText('Takvim bağlantısını da son kontrolden geçirelim.')).toBeVisible();
    expect(board.querySelectorAll('.landing-hero-board__inspector-comments > p')).toHaveLength(4);
  });
});
