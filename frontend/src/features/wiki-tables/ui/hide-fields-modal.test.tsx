import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { MwsField } from '../../../shared/api/wikilive';
import { HideFieldsModal } from './hide-fields-modal';

const FIELDS: MwsField[] = [
  { id: 'fld-title', name: 'Название', type: 'SingleText' },
  { id: 'fld-status', name: 'Статус', type: 'SingleSelect' },
  { id: 'fld-files', name: 'Вложения', type: 'Attachment' },
];

describe('HideFieldsModal', () => {
  it('shows active fields and toggles hidden ids', () => {
    const onChangeHiddenFieldIds = vi.fn();

    render(
      <HideFieldsModal
        isOpen
        fields={FIELDS}
        hiddenFieldIds={['fld-status']}
        onChangeHiddenFieldIds={onChangeHiddenFieldIds}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Персональное скрытие полей' })).toBeInTheDocument();
    expect(screen.getByText('Название')).toBeInTheDocument();
    expect(screen.getByText('Одиночный выбор')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    expect(onChangeHiddenFieldIds).toHaveBeenCalledWith(['fld-status', 'fld-title']);

    fireEvent.click(screen.getByRole('button', { name: 'Показать все' }));
    expect(onChangeHiddenFieldIds).toHaveBeenCalledWith([]);
  });
});
