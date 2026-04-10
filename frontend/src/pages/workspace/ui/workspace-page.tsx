export function WorkspacePage() {
  return (
    <main className="min-h-screen bg-editor-bg-page px-6 py-6 sm:px-8">
      <section className="mx-auto w-full max-w-[1400px] overflow-hidden rounded-xl border border-editor-border-subtle bg-editor-bg-page">
        <header className="flex items-center gap-3 border-b border-editor-border-subtle px-4 py-4">
          <span className="inline-flex h-4 w-4 items-center justify-center text-editor-brand">◈</span>
          <div className="flex flex-col">
            <h1 className="text-sm leading-5 text-editor-text-primary">Новая страница</h1>
            <p className="text-sm leading-5 text-editor-text-tertiary">Добавить описание</p>
          </div>
        </header>

        <div className="flex h-10 items-center gap-4 border-b border-editor-border-subtle bg-editor-bg-toolbar px-4 text-editor-icon">
          <span className="text-sm">↶</span>
          <span className="text-sm">↷</span>
          <div className="h-4 w-px bg-editor-border-subtle" />
          <div className="flex items-center gap-1">
            <button className="h-6 min-w-6 rounded-l-md border border-editor-border-control bg-editor-bg-control px-1 text-xs font-semibold">
              B
            </button>
            <button className="h-6 min-w-6 border-y border-editor-border-control bg-editor-bg-control px-1 text-xs italic">
              T
            </button>
            <button className="h-6 min-w-6 border-y border-editor-border-control bg-editor-bg-control px-1 text-xs underline">
              U
            </button>
            <button className="h-6 min-w-6 rounded-r-md border border-editor-border-control bg-editor-bg-control px-1 text-xs">
              H1
            </button>
          </div>
        </div>

        <div className="px-6 py-14 sm:px-10">
          <div className="mx-auto max-w-[700px]">
            <h2 className="text-4xl leading-10 font-medium text-editor-text-primary">Новая страница</h2>
            <p className="mt-6 text-sm leading-5 text-editor-text-tertiary">
              Начните вводить содержимое или нажмите / чтобы использовать команды
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
