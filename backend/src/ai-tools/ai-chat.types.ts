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
  intent?: AiIntent;
  pageId?: string;
  pageTitle?: string;
  pageSnapshot?: Record<string, unknown> | string;
  datasheetId?: string;
  viewId?: string;
  fieldKey?: 'id' | 'name';
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