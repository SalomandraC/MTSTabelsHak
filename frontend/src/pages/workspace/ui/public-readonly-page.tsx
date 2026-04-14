import { useEffect, useMemo, useState } from 'react';
import type { Content } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import { createPageEditorExtensions } from '../../../features/page-editor/model/editor-config';
import { wikiliveApi, type WikiPage } from '../../../shared/api/wikilive';
import { readWorkspaceRoute } from '../../../shared/lib/workspace-route';

function ReadOnlyDocument({ page }: { page: WikiPage }) {
  const content = useMemo<Content>(() => {
    return (page.document ?? { type: 'doc', content: [] }) as Content;
  }, [page.document]);

  const editor = useEditor({
    extensions: createPageEditorExtensions(),
    content,
    editable: false,
    editorProps: {
      attributes: {
        class: 'tiptap h-full min-h-full',
      },
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.commands.setContent(content);
  }, [content, editor]);

  return <EditorContent editor={editor} className="h-full min-h-full px-6 py-8" />;
}

export function PublicReadOnlyPage() {
  const route = useMemo(() => readWorkspaceRoute(), []);
  const [page, setPage] = useState<WikiPage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!route.pageId) {
      setError('Страница для read-only ссылки не указана');
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError('');

    void wikiliveApi
      .getPage(route.pageId, { readOnlyLink: true })
      .then((response) => {
        if (!cancelled) {
          setPage(response.page);
        }
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : 'Не удалось загрузить страницу');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [route.pageId]);

  return (
    <main className="min-h-screen bg-white text-editor-text-primary">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="rounded-xl border border-[#ffd2d9] bg-[#ffe4ea] px-4 py-2 text-sm text-[#b00025]">
          Режим только чтения по публичной ссылке. Для полноценного просмотра зарегистрируйтесь в системе.
        </div>
      </div>
      {isLoading ? (
        <div className="mx-auto max-w-5xl px-4 pb-8 text-sm text-editor-text-tertiary">Открываем страницу...</div>
      ) : null}
      {error ? (
        <div className="mx-auto max-w-5xl px-4 pb-8 text-sm text-[#b00025]">{error}</div>
      ) : null}
      {page && !isLoading && !error ? (
        <section className="mx-auto max-w-5xl rounded-2xl border border-[#ffd2d9] bg-white shadow-sm">
          <header className="border-b border-[#ffdfe4] bg-[#fff3f5] px-6 py-4">
            <h1 className="text-xl font-semibold text-[#1f1f1f]">{page.title}</h1>
          </header>
          <div className="min-h-[50vh]">
            <ReadOnlyDocument page={page} />
          </div>
        </section>
      ) : null}
    </main>
  );
}
