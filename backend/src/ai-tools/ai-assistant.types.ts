export type TextTransformationType = 'professional' | 'shorten' | 'expand' | 'fix_grammar';
export type TextStyleId = 'standard' | 'business' | 'military' | 'medieval' | 'church' | 'fix' | 'expand';

export interface ProseMirrorNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: ProseMirrorNode[];
  text?: string;
  marks?: Array<Record<string, unknown>>;
}

export interface ProseMirrorDocument {
  type: 'doc';
  content: ProseMirrorNode[];
}

export interface PageContextInput {
  pageTitle?: string;
  pageSnapshot?: Record<string, unknown> | string;
  selectedText?: string;
}

export interface ChatContextInput {
  pageId?: string;
  pageTitle?: string;
  pageSnapshot?: Record<string, unknown> | string;
  datasheetId?: string;
  viewId?: string;
}

export interface AiChatAnswer {
  answer: string;
  usedTools: Array<{
    toolName: string;
    args: Record<string, unknown>;
  }>;
  contextMarkdown: string;
  references?: Array<Record<string, unknown>>;
}

export type AiIntent = 'chat' | 'plan_mutation' | 'write_report' | 'autocomplete';