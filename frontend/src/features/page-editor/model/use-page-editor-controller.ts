import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { HocuspocusProvider } from '@hocuspocus/provider';
import type { Content } from '@tiptap/core';
import { useEditor } from '@tiptap/react';
import * as Y from 'yjs';

import {
  getCurrentUser,
  type PageSummary,
  type PresenceUser,
  type WikiPage,
  wikiliveApi,
} from '../../../shared/api/wikilive';
import { createWikiTableEmbed, createWikiTableEmbedNode, type WikiTableSelection } from '../../wiki-tables';
import type { SlashMenuItem } from '../../slash-menu';
import { createPageEditorExtensions, initialContent } from './editor-config';
import { formatFileSize, readFileAsDataUrl, validateImageFile } from './image-utils';
import type { PageEditorSlashCommandItem } from './slash-command-items';
import { getSlashCommandItems } from './slash-command-items';
import { base64ToBytes, bytesToBase64, readStoredDraft, writeStoredDraft } from './yjs-utils';
import { usePlugins } from '../../plugins';

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

type CollabState = {
  pageId: string;
  ydoc: Y.Doc;
  provider: HocuspocusProvider;
  shouldSeedContent: boolean;
  recoveryMessage: string;
  activeUsers: PresenceUser[];
};

type UsePageEditorControllerOptions = {
  spaceId: string;
  page: WikiPage | null;
  canEdit: boolean;
  onRenamePage: (title: string) => Promise<void>;
  onCheckpoint: () => Promise<void>;
  onOpenCommentThread?: (threadId: string) => void;
  isAiSlashEnabled: boolean;
  isAiGhostEnabled: boolean;
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

function getPersistentId(key: string, fallbackPrefix: string) {
  try {
    const existing = localStorage.getItem(key);

    if (existing) {
      return existing;
    }

    const created = `${fallbackPrefix}-${crypto.randomUUID()}`;
    localStorage.setItem(key, created);
    return created;
  } catch {
    return `${fallbackPrefix}-${Math.random().toString(16).slice(2)}`;
  }
}

const collaborationColors = ['#ff0037', '#111827', '#b00025', '#505762', '#df0030'];

function getCollaborationColor(seed: string) {
  let hash = 0;

  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) % collaborationColors.length;
  }

  return collaborationColors[Math.abs(hash) % collaborationColors.length];
}

function getProviderUsers(provider: HocuspocusProvider): PresenceUser[] {
  const awareness = (provider as unknown as { awareness?: { getStates?: () => Map<number, { user?: { id?: string; name?: string; color?: string } }> } }).awareness;
  const states = awareness?.getStates?.();

  if (!states) {
    return [];
  }

  const users = new Map<string, PresenceUser>();

  states.forEach((state, clientId) => {
    const displayName = state.user?.name;

    if (!displayName) {
      return;
    }

    const userId = state.user?.id ?? `${displayName}-${clientId}`;
    users.set(userId, {
      userId,
      displayName,
      color: state.user?.color ?? getCollaborationColor(userId),
    });
  });

  return [...users.values()];
}

function getEditorMarkdown(editor: NonNullable<ReturnType<typeof useEditor>>): string {
  const markdownStorage = (editor.storage as { markdown?: { getMarkdown?: () => string } }).markdown;

  if (markdownStorage?.getMarkdown) {
    return markdownStorage.getMarkdown();
  }

  return editor.getText();
}

function normalizeTemplateKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || `template_${Math.random().toString(16).slice(2, 8)}`;
}

export function usePageEditorController({
  spaceId,
  page,
  canEdit,
  onRenamePage,
  onCheckpoint,
  onOpenCommentThread,
  isAiSlashEnabled,
  isAiGhostEnabled,
}: UsePageEditorControllerOptions) {
  const { items: plugins } = usePlugins();
  const [slashState, setSlashState] = useState<SlashState>(baseSlashState);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [saveStatus, setSaveStatus] = useState('Ожидаем страницу');
  const [connectionStatus, setConnectionStatus] = useState('offline');
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [activeUsers, setActiveUsers] = useState<PresenceUser[]>([]);

  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [linkText, setLinkText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [openInNewTab, setOpenInNewTab] = useState(false);
  const [isEditingExistingLink, setIsEditingExistingLink] = useState(false);
  const [linkModalPosition, setLinkModalPosition] = useState<ModalPosition>({ top: 80, left: 80 });

  const [isImageModalOpen, setIsImageModalOpen] = useState(false);

  const [isIframeModalOpen, setIsIframeModalOpen] = useState(false);
  const [iframeUrl, setIframeUrl] = useState('');
  const [imageErrorMessage, setImageErrorMessage] = useState('');
  const [imageFileName, setImageFileName] = useState('');
  const [imageFileSizeLabel, setImageFileSizeLabel] = useState('');
  const [imagePreviewSrc, setImagePreviewSrc] = useState('');

  const [isPagePickerOpen, setIsPagePickerOpen] = useState(false);
  const [isTablePickerOpen, setIsTablePickerOpen] = useState(false);
  const [isTemplateVariableModalOpen, setIsTemplateVariableModalOpen] = useState(false);
  const [templateVariableLabel, setTemplateVariableLabel] = useState('');
  const [templateVariableDescription, setTemplateVariableDescription] = useState('');
  const [collabState, setCollabState] = useState<CollabState | null>(null);

  const slashStateRef = useRef(baseSlashState);
  const selectedIndexRef = useRef(0);

  const currentUser = getCurrentUser();
  const userDisplayName = currentUser?.displayName ?? 'WikiLive User';
  const userId = currentUser?.userId ?? userDisplayName;
  const userColor = getCollaborationColor(userId);

  useEffect(() => {
    if (!page) {
      setCollabState(null);
      setSaveStatus('Ожидаем страницу');
      setConnectionStatus('offline');
      setRecoveryMessage('');
      setActiveUsers([]);
      return;
    }

    let cancelled = false;
    let provider: HocuspocusProvider | null = null;
    let ydoc: Y.Doc | null = null;
    let cleanupAwareness: (() => void) | null = null;

    setSaveStatus(canEdit ? 'Открываем collaboration session' : 'Открываем read-only session');
    setConnectionStatus('connecting');
    setRecoveryMessage('');

    void (async () => {
      const draft = readStoredDraft(page.id);
      const session = await wikiliveApi.openCollabSession(page.id, {
        clientId: getPersistentId('wikilive:client-id', 'client'),
        deviceId: getPersistentId('wikilive:device-id', 'device'),
        localDraftAvailable: Boolean(draft),
        lastCheckpointId: page.documentState?.checkpointId ?? null,
        knownServerVersion: page.documentState?.serverVersion ?? null,
      });

      if (cancelled) {
        return;
      }

      ydoc = new Y.Doc();
      const serverState = session.documentState ?? page.documentState;

      if (serverState?.value) {
        Y.applyUpdate(ydoc, base64ToBytes(serverState.value));
      }

      const serverPersistedAt = serverState?.persistedAt ? new Date(serverState.persistedAt).getTime() : 0;
      let restoredDraft = '';

      if (draft && new Date(draft.updatedAt).getTime() > serverPersistedAt) {
        Y.applyUpdate(ydoc, base64ToBytes(draft.value));
        restoredDraft = 'Восстановлен локальный черновик из браузера';
      }

      provider = new HocuspocusProvider({
        url: session.websocket.url,
        name: session.websocket.documentName ?? page.id,
        token: session.websocket.token,
        document: ydoc,
      });

      if (cancelled) {
        provider.destroy();
        ydoc.destroy();
        return;
      }

      provider.on('status', ({ status }: { status: string }) => {
        if (!cancelled) {
          setConnectionStatus(status === 'connected' ? 'online' : status);
        }
      });

      const updateActiveUsers = () => {
        if (!provider || cancelled) {
          return;
        }

        const providerUsers = getProviderUsers(provider);
        setActiveUsers(providerUsers.length > 0 ? providerUsers : session.awareness?.activeUsers ?? []);
      };

      provider.awareness?.on('update', updateActiveUsers);
      cleanupAwareness = () => provider?.awareness?.off('update', updateActiveUsers);
      updateActiveUsers();

      setCollabState({
        pageId: page.id,
        ydoc,
        provider,
        shouldSeedContent: !serverState?.serverVersion && !draft,
        recoveryMessage: restoredDraft,
        activeUsers: session.awareness?.activeUsers ?? [],
      });
      setRecoveryMessage(restoredDraft);
      setSaveStatus('Документ подключен');
    })().catch((error) => {
      if (!cancelled) {
        setSaveStatus(error instanceof Error ? error.message : 'Не удалось подключить collaboration session');
        setConnectionStatus('error');
      }
    });

    return () => {
      cancelled = true;
      cleanupAwareness?.();
      provider?.destroy();
      ydoc?.destroy();
    };
    // Recreate the provider only when the active page identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page?.id, userDisplayName]);

  const extensions = useMemo(
    () =>
      createPageEditorExtensions({
        ydoc: collabState?.ydoc,
        provider: collabState?.provider,
        enableGhostText: isAiGhostEnabled,
        requestAutocomplete: async (currentText: string) => {
          const globalFlags = window as unknown as { __wikiliveCopilotOpen?: boolean };
          if (globalFlags.__wikiliveCopilotOpen) {
            return '';
          }

          if (!isAiGhostEnabled) {
            return '';
          }

          const response = await wikiliveApi.aiAutocomplete({
            currentText,
            pageTitle: page?.title,
            pageSnapshot: {
              markdown: currentText,
            },
          });

          return response.text;
        },
        user: {
          id: userId,
          name: userDisplayName,
          color: userColor,
        },
        onOpenCommentThread,
      }),
    [
      collabState?.provider,
      collabState?.ydoc,
      isAiGhostEnabled,
      onOpenCommentThread,
      page?.title,
      userColor,
      userDisplayName,
      userId,
    ],
  );

  const resetImageModalState = () => {
    setImageErrorMessage('');
    setImageFileName('');
    setImageFileSizeLabel('');
    setImagePreviewSrc('');
  };

  const openImageModal = (_position?: ModalPosition, initialError = '') => {
    resetImageModalState();
    setImageErrorMessage(initialError);
    setIsImageModalOpen(true);
  };

  const closeImageModal = useCallback(() => {
    setIsImageModalOpen(false);
    setImageErrorMessage('');
    setImageFileName('');
    setImageFileSizeLabel('');
    setImagePreviewSrc('');
  }, []);

  const openIframeModal = () => {
    setIframeUrl('');
    setIsIframeModalOpen(true);
  };

  const closeIframeModal = useCallback(() => {
    setIsIframeModalOpen(false);
    setIframeUrl('');
  }, []);

  const getCurrentDocumentStateValue = useCallback(() => {
    if (!collabState) {
      return null;
    }

    return bytesToBase64(Y.encodeStateAsUpdate(collabState.ydoc));
  }, [collabState]);

  const applyDocumentStateValue = useCallback((value: string) => {
    if (!collabState) {
      return false;
    }

    const nextDocument = new Y.Doc();
    Y.applyUpdate(nextDocument, base64ToBytes(value));

    const currentFragment = collabState.ydoc.getXmlFragment('default');
    const nextFragment = nextDocument.getXmlFragment('default');
    const clonedChildren = nextFragment
      .toArray()
      .filter((child): child is Y.XmlElement | Y.XmlText => child instanceof Y.XmlElement || child instanceof Y.XmlText)
      .map((child) => child.clone());

    collabState.ydoc.transact(() => {
      if (currentFragment.length > 0) {
        currentFragment.delete(0, currentFragment.length);
      }

      if (clonedChildren.length > 0) {
        currentFragment.insert(0, clonedChildren);
      }
    }, 'history-restore');

    nextDocument.destroy();
    return true;
  }, [collabState]);

  const editor = useEditor(
    {
      extensions,
      content: collabState ? undefined : initialContent,
      editable: canEdit,
      editorProps: {
        attributes: {
          class: 'tiptap h-full min-h-full',
          spellcheck: 'false',
          autocorrect: 'off',
          autocapitalize: 'off',
          autocomplete: 'off',
          writingsuggestions: 'false',
          translate: 'no',
          'data-gramm': 'false',
          'data-gramm_editor': 'false',
          'data-enable-grammarly': 'false',
          'data-lt-active': 'false',
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
      onCreate: ({ editor: currentEditor }) => {
        if (collabState?.shouldSeedContent && currentEditor.isEmpty) {
          currentEditor.commands.setContent(initialContent);
        }
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
    },
    [extensions, collabState?.pageId],
  );

  useEffect(() => {
    if (!collabState || !canEdit) {
      return;
    }

    let checkpointTimer: number | null = null;

    const writeDraftAndScheduleCheckpoint = () => {
      const value = bytesToBase64(Y.encodeStateAsUpdate(collabState.ydoc));
      writeStoredDraft(collabState.pageId, {
        value,
        updatedAt: new Date().toISOString(),
        checkpointId: page?.documentState?.checkpointId ?? null,
        serverVersion: page?.documentState?.serverVersion ?? 0,
      });
      setSaveStatus('Черновик сохранен локально');

      if (checkpointTimer) {
        window.clearTimeout(checkpointTimer);
      }

      checkpointTimer = window.setTimeout(() => {
        void wikiliveApi
          .createCheckpoint(collabState.pageId, value, 'editor-idle')
          .then(async () => {
            setSaveStatus('Синхронизировано с backend');
            await onCheckpoint();
          })
          .catch((error) => {
            setSaveStatus(error instanceof Error ? `Backend sync error: ${error.message}` : 'Backend sync error');
          });
      }, 1800);
    };

    collabState.ydoc.on('update', writeDraftAndScheduleCheckpoint);

    return () => {
      collabState.ydoc.off('update', writeDraftAndScheduleCheckpoint);
      if (checkpointTimer) {
        window.clearTimeout(checkpointTimer);
      }
    };
  }, [canEdit, collabState, onCheckpoint, page?.documentState?.checkpointId, page?.documentState?.serverVersion]);

  const handleSaveMeta = (newTitle: string) => {
    if (!canEdit) {
      return;
    }

    void onRenamePage(newTitle).catch((error) => {
      setSaveStatus(error instanceof Error ? error.message : 'Не удалось переименовать страницу');
    });
  };

  const slashItems = useMemo(() => getSlashCommandItems(plugins), [plugins]);

  const filteredItems = useMemo(() => {
    const availableItems = isAiSlashEnabled
      ? slashItems
      : slashItems.filter((item) => item.id !== 'ai-generate');

    if (!slashState.query) {
      return availableItems;
    }

    const normalized = slashState.query.toLowerCase().trim();

    return availableItems.filter((item) => {
      return (
        item.label.toLowerCase().includes(normalized) ||
        item.keywords.some((keyword) => keyword.toLowerCase().includes(normalized))
      );
    });
  }, [isAiSlashEnabled, slashState.query, slashItems]);

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
    if (!editor || !canEdit) {
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
    if (!editor || !canEdit) {
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
    if (!editor || !canEdit) {
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
    if (!editor || !imagePreviewSrc || !canEdit) {
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

  const handleConfirmIframe = () => {
    if (!editor || !iframeUrl.trim()) return;

    const normalizedUrl = iframeUrl.trim().startsWith('http')
      ? iframeUrl.trim()
      : `https://${iframeUrl.trim()}`;

    editor.chain().focus().setIframe({ src: normalizedUrl }).run();
    closeIframeModal();
  };

  const openTemplateVariableModal = (defaultLabel = '', defaultDescription = '') => {
    setTemplateVariableLabel(defaultLabel);
    setTemplateVariableDescription(defaultDescription);
    setIsTemplateVariableModalOpen(true);
  };

  const closeTemplateVariableModal = () => {
    setIsTemplateVariableModalOpen(false);
  };

  const handleInsertTemplateVariable = () => {
    if (!editor || !canEdit) {
      return;
    }

    const label = templateVariableLabel.trim();
    if (!label) {
      return;
    }

    editor.chain().focus().insertTemplateVariable({
      key: normalizeTemplateKey(label),
      label,
      description: templateVariableDescription.trim(),
    }).run();

    closeTemplateVariableModal();
  };

  const deleteSlashRange = () => {
    if (!editor || !slashStateRef.current.isOpen || !canEdit) {
      return;
    }

    editor
      .chain()
      .focus()
      .deleteRange({ from: slashStateRef.current.from, to: slashStateRef.current.to })
      .run();
  };

  const applySlashItem = (item: PageEditorSlashCommandItem | SlashMenuItem) => {
    if (!editor || !('run' in item) || !canEdit) {
      return;
    }

    deleteSlashRange();

    if (item.id === 'link') {
      const modalAnchor = { top: slashState.top, left: slashState.left };
      setSlashState(baseSlashState);
      openLinkModal(modalAnchor);
      return;
    }

    if (item.id === 'page-link') {
      setSlashState(baseSlashState);
      setIsPagePickerOpen(true);
      return;
    }

    if (item.id === 'mws-table') {
      setSlashState(baseSlashState);
      setIsTablePickerOpen(true);
      return;
    }

    if (item.id === 'ai-generate') {
      if (!isAiSlashEnabled) {
        setSlashState(baseSlashState);
        return;
      }

      setSlashState(baseSlashState);

      const prompt = window.prompt('Введите запрос для AI генерации', 'Сформулируй краткий план текущей секции')?.trim();
      if (!prompt) {
        return;
      }

      void wikiliveApi.aiGenerate({
        prompt,
        pageTitle: page?.title,
        pageSnapshot: {
          markdown: editor ? getEditorMarkdown(editor) : page?.plainTextPreview ?? '',
        },
      }).then((response) => {
        const generatedContent = response.document?.content;

        if (Array.isArray(generatedContent) && generatedContent.length > 0) {
          editor.chain().focus().insertContent(generatedContent as Content).run();
          return;
        }

        editor.chain().focus().insertContent(response.document as Content).run();
      }).catch((error) => {
        setSaveStatus(error instanceof Error ? `AI generate error: ${error.message}` : 'AI generate error');
      });

      return;
    }

    if (item.id === 'template-variable') {
      setSlashState(baseSlashState);
      openTemplateVariableModal('', '');
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

  const handleSelectPage = (selectedPage: PageSummary) => {
    if (!editor || !canEdit) {
      return;
    }

    editor.chain().focus().insertPageLink({ pageId: selectedPage.id, title: selectedPage.title }).run();
    setIsPagePickerOpen(false);
  };

  const handleSelectTable = (table: WikiTableSelection) => {
    if (!editor || !canEdit) {
      return;
    }

    const embed = createWikiTableEmbed({
      blockId: crypto.randomUUID(),
      title: table.title,
      spaceId: table.spaceId,
      nodeId: table.nodeId,
      datasheetId: table.datasheetId,
      viewId: table.viewId,
      displayMode: 'table',
      selectedFieldIds: table.selectedFieldIds,
      filterByFormula: null,
      pageSize: table.pageSize,
      allowInlineEdit: table.allowInlineEdit,
    });
    const attrs = embed.toJson();

    const inserted = editor.chain().focus().insertMwsTableEmbed(attrs).run();

    if (!inserted) {
      editor.chain().focus().insertContent({
        type: 'rootblock',
        content: [createWikiTableEmbedNode(attrs)],
      }).run();
    }

    const { selection } = editor.state;
    const { $from } = selection;
    let rootBlockDepth = -1;

    for (let depth = $from.depth; depth > 0; depth -= 1) {
      if ($from.node(depth).type.name === 'rootblock') {
        rootBlockDepth = depth;
        break;
      }
    }

    if (rootBlockDepth >= 0) {
      const rootBlockStart = $from.start(rootBlockDepth);
      const rootBlockEnd = $from.after(rootBlockDepth);
      const docSize = editor.state.doc.content.size;
      const shouldInsertAbove = rootBlockStart === 1;
      const shouldInsertBelow = rootBlockEnd === docSize;

      if (shouldInsertBelow) {
        editor.chain().focus().setTextSelection(rootBlockEnd).insertRootBlock().run();
      }

      if (shouldInsertAbove) {
        editor.chain().focus().setTextSelection(rootBlockStart).insertRootBlock().run();
      }
    } else {
      editor.commands.insertRootBlock();
    }

    setIsTablePickerOpen(false);
  };

  const applySlashItemRef = useRef(applySlashItem);

  useEffect(() => {
    applySlashItemRef.current = applySlashItem;
  });

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

      if (isTemplateVariableModalOpen && event.key === 'Escape') {
        event.preventDefault();
        closeTemplateVariableModal();
        return;
      }

      if (!slashStateRef.current.isOpen || !editor || !canEdit) {
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
  }, [canEdit, closeImageModal, editor, isImageModalOpen, isLinkModalOpen, isTemplateVariableModalOpen]);

  return {
    editor,
    title: page?.title ?? 'Новая страница',
    description: page?.plainTextPreview || recoveryMessage || saveStatus,
    saveStatus,
    connectionStatus,
    recoveryMessage,
    activeUsers,
    handleSaveMeta,
    slashState,
    selectedIndex,
    setSelectedIndex,
    filteredItems,
    applySlashItem,
    openLinkModal,
    openImageModal,
    openIframeModal,
    pagePicker: {
      isOpen: isPagePickerOpen,
      spaceId,
      currentPageId: page?.id,
      onSelect: handleSelectPage,
      onClose: () => setIsPagePickerOpen(false),
    },
    tablePicker: {
      isOpen: isTablePickerOpen,
      initialSpaceId: spaceId,
      onSelect: handleSelectTable,
      onClose: () => setIsTablePickerOpen(false),
    },
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
    iframeModal: {
      isOpen: isIframeModalOpen,
      url: iframeUrl,
      onUrlChange: setIframeUrl,
      onSubmit: handleConfirmIframe,
      onClose: closeIframeModal,
    },
    templateVariableModal: {
      isOpen: isTemplateVariableModalOpen,
      label: templateVariableLabel,
      description: templateVariableDescription,
      isSubmitDisabled: templateVariableLabel.trim().length === 0,
      onLabelChange: setTemplateVariableLabel,
      onDescriptionChange: setTemplateVariableDescription,
      onSubmit: handleInsertTemplateVariable,
      onClose: closeTemplateVariableModal,
    },
    getCurrentDocumentStateValue,
    applyDocumentStateValue,
  };
}
