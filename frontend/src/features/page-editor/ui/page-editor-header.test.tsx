import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PageEditorHeader } from './page-editor-header';

describe('PageEditorHeader', () => {
  it('allows inline title editing when header is editable', () => {
    render(<PageEditorHeader title="Документ" description="Описание" onSave={vi.fn()} />);

    fireEvent.doubleClick(screen.getByText('Документ'));

    expect(screen.getByDisplayValue('Документ')).toBeInTheDocument();
  });

  it('does not enter edit mode when header is read-only', () => {
    render(<PageEditorHeader title="Документ" description="Описание" editable={false} onSave={vi.fn()} />);

    fireEvent.doubleClick(screen.getByText('Документ'));
    fireEvent.doubleClick(screen.getByText('Описание'));

    expect(screen.queryByDisplayValue('Документ')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('Описание')).not.toBeInTheDocument();
  });
});
