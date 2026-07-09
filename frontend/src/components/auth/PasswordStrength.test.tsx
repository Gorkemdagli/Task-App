import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PasswordStrength } from './PasswordStrength';

describe('PasswordStrength', () => {
  it('null for empty', () => {
    const { container } = render(<PasswordStrength password="" />);
    expect(container.firstChild).toBeNull();
  });
  it('Zayıf', () => {
    render(<PasswordStrength password="abcdefghi" />);
    expect(screen.getByText('Zayıf')).toBeInTheDocument();
  });
  it('Orta', () => {
    render(<PasswordStrength password="abcdefg1" />);
    expect(screen.getByText('Orta')).toBeInTheDocument();
  });
  it('Güçlü', () => {
    render(<PasswordStrength password="Abcdefghijkl1" />);
    expect(screen.getByText('Güçlü')).toBeInTheDocument();
  });
});
