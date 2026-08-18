import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DeadlinePicker } from './DeadlinePicker';

describe('DeadlinePicker', () => {
  it('passes selected calendar date without converting to ISO', () => {
    const onChange = vi.fn();
    render(<DeadlinePicker value={null} onChange={onChange} />);

    fireEvent.change(document.querySelector('input[type="date"]')!, {
      target: { value: '2026-08-13' },
    });

    expect(onChange).toHaveBeenCalledWith('2026-08-13');
  });

  it('renders existing date value unchanged', () => {
    render(<DeadlinePicker value="2026-08-13" onChange={vi.fn()} />);

    expect(document.querySelector('input[type="date"]')).toHaveValue('2026-08-13');
  });
});
