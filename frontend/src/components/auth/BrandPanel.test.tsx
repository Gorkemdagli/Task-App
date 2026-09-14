import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrandPanel } from './BrandPanel';

describe('BrandPanel', () => {
  it('logo + tagline + bullets', () => {
    render(<BrandPanel />);
    expect(screen.getByRole('heading', { name: 'TaskFlow' })).toBeInTheDocument();
    expect(screen.getByText(/İşleri planlayın/i)).toBeInTheDocument();
    expect(screen.getByText(/Kanban/i)).toBeInTheDocument();
    expect(screen.getByText(/Mesajlaşma/i)).toBeInTheDocument();
    expect(screen.getByText(/Rol bazlı/i)).toBeInTheDocument();
    expect(screen.getByText('Yapılacak')).toBeInTheDocument();
    expect(screen.getByText('Yapılıyor')).toBeInTheDocument();
    expect(screen.getByText('Yapıldı')).toBeInTheDocument();
  });
});
