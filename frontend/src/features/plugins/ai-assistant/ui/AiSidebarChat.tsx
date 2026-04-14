import type { Editor } from '@tiptap/core';
import { ChevronDown, FolderSearch, Search, SendHorizontal, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  type MwsSpace,
  type WorkspaceTreeNode,
  wikiliveApi,
} from '../../../../shared/api/wikilive';
import { getEditorMarkdown } from '../model/editor-markdown';
import { useAiTableContext } from '../model/use-ai-table-context';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};

type AvailableContextPage = {
  id: string;
  title: string;
};

type AvailableContextFolder = {
  id: string;
  title: string;
};

type SelectedContextDocument = {
  pageId: string;
  title: string;
  markdown: string;
  isLoading?: boolean;
};

type SelectedContextFolder = {
  folderId: string;
  title: string;
};

type ContextScope = 'currentFile' | 'documents' | 'folders' | 'space';

type AiSidebarChatProps = {
  pageId: string | null;
  spaceId: string;
  pageTitle?: string;
  editor: Editor | null;
  enabled: boolean;
  onClose: () => void;
  workspaceTree?: WorkspaceTreeNode[];
  availablePages?: AvailableContextPage[];
  availableFolders?: AvailableContextFolder[];
  availableSpaces?: MwsSpace[];
};

const AI_LOADING_PHRASES = [
  'Думаем над ответом',
  'Собираем контекст',
  'Векторизуем данные',
  'Сверяем документы',
  'Проверяем выбранную область',
  'Ищем релевантные фрагменты',
];

function normalizeMarkdownSnippet(text: string, maxLength = 6000) {
  const trimmed = text.trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength)}\n\n[...контекст сокращен...]`;
}

function buildChatContextMarkdown(
  currentTitle: string | undefined,
  currentMarkdown: string,
  extraDocuments: SelectedContextDocument[],
) {
  const sections: string[] = [];

  if (currentMarkdown.trim()) {
    sections.push(`## Текущая страница${currentTitle ? `: ${currentTitle}` : ''}\n\n${normalizeMarkdownSnippet(currentMarkdown)}`);
  }

  extraDocuments.forEach((document) => {
    sections.push(`## Документ${document.title ? `: ${document.title}` : ''}\n\n${normalizeMarkdownSnippet(document.markdown || 'Предпросмотр недоступен')}`);
  });

  return sections.join('\n\n---\n\n');
}

function flattenPagesFromTree(nodes: WorkspaceTreeNode[]): AvailableContextPage[] {
  return nodes.flatMap((node) => [
    ...(node.kind === 'wikiPage' && node.linkedPageId
      ? [{ id: node.linkedPageId, title: node.title }]
      : []),
    ...flattenPagesFromTree(node.children ?? []),
  ]);
}

function flattenFoldersFromTree(nodes: WorkspaceTreeNode[]): AvailableContextFolder[] {
  return nodes.flatMap((node) => [
    ...((node.kind === 'wikiFolder' || node.kind === 'mwsFolder')
      ? [{ id: node.id, title: node.title }]
      : []),
    ...flattenFoldersFromTree(node.children ?? []),
  ]);
}

function summarizeWorkspaceStructure(
  nodes: WorkspaceTreeNode[],
  scope: ContextScope,
  spaceId: string,
  limit = 60,
) {
  const summaryNodes: Array<{
    id: string;
    title: string;
    kind: string;
    parentId: string | null;
    depth: number;
  }> = [];

  const walk = (items: WorkspaceTreeNode[], depth: number) => {
    for (const node of items) {
      if (summaryNodes.length >= limit) {
        return;
      }

      summaryNodes.push({
        id: node.id,
        title: node.title,
        kind: node.kind,
        parentId: node.parentId,
        depth,
      });

      if (node.children?.length) {
        walk(node.children, depth + 1);
      }
    }
  };

  walk(nodes, 0);

  return {
    scope,
    spaceId,
    truncated: summaryNodes.length >= limit,
    nodes: summaryNodes,
  };
}

function filterStructureTreeForIds(
  nodes: WorkspaceTreeNode[],
  options: { folderIds?: Set<string>; pageIds?: Set<string> },
): WorkspaceTreeNode[] {
  return nodes
    .map((node) => {
      const children = filterStructureTreeForIds(node.children ?? [], options);
      const isSelectedFolder = options.folderIds?.has(node.id) ?? false;
      const isSelectedPage = node.linkedPageId ? options.pageIds?.has(node.linkedPageId) ?? false : false;

      if (!isSelectedFolder && !isSelectedPage && children.length === 0) {
        return null;
      }

      return {
        ...node,
        children,
      };
    })
    .filter((node): node is WorkspaceTreeNode => Boolean(node));
}

function renderInlineMarkdown(text: string, keyPrefix: string) {
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|\*[^*]+\*)/g).filter(Boolean);

  return tokens.map((token, index) => {
    const key = `${keyPrefix}-${index}`;

    if (token.startsWith('**') && token.endsWith('**')) {
      return <strong key={key}>{token.slice(2, -2)}</strong>;
    }

    if (token.startsWith('`') && token.endsWith('`')) {
      return (
        <code key={key} className="rounded bg-[#f3f5f8] px-1.5 py-0.5 font-mono text-[0.95em] text-[#a22a4e]">
          {token.slice(1, -1)}
        </code>
      );
    }

    if (token.startsWith('*') && token.endsWith('*')) {
      return <em key={key}>{token.slice(1, -1)}</em>;
    }

    const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a
          key={key}
          href={linkMatch[2]}
          target="_blank"
          rel="noreferrer"
          className="text-[#3366cc] underline underline-offset-2"
        >
          {linkMatch[1]}
        </a>
      );
    }

    return <span key={key}>{token}</span>;
  });
}

function MarkdownMessage({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.startsWith('```')) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith('```')) {
        codeLines.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push(
        <pre
          key={`code-${blocks.length}`}
          className="overflow-x-auto rounded-xl bg-[#161b22] px-3 py-2 text-[12px] leading-5 text-[#e6edf3]"
        >
          <code>{codeLines.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const Tag = level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3';
      const className =
        level === 1
          ? 'text-base font-semibold'
          : level === 2
            ? 'text-[15px] font-semibold'
            : 'text-sm font-semibold';
      blocks.push(
        <Tag key={`heading-${blocks.length}`} className={className}>
          {renderInlineMarkdown(headingMatch[2], `heading-${blocks.length}`)}
        </Tag>,
      );
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^[-*]\s+/, ''));
        index += 1;
      }
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="list-disc space-y-1 pl-5">
          {items.map((item, itemIndex) => (
            <li key={`ul-item-${itemIndex}`}>{renderInlineMarkdown(item, `ul-${blocks.length}-${itemIndex}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\d+\.\s+/, ''));
        index += 1;
      }
      blocks.push(
        <ol key={`ol-${blocks.length}`} className="list-decimal space-y-1 pl-5">
          {items.map((item, itemIndex) => (
            <li key={`ol-item-${itemIndex}`}>{renderInlineMarkdown(item, `ol-${blocks.length}-${itemIndex}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !lines[index].startsWith('```') &&
      !/^(#{1,3})\s+/.test(lines[index]) &&
      !/^[-*]\s+/.test(lines[index]) &&
      !/^\d+\.\s+/.test(lines[index])
    ) {
      paragraphLines.push(lines[index]);
      index += 1;
    }

    blocks.push(
      <p key={`p-${blocks.length}`} className="whitespace-pre-wrap leading-6">
        {renderInlineMarkdown(paragraphLines.join('\n'), `p-${blocks.length}`)}
      </p>,
    );
  }

  return <div className="space-y-3">{blocks}</div>;
}

function LoadingBubble({ phrase }: { phrase: string }) {
  return (
    <div className="flex w-full justify-start">
      <article className="max-w-[85%] rounded-2xl border border-[#e8ebf2] bg-white px-4 py-3 text-sm text-[#2f3136] shadow-sm">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-editor-text-tertiary">ИИ</p>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#c3cad7]" />
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#c3cad7] [animation-delay:160ms]" />
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#c3cad7] [animation-delay:320ms]" />
          </div>
          <span className="text-[13px] text-[#8a93a3]">{phrase}</span>
        </div>
      </article>
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={['flex w-full', isUser ? 'justify-end' : 'justify-start'].join(' ')}>
      <article
        className={[
          'max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm',
          isUser
            ? 'border border-[#d7e3ff] bg-[#eef3ff] text-[#1f2f55]'
            : 'border border-[#e8ebf2] bg-white text-[#2f3136]',
        ].join(' ')}
      >
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-editor-text-tertiary">
          {isUser ? 'Вы' : 'ИИ'}
        </p>
        {isUser ? <p className="whitespace-pre-wrap leading-5">{message.text}</p> : <MarkdownMessage text={message.text} />}
      </article>
    </div>
  );
}

function ContextChip({
  title,
  loading = false,
  removable = false,
  onRemove,
}: {
  title: string;
  loading?: boolean;
  removable?: boolean;
  onRemove?: () => void;
}) {
  return (
    <div className="inline-flex max-w-full items-center gap-1 rounded-md border border-[#dde3ee] bg-white px-2 py-1 text-left text-[11px] text-[#384154]">
      <span className="min-w-0 max-w-[170px] truncate" title={title}>
        {loading ? `${title}...` : title}
      </span>
      {removable ? (
        <button
          type="button"
          onClick={onRemove}
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-[#d70032] text-white transition-colors hover:bg-[#b00025]"
          aria-label={`Удалить контекст ${title}`}
          title={`Удалить контекст ${title}`}
        >
          <Trash2 size={10} />
        </button>
      ) : null}
    </div>
  );
}

export function AiSidebarChat({
  pageId,
  spaceId,
  pageTitle,
  editor,
  enabled,
  onClose,
  workspaceTree = [],
  availablePages = [],
  availableFolders = [],
  availableSpaces = [],
}: AiSidebarChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedDocuments, setSelectedDocuments] = useState<SelectedContextDocument[]>([]);
  const [selectedFolders, setSelectedFolders] = useState<SelectedContextFolder[]>([]);
  const [contextSpaceId, setContextSpaceId] = useState(spaceId);
  const [contextScope, setContextScope] = useState<ContextScope>('space');
  const [contextTree, setContextTree] = useState<WorkspaceTreeNode[] | null>(null);
  const [isContextTreeLoading, setIsContextTreeLoading] = useState(false);
  const [dragDropHint, setDragDropHint] = useState('');
  const [isContextPickerOpen, setIsContextPickerOpen] = useState(false);
  const [isSourceMenuOpen, setIsSourceMenuOpen] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [loadingPhraseIndex, setLoadingPhraseIndex] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const contextRowRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { handleAiChatResponse } = useAiTableContext();

  const activeTreePages = useMemo(
    () => (contextSpaceId === spaceId ? availablePages : flattenPagesFromTree(contextTree ?? [])),
    [availablePages, contextSpaceId, contextTree, spaceId],
  );

  const activeTreeFolders = useMemo(
    () => (contextSpaceId === spaceId ? availableFolders : flattenFoldersFromTree(contextTree ?? [])),
    [availableFolders, contextSpaceId, contextTree, spaceId],
  );

  const currentSpacePageMap = useMemo(
    () => new Map(availablePages.map((page) => [page.id, page])),
    [availablePages],
  );

  const currentSpaceFolderMap = useMemo(
    () => new Map(availableFolders.map((folder) => [folder.id, folder])),
    [availableFolders],
  );

  const contextPages = useMemo(() => {
    const unique = new Map<string, AvailableContextPage>();

    activeTreePages.forEach((page) => {
      if (page.id && page.title) {
        unique.set(page.id, page);
      }
    });

    if (pageId && contextSpaceId === spaceId) {
      unique.delete(pageId);
    }

    selectedDocuments.forEach((document) => {
      unique.delete(document.pageId);
    });

    return Array.from(unique.values());
  }, [activeTreePages, contextSpaceId, pageId, selectedDocuments, spaceId]);

  const contextFolders = useMemo(() => {
    const unique = new Map<string, AvailableContextFolder>();

    activeTreeFolders.forEach((folder) => {
      if (folder.id && folder.title) {
        unique.set(folder.id, folder);
      }
    });

    selectedFolders.forEach((folder) => {
      unique.delete(folder.folderId);
    });

    return Array.from(unique.values());
  }, [activeTreeFolders, selectedFolders]);

  const filteredContextPages = useMemo(() => {
    const normalizedQuery = pickerQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return contextPages;
    }

    return contextPages.filter((page) => page.title.toLowerCase().includes(normalizedQuery));
  }, [contextPages, pickerQuery]);

  const filteredContextFolders = useMemo(() => {
    const normalizedQuery = pickerQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return contextFolders;
    }

    return contextFolders.filter((folder) => folder.title.toLowerCase().includes(normalizedQuery));
  }, [contextFolders, pickerQuery]);

  const currentMarkdown = useMemo(() => getEditorMarkdown(editor), [editor]);
  const contextSpaces = useMemo(() => {
    const unique = new Map<string, MwsSpace>();

    [{ id: spaceId, name: 'Текущее пространство' }, ...availableSpaces].forEach((space) => {
      if (!space?.id) {
        return;
      }

      unique.set(space.id, {
        id: space.id,
        name: space.id === spaceId ? space.name || 'Текущее пространство' : space.name,
        isAdmin: space.isAdmin,
      });
    });

    return Array.from(unique.values());
  }, [availableSpaces, spaceId]);

  const currentContextSpace = useMemo(
    () => contextSpaces.find((space) => space.id === contextSpaceId) ?? contextSpaces[0] ?? { id: contextSpaceId, name: contextSpaceId },
    [contextSpaceId, contextSpaces],
  );
  const baseStructureTree = useMemo(
    () => (contextSpaceId === spaceId ? workspaceTree : contextTree ?? []),
    [contextSpaceId, contextTree, spaceId, workspaceTree],
  );
  const activeStructureTree = useMemo(() => {
    if (contextScope === 'folders' && selectedFolders.length > 0) {
      return filterStructureTreeForIds(baseStructureTree, {
        folderIds: new Set(selectedFolders.map((folder) => folder.folderId)),
      });
    }

    if (contextScope === 'documents' && selectedDocuments.length > 0) {
      return filterStructureTreeForIds(baseStructureTree, {
        pageIds: new Set(selectedDocuments.map((document) => document.pageId)),
      });
    }

    if (contextScope === 'currentFile' && pageId) {
      return filterStructureTreeForIds(baseStructureTree, {
        pageIds: new Set([pageId]),
      });
    }

    return baseStructureTree;
  }, [baseStructureTree, contextScope, pageId, selectedDocuments, selectedFolders]);
  const workspaceStructureSummary = useMemo(
    () => summarizeWorkspaceStructure(activeStructureTree, contextScope, contextSpaceId),
    [activeStructureTree, contextScope, contextSpaceId],
  );

  const selectedContextPayload = useMemo(
    () =>
      selectedDocuments
        .filter((document) => !document.isLoading)
        .map((document) => ({
          pageId: document.pageId,
          title: document.title,
          markdown: normalizeMarkdownSnippet(document.markdown || 'Предпросмотр недоступен'),
        })),
    [selectedDocuments],
  );

  const activeSelectedDocuments = useMemo(
    () => selectedDocuments.filter((document) => !document.isLoading),
    [selectedDocuments],
  );

  const activeSelectedPageIds = useMemo(() => {
    if (contextScope === 'currentFile') {
      return pageId ? [pageId] : [];
    }

    if (contextScope === 'documents') {
      return activeSelectedDocuments.map((document) => document.pageId);
    }

    return [];
  }, [activeSelectedDocuments, contextScope, pageId]);

  const activeSelectedFolderIds = useMemo(() => {
    if (contextScope !== 'folders') {
      return [];
    }

    return selectedFolders.map((folder) => folder.folderId);
  }, [contextScope, selectedFolders]);

  const markdownContext = useMemo(() => {
    if (contextScope !== 'currentFile') {
      return '';
    }

    return buildChatContextMarkdown(pageTitle, currentMarkdown, []);
  }, [contextScope, currentMarkdown, pageTitle]);

  const hasPendingContext = selectedDocuments.some((document) => document.isLoading);
  const hasSelectedDocumentsScope = activeSelectedPageIds.length > 0;
  const hasSelectedFoldersScope = activeSelectedFolderIds.length > 0;
  const isScopeReady =
    contextScope === 'space' ||
    (contextScope === 'currentFile' && Boolean(pageId)) ||
    (contextScope === 'documents' && hasSelectedDocumentsScope) ||
    (contextScope === 'folders' && hasSelectedFoldersScope);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [errorMessage, isSending, messages, selectedDocuments.length]);

  useEffect(() => {
    if (!isSending) {
      setLoadingPhraseIndex(0);
      return;
    }

    setLoadingPhraseIndex(Math.floor(Math.random() * AI_LOADING_PHRASES.length));
    const interval = window.setInterval(() => {
      setLoadingPhraseIndex((current) => (current + 1) % AI_LOADING_PHRASES.length);
    }, 1600);

    return () => window.clearInterval(interval);
  }, [isSending]);

  useEffect(() => {
    const row = contextRowRef.current;

    if (!row) {
      return;
    }

    row.scrollTo({ left: row.scrollWidth, behavior: 'smooth' });
  }, [selectedDocuments.length, selectedFolders.length, contextScope]);

  useEffect(() => {
    setContextSpaceId(spaceId);
    setSelectedDocuments([]);
    setSelectedFolders([]);
    setContextScope('space');
    setContextTree(null);
    setIsContextPickerOpen(false);
    setIsSourceMenuOpen(false);
    setPickerQuery('');
  }, [spaceId]);

  useEffect(() => {
    if (contextScope === 'currentFile') {
      setContextSpaceId(spaceId);
    }
  }, [contextScope, spaceId]);

  useEffect(() => {
    if (contextScope !== 'documents' && contextScope !== 'folders') {
      setIsContextPickerOpen(false);
    }
    setIsSourceMenuOpen(false);
    setIsAddMenuOpen(false);
    setPickerQuery('');
  }, [contextScope]);

  useEffect(() => {
    if ((contextScope !== 'documents' && contextScope !== 'folders' && contextScope !== 'space') || contextSpaceId === spaceId) {
      setContextTree(null);
      return;
    }

    let cancelled = false;

    const loadContextTree = async () => {
      setIsContextTreeLoading(true);
      try {
        const response = await wikiliveApi.getWorkspaceTree(contextSpaceId);
        if (!cancelled) {
          setContextTree(response.items);
        }
      } catch (error) {
        if (!cancelled) {
          setContextTree([]);
          setErrorMessage(error instanceof Error ? error.message : 'Не удалось загрузить дерево выбранного пространства');
        }
      } finally {
        if (!cancelled) {
          setIsContextTreeLoading(false);
        }
      }
    };

    void loadContextTree();

    return () => {
      cancelled = true;
    };
  }, [contextScope, contextSpaceId, spaceId]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, []);

  const handleStop = () => {
    abortControllerRef.current?.abort();
  };

  const handleAddDocument = async (page: AvailableContextPage) => {
    if (selectedDocuments.some((document) => document.pageId === page.id) || page.id === pageId) {
      return;
    }

    setSelectedDocuments((current) => [
      ...current,
      {
        pageId: page.id,
        title: page.title,
        markdown: '',
        isLoading: true,
      },
    ]);

    try {
      const response = await wikiliveApi.getPage(page.id);
      const markdown = response.page.plainTextPreview?.trim() || 'Предпросмотр недоступен';

      setSelectedDocuments((current) =>
        current.map((document) =>
          document.pageId === page.id ? { ...document, markdown, isLoading: false } : document,
        ),
      );
    } catch (error) {
      const markdown = error instanceof Error ? error.message : 'Не удалось загрузить контекст';

      setSelectedDocuments((current) =>
        current.map((document) =>
          document.pageId === page.id ? { ...document, markdown, isLoading: false } : document,
        ),
      );
    }
  };

  const handleRemoveDocument = (pageIdToRemove: string) => {
    setSelectedDocuments((current) => current.filter((document) => document.pageId !== pageIdToRemove));
  };

  const handleAddFolder = (folder: AvailableContextFolder) => {
    if (selectedFolders.some((current) => current.folderId === folder.id)) {
      return;
    }

    setSelectedFolders((current) => [...current, { folderId: folder.id, title: folder.title }]);
  };

  const handleRemoveFolder = (folderIdToRemove: string) => {
    setSelectedFolders((current) => current.filter((folder) => folder.folderId !== folderIdToRemove));
  };

  const handleToggleDocumentSelection = async (page: AvailableContextPage) => {
    const alreadySelected = selectedDocuments.some((document) => document.pageId === page.id);

    if (alreadySelected) {
      handleRemoveDocument(page.id);
      return;
    }

    await handleAddDocument(page);
  };

  const handleToggleFolderSelection = (folder: AvailableContextFolder) => {
    const alreadySelected = selectedFolders.some((current) => current.folderId === folder.id);

    if (alreadySelected) {
      handleRemoveFolder(folder.id);
      return;
    }

    handleAddFolder(folder);
  };

  const handleDropOnContext = async (event: React.DragEvent<HTMLDivElement>) => {
    const droppedNodeId = event.dataTransfer.getData('application/x-wikilive-node-id');
    if (!droppedNodeId) {
      return;
    }

    event.preventDefault();
    setDragDropHint('');

    const page = currentSpacePageMap.get(droppedNodeId);
    const folder = currentSpaceFolderMap.get(droppedNodeId);

    if (page) {
      setContextScope('documents');
      setContextSpaceId(spaceId);
      await handleAddDocument(page);
      return;
    }

    if (folder) {
      setContextScope('folders');
      setContextSpaceId(spaceId);
      handleAddFolder(folder);
      return;
    }
  };

  const handleSend = async () => {
    const trimmed = draft.trim();
    if (!trimmed || isSending || hasPendingContext) {
      return;
    }

    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', text: trimmed }]);
    setDraft('');
    setErrorMessage('');
    setIsSending(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await wikiliveApi.aiChat({
        question: trimmed,
        spaceId: contextScope === 'currentFile' ? spaceId : contextSpaceId,
        contextScope,
        pageId: contextScope === 'currentFile' ? pageId ?? undefined : undefined,
        pageTitle: contextScope === 'currentFile' ? pageTitle : undefined,
        pageSnapshot:
          contextScope === 'currentFile'
            ? markdownContext
            : undefined,
        selectedPageIds: activeSelectedPageIds,
        selectedFolderIds: activeSelectedFolderIds,
        contextDocuments:
          contextScope === 'documents'
            ? selectedContextPayload
            : [],
        workspaceStructure: workspaceStructureSummary,
        useVectorSearch: true,
        intent: 'chat',
      }, {
        signal: controller.signal,
      });

      handleAiChatResponse(response);

      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', text: response.answer }]);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        setErrorMessage('Генерация остановлена');
      } else {
        setErrorMessage(error instanceof Error ? error.message : 'Не удалось получить ответ ИИ');
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setIsSending(false);
    }
  };

  const contextSummary =
    contextScope === 'currentFile'
      ? pageTitle ?? 'Текущий документ'
      : contextScope === 'documents'
        ? selectedDocuments.length > 0
          ? `Документы (${selectedDocuments.length})`
          : 'Документы'
        : contextScope === 'folders'
          ? selectedFolders.length > 0
            ? `Папки (${selectedFolders.length})`
            : 'Папки'
          : currentContextSpace.name;

  const handleContextSourceChange = (value: string) => {
    setIsContextPickerOpen(false);
    setIsSourceMenuOpen(false);
    setIsAddMenuOpen(false);
    setPickerQuery('');

    if (value.startsWith('space:')) {
      const nextSpaceId = value.slice('space:'.length) || spaceId;
      setContextScope('space');
      setContextSpaceId(nextSpaceId);
      setSelectedDocuments([]);
      setSelectedFolders([]);
      return;
    }

    const nextScope = value as ContextScope;
    setContextScope(nextScope);
    setIsContextPickerOpen(nextScope === 'documents' || nextScope === 'folders');

    if (nextScope === 'currentFile') {
      setContextSpaceId(spaceId);
    }

    if (nextScope !== 'documents') {
      setSelectedDocuments([]);
    }

    if (nextScope !== 'folders') {
      setSelectedFolders([]);
    }
  };

  const handleOpenAddContext = (targetScope?: 'documents' | 'folders') => {
    setIsSourceMenuOpen(false);
    setIsAddMenuOpen(false);

    if (targetScope) {
      setContextScope(targetScope);
      setIsContextPickerOpen(true);
      return;
    }

    if (contextScope !== 'documents' && contextScope !== 'folders') {
      setContextScope('documents');
    }

    setIsContextPickerOpen((current) => !current);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white text-editor-text-primary">
      <header className="border-b border-editor-border-subtle px-6 py-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[#1d2023]">ИИ-ассистент</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#505762] hover:bg-[#f0f1f3]"
            aria-label="Закрыть чат ассистента"
          >
            <X size={16} />
          </button>
        </div>
      </header>
      {enabled ? (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto bg-[#fafbfd] px-4 py-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <div className="space-y-3">
              {messages.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-editor-border-subtle bg-white px-4 py-6 text-sm text-editor-text-tertiary">
                  Спросите ИИ о текущей странице или добавьте другой документ для сравнения.
                </div>
              ) : null}

              {messages.map((message) => (
                <ChatBubble key={message.id} message={message} />
              ))}

              {isSending ? <LoadingBubble phrase={AI_LOADING_PHRASES[loadingPhraseIndex] ?? AI_LOADING_PHRASES[0]} /> : null}

              <div ref={bottomRef} />
            </div>
          </div>

          {errorMessage ? <div className="border-t border-[#ffd2d9] bg-[#fff1f3] px-6 py-2 text-xs text-[#b00025]">{errorMessage}</div> : null}

          <form
            className="border-t border-editor-border-subtle bg-white p-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (isSending) {
                handleStop();
                return;
              }

              void handleSend();
            }}
          >
            <div className="mb-2 mt-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddMenuOpen(false);
                      setIsContextPickerOpen(false);
                      setIsSourceMenuOpen((current) => !current);
                    }}
                    className="inline-flex items-center gap-1 rounded-full border border-editor-border-subtle bg-[#f8fafd] px-3 py-1.5 text-xs font-medium text-[#2a3242] transition hover:border-[#d70032]"
                    title="Изменить источник контекста"
                  >
                    {contextSummary}
                    <ChevronDown size={13} className="text-[#7b8391]" />
                  </button>

                  {isSourceMenuOpen ? (
                    <div className="absolute bottom-full left-0 z-20 mb-1 min-w-[220px] rounded-lg border border-editor-border-subtle bg-white p-1 shadow-lg">
                      {pageId ? (
                        <button
                          type="button"
                          onClick={() => handleContextSourceChange('currentFile')}
                          className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-xs text-[#2a3242] transition hover:bg-[#f8fafd]"
                        >
                          Текущий документ
                        </button>
                      ) : null}
                      {contextSpaces.map((space) => (
                        <button
                          key={space.id}
                          type="button"
                          onClick={() => handleContextSourceChange(`space:${space.id}`)}
                          className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-xs text-[#2a3242] transition hover:bg-[#f8fafd]"
                        >
                          {space.name}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => handleContextSourceChange('documents')}
                        className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-xs text-[#2a3242] transition hover:bg-[#f8fafd]"
                      >
                        Документы
                      </button>
                      <button
                        type="button"
                        onClick={() => handleContextSourceChange('folders')}
                        className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-xs text-[#2a3242] transition hover:bg-[#f8fafd]"
                      >
                        Папки
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setIsSourceMenuOpen(false);
                      setIsAddMenuOpen((current) => !current);
                    }}
                    disabled={isContextTreeLoading && (contextScope === 'documents' || contextScope === 'folders')}
                    className="inline-flex items-center gap-1 rounded-full bg-[#f0f3f9] px-3 py-1.5 text-xs font-medium text-[#2a3242] transition hover:bg-[#e6ebf5] disabled:opacity-60"
                  >
                    + Добавить
                    <ChevronDown size={13} className="text-[#7b8391]" />
                  </button>

                  {isAddMenuOpen ? (
                    <div className="absolute bottom-full right-0 z-20 mb-1 w-40 rounded-lg border border-editor-border-subtle bg-white p-1 shadow-lg">
                      <button
                        type="button"
                        onClick={() => handleOpenAddContext('documents')}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-[#2a3242] transition hover:bg-[#f8fafd]"
                      >
                        <Search size={13} className="text-[#7b8391]" />
                        Документы
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenAddContext('folders')}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-[#2a3242] transition hover:bg-[#f8fafd]"
                      >
                        <FolderSearch size={13} className="text-[#7b8391]" />
                        Папки
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              {isContextPickerOpen && (contextScope === 'documents' || contextScope === 'folders') ? (
                <div className="mt-2 rounded-xl border border-editor-border-subtle bg-white p-2">
                  <input
                    value={pickerQuery}
                    onChange={(event) => setPickerQuery(event.target.value)}
                    placeholder={contextScope === 'documents' ? 'Найти документ…' : 'Найти папку…'}
                    className="h-9 w-full rounded-lg border border-editor-border-subtle bg-[#fafbfd] px-3 text-sm text-[#2a3242] outline-none focus:border-[#d70032]"
                  />
                  <div className="mt-2 max-h-52 space-y-1 overflow-y-auto">
                    {contextScope === 'documents'
                      ? filteredContextPages.map((page) => {
                          const isSelected = selectedDocuments.some((document) => document.pageId === page.id);
                          const isLoading = selectedDocuments.some((document) => document.pageId === page.id && document.isLoading);

                          return (
                            <label
                              key={page.id}
                              className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm text-[#2a3242] hover:bg-[#fafbfd]"
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => void handleToggleDocumentSelection(page)}
                                disabled={isLoading}
                                className="h-4 w-4 rounded border-[#cfd7e3] text-[#d70032] focus:ring-[#d70032]"
                              />
                              <span className="min-w-0 flex-1 truncate">{page.title}</span>
                              {isLoading ? <span className="text-[11px] text-[#8a93a3]">загружаем…</span> : null}
                            </label>
                          );
                        })
                      : filteredContextFolders.map((folder) => {
                          const isSelected = selectedFolders.some((current) => current.folderId === folder.id);

                          return (
                            <label
                              key={folder.id}
                              className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm text-[#2a3242] hover:bg-[#fafbfd]"
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleFolderSelection(folder)}
                                className="h-4 w-4 rounded border-[#cfd7e3] text-[#d70032] focus:ring-[#d70032]"
                              />
                              <span className="min-w-0 flex-1 truncate">{folder.title}</span>
                            </label>
                          );
                        })}
                    {contextScope === 'documents' && filteredContextPages.length === 0 ? (
                      <div className="rounded-lg px-2 py-3 text-sm text-[#8a93a3]">Подходящих документов не найдено</div>
                    ) : null}
                    {contextScope === 'folders' && filteredContextFolders.length === 0 ? (
                      <div className="rounded-lg px-2 py-3 text-sm text-[#8a93a3]">Подходящих папок не найдено</div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {(contextScope === 'documents' || contextScope === 'folders' || dragDropHint) ? (
                <div
                  className={[
                    'mt-2 rounded-lg border px-2 py-1.5 transition-colors',
                    dragDropHint ? 'border-[#d70032] bg-[#fff8f9] ring-1 ring-[#ffd2d9]' : 'border-editor-border-subtle bg-[#fafbfd]',
                  ].join(' ')}
                  onDragOver={(event) => {
                    const droppedNodeId = event.dataTransfer.getData('application/x-wikilive-node-id');
                    if (!droppedNodeId) {
                      return;
                    }

                    event.preventDefault();
                    const canDropDocument = Boolean(currentSpacePageMap.get(droppedNodeId));
                    const canDropFolder = Boolean(currentSpaceFolderMap.get(droppedNodeId));

                    if (canDropDocument || canDropFolder) {
                      setDragDropHint('Отпустите, чтобы добавить в контекст');
                    }
                  }}
                  onDragLeave={() => setDragDropHint('')}
                  onDrop={(event) => void handleDropOnContext(event)}
                >
                  <div
                    ref={contextRowRef}
                    className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                  >
                    {contextScope === 'documents' &&
                      selectedDocuments.map((document) => (
                        <ContextChip
                          key={document.pageId}
                          title={document.title}
                          loading={document.isLoading}
                          removable
                          onRemove={() => handleRemoveDocument(document.pageId)}
                        />
                      ))}
                    {contextScope === 'folders' &&
                      selectedFolders.map((folder) => (
                        <ContextChip
                          key={folder.folderId}
                          title={folder.title}
                          removable
                          onRemove={() => handleRemoveFolder(folder.folderId)}
                        />
                      ))}
                    {((contextScope === 'documents' && selectedDocuments.length === 0) ||
                      (contextScope === 'folders' && selectedFolders.length === 0)) ? (
                      <span className="text-[11px] text-editor-text-tertiary">Ничего не добавлено</span>
                    ) : null}
                  </div>
                  {dragDropHint ? <p className="mt-2 text-[11px] font-semibold text-[#b00025]">{dragDropHint}</p> : null}
                </div>
              ) : null}
            </div>

            <label className="sr-only" htmlFor="ai-sidebar-chat-input">
              Сообщение ИИ-ассистенту
            </label>
            <div className="flex items-stretch gap-2">
              <textarea
                id="ai-sidebar-chat-input"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder="Спросите про страницу или сравните документы"
                rows={2}
                className="min-h-14 max-h-36 flex-1 resize-none rounded-xl border border-editor-border-subtle bg-white px-4 py-3 text-sm outline-none transition-colors hover:border-[#d70032] focus:border-[#d70032]"
                disabled={isSending || !enabled || hasPendingContext}
              />
              <button
                type="submit"
                disabled={isSending || !draft.trim() || !enabled || hasPendingContext || !isScopeReady}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-editor-border-subtle bg-[#d70032] text-sm font-semibold text-white transition-colors hover:bg-[#b00025] disabled:cursor-not-allowed disabled:opacity-50"
                title={
                  hasPendingContext
                    ? 'Контекст загружается'
                    : !isScopeReady
                      ? 'Выберите область контекста или добавьте элементы в выбранную область'
                      : 'Отправить'
                }
              >
                <SendHorizontal size={16} />
              </button>
            </div>
          </form>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center px-8 text-center text-sm text-editor-text-tertiary">
          Модуль ИИ отключен. Включите плагин ai-assistant, чтобы пользоваться чатом.
        </div>
      )}
    </div>
  );
}
