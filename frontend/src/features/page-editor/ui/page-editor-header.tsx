type PageEditorHeaderProps = {
  title: string;
  description: string;
};

export function PageEditorHeader({ title, description }: PageEditorHeaderProps) {
  return (
    <header className="flex items-center gap-3 border-b border-editor-border-subtle bg-editor-bg-page px-3 py-3 sm:px-4 sm:py-4">
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-editor-border-control bg-editor-bg-control text-[0.65rem] font-semibold text-editor-brand">
        []
      </span>
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-wide text-sm leading-5 text-editor-text-primary">{title}</h1>
        <p className="truncate text-sm leading-5 text-editor-text-tertiary">{description}</p>
      </div>
    </header>
  );
}
