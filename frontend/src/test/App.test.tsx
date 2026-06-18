import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';

describe('App', () => {
  it('renders TaskFlow heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /TaskFlow/i })).toBeInTheDocument();
  });

  it('renders hello message', () => {
    render(<App />);
    expect(screen.getByText(/Hello from TaskFlow/i)).toBeInTheDocument();
  });
});
