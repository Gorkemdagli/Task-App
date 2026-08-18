import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrandPanel } from './BrandPanel';

describe('BrandPanel', () => {
  it('logo + tagline + bullets', () => {
    render(<BrandPanel />);
    expect(screen.getByText('TaskFlow')).toBeInTheDocument();
    expect(screen.getByText(/Görevlerini tek panoda/i)).toBeInTheDocument();
    expect(screen.getByText(/Kanban/i)).toBeInTheDocument();
    expect(screen.getByText(/Mesajlaşma/i)).toBeInTheDocument();
    expect(screen.getByText(/Rol bazlı/i)).toBeInTheDocument();
  });
});
