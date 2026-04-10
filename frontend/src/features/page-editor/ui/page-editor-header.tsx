import React from 'react';
import DOC from '../../../app/images/Doc.svg';

type PageEditorHeaderProps = {
  title: string;
  description: string;
  onSave?: (title: string, description: string) => void;
};

export function PageEditorHeader({ title, description, onSave }: PageEditorHeaderProps) {
  const [editingField, setEditingField] = React.useState<'title' | 'description' | null>(null);
  const [localTitle, setLocalTitle] = React.useState(title);
  const [localDescription, setLocalDescription] = React.useState(description);

  React.useEffect(() => setLocalTitle(title), [title]);
  React.useEffect(() => setLocalDescription(description), [description]);

  const handleSave = () => {
    const newTitle = localTitle.trim() || 'Новая страница';
    const newDescription = localDescription.trim();
    
    if (newTitle !== title || newDescription !== description) {
      onSave?.(newTitle, newDescription);
    }
    
    setEditingField(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    }
    if (e.key === 'Escape') {
      setEditingField(null);
      setLocalTitle(title);
      setLocalDescription(description);
    }
  };

  return (
    <header className="flex items-start gap-3 border-b border-editor-border-subtle bg-editor-bg-page px-3 py-3 sm:px-4 sm:py-4">
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-[0.65rem] font-semibold text-editor-brand mt-0.5">
        <img 
          src={DOC} 
          alt="Иконка страницы" 
          className="h-4 w-4"
        />
      </span>
      
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            {editingField === 'title' ? (
              <input
                type="text"
                value={localTitle}
                onChange={(e) => setLocalTitle(e.target.value)}
                onBlur={handleSave}
                onKeyDown={handleKeyDown}
                className="w-full font-wide text-sm leading-5 text-editor-text-primary bg-editor-bg-input border border-editor-border-control rounded-md px-2 py-1 focus:outline-none focus:border-editor-brand"
                placeholder="Название страницы"
                autoFocus
              />
            ) : (
              <h1
                className="truncate font-wide text-sm leading-5 text-editor-text-primary cursor-text hover:bg-editor-bg-control/50 rounded px-1 -mx-1 transition-colors"
                onDoubleClick={() => {
                  setLocalTitle(title);
                  setEditingField('title');
                }}
              >
                {title}
              </h1>
            )}
            {editingField === 'description' ? (
              <input
                type="text"
                value={localDescription}
                onChange={(e) => setLocalDescription(e.target.value)}
                onBlur={handleSave}
                onKeyDown={handleKeyDown}
                className="mt-1 w-full text-sm leading-5 bg-editor-bg-input border border-editor-border-control rounded-md px-2 py-1 focus:outline-none focus:border-editor-brand"
                style={{ color: 'rgba(150, 159, 168, 1)' }}
                placeholder="Добавить описание"
                autoFocus
              />
            ) : (
              <p
                className="truncate text-sm leading-5 cursor-text hover:bg-editor-bg-control/50 rounded px-1 -mx-1 transition-colors"
                style={{ color: 'rgba(150, 159, 168, 1)' }}
                onDoubleClick={() => {
                  setLocalDescription(description);
                  setEditingField('description');
                }}
              >
                {description || 'Добавить описание'}
              </p>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}