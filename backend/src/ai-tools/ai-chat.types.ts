import { AiIntent } from './ai-assistant.types';

export interface AiChatToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatQuestionInput {
  question: string;
  spaceId?: string;
  contextScope?: 'currentFile' | 'documents' | 'folders' | 'space';
  intent?: AiIntent;
  pageId?: string;
  pageTitle?: string;
  pageSnapshot?: Record<string, unknown> | string;
  datasheetId?: string;
  viewId?: string;
  fieldKey?: 'id' | 'name';
  selectedPageIds?: string[];
  selectedFolderIds?: string[];
  contextDocuments?: Array<{
    pageId: string;
    title: string;
    markdown: string;
  }>;
  workspaceStructure?: {
    scope: 'currentFile' | 'documents' | 'folders' | 'space';
    spaceId: string;
    truncated?: boolean;
    nodes: Array<{
      id: string;
      title: string;
      kind: string;
      parentId: string | null;
      depth: number;
    }>;
  };
  useVectorSearch?: boolean;
}

export interface ChatQuestionResponse {
  answer: string;
  needsRefresh: boolean;
  usedTools: Array<{
    toolName: string;
    args: Record<string, unknown>;
  }>;
  contextMarkdown: string;
  references: Array<Record<string, unknown>>;
}
