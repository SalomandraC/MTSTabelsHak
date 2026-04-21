import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CreateFieldModal } from './create-field-modal';

describe('CreateFieldModal', () => {
  it('resets form state when reopened after closing', () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn();

    const { rerender } = render(
      <CreateFieldModal
        isOpen
        isSubmitting={false}
        onClose={onClose}
        onSubmit={onSubmit}
      />
    );

    fireEvent.change(screen.getByLabelText('Название столбца'), {
      target: { value: 'Новый статус' }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      <CreateFieldModal
        isOpen={false}
        isSubmitting={false}
        onClose={onClose}
        onSubmit={onSubmit}
      />
    );

    rerender(
      <CreateFieldModal
        isOpen
        isSubmitting={false}
        onClose={onClose}
        onSubmit={onSubmit}
      />
    );

    expect(screen.getByLabelText('Название столбца')).toHaveValue('');
    expect(screen.getByRole('combobox')).toHaveValue('SingleText');
  });
});