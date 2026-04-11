import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { MwsField } from '../../../shared/api/wikilive';
import { GroupRecordsModal } from './group-records-modal';

const FIELDS: MwsField[] = [
  { id: 'fld-title', name: 'Название', type: 'SingleText' },
  { id: 'fld-status', name: 'Статус', type: 'SingleSelect' },
  { id: 'fld-date', name: 'Дата', type: 'DateTime' },
];

describe('GroupRecordsModal', () => {
  it('renders grouping UI and applies group rule', () => {
    const onChangeGroupRule = vi.fn();

    render(
      <GroupRecordsModal
        isOpen
        fields={FIELDS}
        groupRule={{ fieldId: 'fld-status', desc: false }}
        onChangeGroupRule={onChangeGroupRule}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog', { name: /Группировка по полю/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Применить' }));
    expect(onChangeGroupRule).toHaveBeenCalledWith({ fieldId: 'fld-status', desc: false });
  });

  it('allows disabling grouping', () => {
    const onChangeGroupRule = vi.fn();

    render(
      <GroupRecordsModal
        isOpen
        fields={FIELDS}
        groupRule={{ fieldId: 'fld-status', desc: false }}
        onChangeGroupRule={onChangeGroupRule}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Отключить группировку/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Применить' }));

    expect(onChangeGroupRule).toHaveBeenCalledWith(null);
  });
});
