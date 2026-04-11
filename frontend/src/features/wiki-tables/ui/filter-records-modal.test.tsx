import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { MwsField } from '../../../shared/api/wikilive';
import { FilterRecordsModal } from './filter-records-modal';

const FIELDS: MwsField[] = [
  { id: 'fld-title', name: 'Название', type: 'SingleText' },
  { id: 'fld-status', name: 'Статус', type: 'SingleSelect' },
  { id: 'fld-date', name: 'Дата', type: 'DateTime' },
];

describe('FilterRecordsModal', () => {
  it('renders filter rules and applies them', () => {
    const onChangeFilterRules = vi.fn();

    render(
      <FilterRecordsModal
        isOpen
        fields={FIELDS}
        filterRules={[{ id: 'rule-1', fieldId: 'fld-title', operator: 'contains', value: 'test' }]}
        onChangeFilterRules={onChangeFilterRules}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog', { name: /Фильтры по данным/i })).toBeInTheDocument();
    expect(screen.getByText('Условие 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Применить' }));
    expect(onChangeFilterRules).toHaveBeenCalledWith([
      { id: 'rule-1', fieldId: 'fld-title', operator: 'contains', value: 'test' }
    ]);
  });

  it('adds and removes filter rules', () => {
    const onChangeFilterRules = vi.fn();

    render(
      <FilterRecordsModal
        isOpen
        fields={FIELDS}
        filterRules={[
          { id: 'rule-1', fieldId: 'fld-title', operator: 'contains', value: 'test' },
          { id: 'rule-2', fieldId: 'fld-status', operator: 'equals', value: 'active' },
        ]}
        onChangeFilterRules={onChangeFilterRules}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Условие 1')).toBeInTheDocument();
    expect(screen.getByText('Условие 2')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Удалить' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Применить' }));

    const callArgs = onChangeFilterRules.mock.calls[0]?.[0] ?? [];
    expect(callArgs).toHaveLength(1);
    expect(callArgs[0]?.id).toBe('rule-2');
  });
});
