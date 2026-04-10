import Placeholder from '@tiptap/extension-placeholder';
import { TextStyle } from '@tiptap/extension-text-style';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useMemo, useRef, useState } from 'react';

import { SlashMenu } from '../../slash-menu';
import type { SlashMenuItem } from '../../slash-menu';
import type { PageEditorSlashCommandItem } from '../model/slash-command-items';
import { slashCommandItems } from '../model/slash-command-items';
import { PageEditorHeader } from './page-editor-header';
import { PageEditorToolbar } from './page-editor-toolbar';

type SlashState = {
  isOpen: boolean;
  query: string;
  from: number;
  to: number;
  top: number;
  left: number;
};

const initialContent = `
<h1>Новая страница</h1>
<p></p>
`;

const baseSlashState: SlashState = {
  isOpen: false,
  query: '',
  from: 0,
  to: 0,
  top: 0,
  left: 0,
};

function isQueryValid(query: string) {
  return /^[a-zA-Z0-9_-]*$/.test(query);
}

export function PageEditor() {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [slashState, setSlashState] = useState<SlashState>(baseSlashState);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const editor = useEditor({
    extensions: [
      TextStyle,
      StarterKit,
      Placeholder.configure({
        emptyEditorClass: 'is-editor-empty',
        placeholder: 'Начните вводить содержимое или нажмите / чтобы использовать команды',
      }),
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class: 'tiptap h-full min-h-full',
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      const selection = currentEditor.state.selection;
      const { from } = selection;
      const textBefore = currentEditor.state.doc.textBetween(selection.$from.start(), from, '\n', '\0');

      const slashIndex = textBefore.lastIndexOf('/');

      if (slashIndex < 0) {
        setSlashState(baseSlashState);
        return;
      }

      const query = textBefore.slice(slashIndex + 1);

      if (!isQueryValid(query)) {
        setSlashState(baseSlashState);
        return;
      }

      const start = from - query.length - 1;
      const coords = currentEditor.view.coordsAtPos(from);
      const menuWidth = 304;
      const menuHeight = 288;
      const left = Math.min(coords.left, Math.max(12, window.innerWidth - menuWidth - 12));
      const top = Math.min(coords.bottom + 8, Math.max(12, window.innerHeight - menuHeight - 12));

      setSlashState({
        isOpen: true,
        query,
        from: start,
        to: from,
        top,
        left,
      });
    },
    onSelectionUpdate: ({ editor: currentEditor }) => {
      if (!currentEditor.isFocused) {
        setSlashState(baseSlashState);
      }
    },
  });

  const filteredItems = useMemo(() => {
    if (!slashState.query) {
      return slashCommandItems;
    }

    const normalized = slashState.query.toLowerCase().trim();

    return slashCommandItems.filter((item) => {
      return (
        item.label.toLowerCase().includes(normalized) ||
        item.keywords.some((keyword) => keyword.includes(normalized))
      );
    });
  }, [slashState.query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [slashState.query, slashState.isOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!slashState.isOpen || !editor) {
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        setSlashState(baseSlashState);
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((current) => (current + 1) % Math.max(filteredItems.length, 1));
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((current) => (current - 1 + Math.max(filteredItems.length, 1)) % Math.max(filteredItems.length, 1));
        return;
      }

      if (event.key === 'Enter' && filteredItems.length > 0) {
        event.preventDefault();
        applySlashItem(filteredItems[selectedIndex]);
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [editor, filteredItems, selectedIndex, slashState.isOpen]);

  const applySlashItem = (item: PageEditorSlashCommandItem | SlashMenuItem) => {
    if (!editor || !('run' in item)) {
      return;
    }

    editor.chain().focus().deleteRange({ from: slashState.from, to: slashState.to }).run();
    item.run(editor);
    setSlashState(baseSlashState);
  };

  return (
    <main className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_top_left,#f5f8ff_0%,#ffffff_32%,#ffffff_100%)] px-3 py-3 sm:px-6 sm:py-6">
      <section className="mx-auto flex min-h-[calc(100vh-1.5rem)] w-full max-w-[1400px] flex-1 flex-col overflow-hidden rounded-[14px] border border-editor-border-subtle bg-editor-bg-page shadow-[0_6px_24px_rgba(17,25,40,0.05)] sm:min-h-[calc(100vh-3rem)]">
        <PageEditorHeader title="Новая страница" description="Добавить описание" />
        <PageEditorToolbar editor={editor} />

        <div ref={wrapperRef} className="relative flex-1 px-2 pb-8 pt-3 sm:px-6 sm:pb-10 sm:pt-5">
          <EditorContent editor={editor} />
          <SlashMenu
            isOpen={slashState.isOpen}
            query={slashState.query}
            items={filteredItems}
            selectedIndex={selectedIndex}
            position={{ top: slashState.top, left: slashState.left }}
            onHover={setSelectedIndex}
            onSelect={applySlashItem}
          />
        </div>
      </section>
    </main>
  );
}
