import React from 'react';

type PageEditorHeaderProps = {
  title: string;
  description: string;
  onSave?: (title: string, description: string) => void;
};

export function PageEditorHeader({ title, description, onSave }: PageEditorHeaderProps) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [localTitle, setLocalTitle] = React.useState(title);
  const [localDescription, setLocalDescription] = React.useState(description);

  React.useEffect(() => setLocalTitle(title), [title]);
  React.useEffect(() => setLocalDescription(description), [description]);

  const handleSave = () => {
    onSave?.(localTitle.trim() || 'Новая страница', localDescription.trim() || '');
    setIsEditing(false);
  };

  const handleCancel = () => {
    setLocalTitle(title);
    setLocalDescription(description);
    setIsEditing(false);
  };

  return (
    <header className="flex items-center gap-3 border-b border-editor-border-subtle bg-editor-bg-page px-3 py-3 sm:px-4 sm:py-4">
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-editor-border-control bg-editor-bg-control text-[0.65rem] font-semibold text-editor-brand">
        []
      </span>
      <div className="min-w-0 flex-1">
        {!isEditing ? (
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-wide text-sm leading-5 text-editor-text-primary">{title}</h1>
              <p className="truncate text-sm leading-5 text-editor-text-tertiary">{description}</p>
            </div>
            <button
              onClick={() => setIsEditing(true)}
              className="rounded-md bg-editor-bg-control px-2 py-1 text-sm text-editor-text-primary hover:opacity-90"
              aria-label="Edit page metadata"
            >
              Ред.
            </button>
          </div>
        ) : (
          <div className="flex w-full items-center gap-3">
            <div className="flex-1 min-w-0">
              <input
                value={localTitle}
                onChange={(e) => setLocalTitle(e.target.value)}
                className="w-full rounded-md border border-editor-border-control bg-editor-bg-input px-2 py-1 text-sm font-wide text-editor-text-primary"
                placeholder="Название страницы"
              />
              <input
                value={localDescription}
                onChange={(e) => setLocalDescription(e.target.value)}
                className="mt-1 w-full rounded-md border border-editor-border-control bg-editor-bg-input px-2 py-1 text-sm text-editor-text-tertiary"
                placeholder="Описание (необязательно)"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={handleSave} className="rounded-md bg-editor-brand px-2 py-1 text-sm text-white">
                Сохранить
              </button>
              <button onClick={handleCancel} className="rounded-md border border-editor-border-control px-2 py-1 text-sm">
                Отмена
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
