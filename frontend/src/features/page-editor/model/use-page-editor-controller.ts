import { useEffect, useMemo, useRef, useState } from 'react';

import { useEditor } from '@tiptap/react';

import type { SlashMenuItem } from '../../slash-menu';
import { createPageEditorExtensions, initialContent } from './editor-config';
import { formatFileSize, readFileAsDataUrl, validateImageFile } from './image-utils';
import type { PageEditorSlashCommandItem } from './slash-command-items';
import { slashCommandItems } from './slash-command-items';

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

export function usePageEditorController() {
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

  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [imageErrorMessage, setImageErrorMessage] = useState('');
  const [imageFileName, setImageFileName] = useState('');
  const [imageFileSizeLabel, setImageFileSizeLabel] = useState('');
  const [imagePreviewSrc, setImagePreviewSrc] = useState('');

  const slashStateRef = useRef(baseSlashState);
  const selectedIndexRef = useRef(0);

  const extensions = useMemo(() => createPageEditorExtensions(), []);

  const resetImageModalState = () => {
    setImageErrorMessage('');
    setImageFileName('');
    setImageFileSizeLabel('');
    setImagePreviewSrc('');
  };

  const openImageModal = (position?: ModalPosition, initialError = '') => {
    resetImageModalState();
    setImageErrorMessage(initialError);
    setIsImageModalOpen(true);
  };

  const closeImageModal = () => {
    setIsImageModalOpen(false);
    resetImageModalState();
  };

  const editor = useEditor({
    extensions,
    content: initialContent,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        class: 'tiptap h-full min-h-full',
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) {
          return false;
        }

        const file = event.dataTransfer?.files?.[0];
        if (!file || !file.type.startsWith('image/')) {
          return false;
        }

        event.preventDefault();

        const error = validateImageFile(file);
        if (error) {
            openImageModal(undefined, error);
          return true;
        }

        void (async () => {
          const src = await readFileAsDataUrl(file);
          const target = view.posAtCoords({ left: event.clientX, top: event.clientY });
          const insertPos = target?.pos ?? view.state.selection.from;
          const imageNode = view.state.schema.nodes.image?.create({ src, alt: file.name, title: file.name });

          if (!imageNode) {
            return;
          }

          view.dispatch(view.state.tr.insert(insertPos, imageNode));
        })();

        return true;
      },
      handlePaste: (view, event) => {
        const items = Array.from(event.clipboardData?.items ?? []);
        const imageItem = items.find((item) => item.type.startsWith('image/'));
        const file = imageItem?.getAsFile();

        if (!file) {
          return false;
        }

        event.preventDefault();

        const error = validateImageFile(file);
        if (error) {
            openImageModal(undefined, error);
          return true;
        }

        void (async () => {
          const src = await readFileAsDataUrl(file);
          const imageNode = view.state.schema.nodes.image?.create({ src, alt: file.name, title: file.name });

          if (!imageNode) {
            return;
          }

          view.dispatch(view.state.tr.replaceSelectionWith(imageNode));
        })();

        return true;
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
    } catch {
      // ignore storage errors
    }
  }, []);

  const handleSaveMeta = (newTitle: string, newDescription: string) => {
    setTitle(newTitle);
    setDescription(newDescription);
    try {
      localStorage.setItem('page:meta:title', newTitle);
      localStorage.setItem('page:meta:description', newDescription);
    } catch {
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

  const filteredItemsRef = useRef(filteredItems);

  useEffect(() => {
    slashStateRef.current = slashState;
  }, [slashState]);

  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  useEffect(() => {
    filteredItemsRef.current = filteredItems;
  }, [filteredItems]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [slashState.query, slashState.isOpen]);

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

  const handleSelectImageFile = async (file: File) => {
    const error = validateImageFile(file);
    if (error) {
      setImageErrorMessage(error);
      setImageFileName(file.name);
      setImageFileSizeLabel(formatFileSize(file.size));
      setImagePreviewSrc('');
      return;
    }

    const src = await readFileAsDataUrl(file);
    setImageErrorMessage('');
    setImageFileName(file.name);
    setImageFileSizeLabel(formatFileSize(file.size));
    setImagePreviewSrc(src);
  };

  const handleConfirmImageInsert = () => {
    if (!editor || !imagePreviewSrc) {
      return;
    }

    editor
      .chain()
      .focus()
      .setImage({
        src: imagePreviewSrc,
        alt: imageFileName,
        title: imageFileName,
      })
      .run();

    closeImageModal();
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

    if (item.id === 'image') {
      setSlashState(baseSlashState);
      openImageModal();
      return;
    }

    item.run(editor);
    setSlashState(baseSlashState);
  };

  const applySlashItemRef = useRef(applySlashItem);

  useEffect(() => {
    applySlashItemRef.current = applySlashItem;
  }, [applySlashItem]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isLinkModalOpen && event.key === 'Escape') {
        event.preventDefault();
        setIsLinkModalOpen(false);
        return;
      }

      if (isImageModalOpen && event.key === 'Escape') {
        event.preventDefault();
        closeImageModal();
        return;
      }

      if (!slashStateRef.current.isOpen || !editor) {
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        setSlashState(baseSlashState);
        return;
      }

      if (event.key === 'ArrowDown') {
        if (filteredItemsRef.current.length === 0) {
          return;
        }

        event.preventDefault();
        setSelectedIndex((current) => (current + 1) % filteredItemsRef.current.length);
        return;
      }

      if (event.key === 'ArrowUp') {
        if (filteredItemsRef.current.length === 0) {
          return;
        }

        event.preventDefault();
        setSelectedIndex((current) => (current - 1 + filteredItemsRef.current.length) % filteredItemsRef.current.length);
        return;
      }

      if (event.key === 'ArrowRight' && filteredItemsRef.current.length > 0) {
        event.preventDefault();
        const currentItem = filteredItemsRef.current[selectedIndexRef.current] ?? filteredItemsRef.current[0];

        if (currentItem) {
          applySlashItemRef.current(currentItem);
        }
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setSlashState(baseSlashState);
        return;
      }

      if (event.key === 'Enter' && filteredItemsRef.current.length > 0) {
        event.preventDefault();
        const currentItem = filteredItemsRef.current[selectedIndexRef.current] ?? filteredItemsRef.current[0];

        if (currentItem) {
          applySlashItemRef.current(currentItem);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown, true);

    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [closeImageModal, editor, isImageModalOpen, isLinkModalOpen]);

  return {
    editor,
    title,
    description,
    handleSaveMeta,
    slashState,
    selectedIndex,
    setSelectedIndex,
    filteredItems,
    applySlashItem,
    openLinkModal,
    openImageModal,
    linkModal: {
      isOpen: isLinkModalOpen,
      position: linkModalPosition,
      linkText,
      url: linkUrl,
      openInNewTab,
      isExistingLink: isEditingExistingLink,
      onLinkTextChange: setLinkText,
      onUrlChange: setLinkUrl,
      onOpenInNewTabChange: setOpenInNewTab,
      onSubmit: handleInsertLink,
      onDeleteLink: handleDeleteLink,
      onClose: () => setIsLinkModalOpen(false),
    },
    imageModal: {
      isOpen: isImageModalOpen,
      errorMessage: imageErrorMessage,
      fileName: imageFileName,
      fileSizeLabel: imageFileSizeLabel,
      previewSrc: imagePreviewSrc,
      isConfirmDisabled: !imagePreviewSrc,
      onClose: closeImageModal,
      onFileSelect: handleSelectImageFile,
      onConfirm: handleConfirmImageInsert,
    },
  };
}
