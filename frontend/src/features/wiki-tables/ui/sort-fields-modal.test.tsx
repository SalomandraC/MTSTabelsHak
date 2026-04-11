import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { MwsField } from '../../../shared/api/wikilive';
import { SortFieldsModal } from './sort-fields-modal';

const FIELDS: MwsField[] = [
  { id: 'fld-title', name: 'Название', type: 'SingleText' },
  { id: 'fld-status', name: 'Статус', type: 'SingleSelect' },
  { id: 'fld-date', name: 'Дата', type: 'DateTime' },
];

describe('SortFieldsModal', () => {
  it('renders sort rules and applies them', () => {
    const onChangeSortRules = vi.fn();

    render(
      <SortFieldsModal
        isOpen
        fields={FIELDS}
        sortRules={[{ id: 'rule-1', fieldId: 'fld-title', desc: false }]}
        onChangeSortRules={onChangeSortRules}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Сортировка' })).toBeInTheDocument();
    expect(screen.getByText('Правило 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Применить' }));
    expect(onChangeSortRules).toHaveBeenCalledWith([{ id: 'rule-1', fieldId: 'fld-title', desc: false }]);
  });
});
