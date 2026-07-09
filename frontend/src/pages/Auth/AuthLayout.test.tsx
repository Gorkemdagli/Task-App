import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthLayout } from './AuthLayout';

describe('AuthLayout', () => {
  it('renders Outlet + BrandPanel', () => {
    render(
      <MemoryRouter initialEntries={['/x']}>
        <Routes>
          <Route element={<AuthLayout />}>
            <Route path="/x" element={<div>Child</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Child')).toBeInTheDocument();
    expect(screen.getByText('TaskFlow')).toBeInTheDocument();
  });
});
