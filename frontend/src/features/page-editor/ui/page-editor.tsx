import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import Underline from '@tiptap/extension-underline';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useMemo, useRef, useState } from 'react';

import { SlashMenu } from '../../slash-menu';
import type { SlashMenuItem } from '../../slash-menu';
import type { PageEditorSlashCommandItem } from '../model/slash-command-items';
import { slashCommandItems } from '../model/slash-command-items';
import { PageEditorHeader } from './page-editor-header';
import { PageLinkModal } from './page-link-modal';
import { PageEditorToolbar } from './page-editor-toolbar';

type SlashState = {
  isOpen: boolean;
  query: string;
  from: number;
  to: number;
  top: number;
  left: number;
};

type ModalPosition = {
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
  return /^[\p{L}\p{N}_-]*$/u.test(query);
}

export function PageEditor() {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [slashState, setSlashState] = useState<SlashState>(baseSlashState);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [title, setTitle] = useState('Новая страница');
  const [description, setDescription] = useState('Добавить описание');
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [linkText, setLinkText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [openInNewTab, setOpenInNewTab] = useState(false);
  const [isEditingExistingLink, setIsEditingExistingLink] = useState(false);
  const [linkModalPosition, setLinkModalPosition] = useState<ModalPosition>({ top: 80, left: 80 });

  const editor = useEditor({
    extensions: [
      TextStyle,
      Link.configure({
        openOnClick: false,
        autolink: true,
      }),
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
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

  useEffect(() => {
    try {
      const storedTitle = localStorage.getItem('page:meta:title');
      const storedDesc = localStorage.getItem('page:meta:description');

      if (storedTitle) setTitle(storedTitle);
      if (storedDesc) setDescription(storedDesc);
    } catch (e) {
      // ignore storage errors
    }
  }, []);

  const handleSaveMeta = (newTitle: string, newDescription: string) => {
    setTitle(newTitle);
    setDescription(newDescription);
    try {
      localStorage.setItem('page:meta:title', newTitle);
      localStorage.setItem('page:meta:description', newDescription);
    } catch (e) {
      // ignore
    }
  };

  const filteredItems = useMemo(() => {
    if (!slashState.query) {
      return slashCommandItems;
    }

    const normalized = slashState.query.toLowerCase().trim();

    return slashCommandItems.filter((item) => {
      return (
        item.label.toLowerCase().includes(normalized) ||
        item.keywords.some((keyword) => keyword.toLowerCase().includes(normalized))
      );
    });
  }, [slashState.query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [slashState.query, slashState.isOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isLinkModalOpen && event.key === 'Escape') {
        event.preventDefault();
        setIsLinkModalOpen(false);
        return;
      }

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
  }, [editor, filteredItems, isLinkModalOpen, selectedIndex, slashState.isOpen]);

  const normalizeUrl = (rawUrl: string) => {
    const trimmed = rawUrl.trim();
    if (!trimmed) {
      return '';
    }

    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }

    return `https://${trimmed}`;
  };

  const openLinkModal = (position?: ModalPosition) => {
    if (!editor) {
      return;
    }

    const modalWidth = 424;
    const modalHeight = 240;
    const baseLeft = position?.left ?? 80;
    const baseTop = position?.top ?? 80;
    const clampedLeft = Math.max(8, Math.min(baseLeft, window.innerWidth - modalWidth - 8));
    const clampedTop = Math.max(8, Math.min(baseTop, window.innerHeight - modalHeight - 8));

    const selectedText = editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, ' ');
    const currentHref = ((editor.getAttributes('link').href as string | undefined) ?? '').trim();
    const isExisting = editor.isActive('link') && Boolean(currentHref);
    setIsEditingExistingLink(isExisting);
    setLinkText(selectedText || currentHref);
    setLinkUrl(currentHref);
    setOpenInNewTab(false);
    setLinkModalPosition({ top: clampedTop, left: clampedLeft });
    setIsLinkModalOpen(true);
  };

  const handleInsertLink = () => {
    if (!editor) {
      return;
    }

    const href = normalizeUrl(linkUrl);
    if (!href) {
      return;
    }

    const target = openInNewTab ? '_blank' : null;
    const rel = openInNewTab ? 'noopener noreferrer' : null;

    if (linkText.trim()) {
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'text',
          text: linkText.trim(),
          marks: [{ type: 'link', attrs: { href, target, rel } }],
        })
        .run();
    } else {
      editor.chain().focus().setLink({ href, target, rel }).run();
    }

    setIsLinkModalOpen(false);
    setLinkText('');
    setLinkUrl('');
    setOpenInNewTab(false);
    setIsEditingExistingLink(false);
  };

  const handleDeleteLink = () => {
    if (!editor) {
      return;
    }

    editor.chain().focus().unsetLink().run();
    setIsLinkModalOpen(false);
    setLinkText('');
    setLinkUrl('');
    setOpenInNewTab(false);
    setIsEditingExistingLink(false);
  };

  const applySlashItem = (item: PageEditorSlashCommandItem | SlashMenuItem) => {
    if (!editor || !('run' in item)) {
      return;
    }

    editor.chain().focus().deleteRange({ from: slashState.from, to: slashState.to }).run();

    if (item.id === 'link') {
      const modalAnchor = { top: slashState.top, left: slashState.left };
      setSlashState(baseSlashState);
      openLinkModal(modalAnchor);
      return;
    }

    item.run(editor);
    setSlashState(baseSlashState);
  };

  return (
    <main className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_top_left,#f5f8ff_0%,#ffffff_32%,#ffffff_100%)] px-3 py-3 sm:px-6 sm:py-6">
      <section className="mx-auto flex min-h-[calc(100vh-1.5rem)] w-full max-w-[1400px] flex-1 flex-col overflow-hidden rounded-[14px] border border-editor-border-subtle bg-editor-bg-page shadow-[0_6px_24px_rgba(17,25,40,0.05)] sm:min-h-[calc(100vh-3rem)]">
        <PageEditorHeader title={title} description={description} onSave={handleSaveMeta} />
        <PageEditorToolbar editor={editor} onOpenLinkModal={openLinkModal} />

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
          <PageLinkModal
            isOpen={isLinkModalOpen}
            position={linkModalPosition}
            linkText={linkText}
            url={linkUrl}
            openInNewTab={openInNewTab}
            isExistingLink={isEditingExistingLink}
            onLinkTextChange={setLinkText}
            onUrlChange={setLinkUrl}
            onOpenInNewTabChange={setOpenInNewTab}
            onSubmit={handleInsertLink}
            onDeleteLink={handleDeleteLink}
            onClose={() => setIsLinkModalOpen(false)}
          />
        </div>
      </section>
    </main>
  );
}
