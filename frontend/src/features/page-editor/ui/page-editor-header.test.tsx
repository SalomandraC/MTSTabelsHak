import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PageEditorHeader } from './page-editor-header';

describe('PageEditorHeader', () => {
  it('allows inline title editing when header is editable', () => {
    render(<PageEditorHeader title="Документ" description="Описание" onSave={vi.fn()} />);

    fireEvent.click(screen.getByText('Документ'));

    expect(screen.getByDisplayValue('Документ')).toBeInTheDocument();
  });

  it('does not enter edit mode when header is read-only', () => {
    render(<PageEditorHeader title="Документ" description="Описание" editable={false} onSave={vi.fn()} />);

    fireEvent.click(screen.getByText('Документ'));
    fireEvent.click(screen.getByText('Описание'));

    expect(screen.queryByDisplayValue('Документ')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('Описание')).not.toBeInTheDocument();
  });

  it('switches between document views from the header menu', () => {
    const onViewModeChange = vi.fn();

    render(
      <PageEditorHeader
        title="Документ"
        description="Описание"
        viewMode="standard"
        showViewModeControls
        onSave={vi.fn()}
        onViewModeChange={onViewModeChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Вид' }));
    fireEvent.click(screen.getAllByRole('menuitemradio')[1]!);

    expect(onViewModeChange).toHaveBeenCalledWith('paged');
  });
});
