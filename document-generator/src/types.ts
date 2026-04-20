export interface ProseMirrorNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: ProseMirrorNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

export interface ProseMirrorDocument {
  type: 'doc';
  content: ProseMirrorNode[];
}

export type BlockInlineNode = {
  type: 'text' | 'page_link' | 'link' | 'live_reference' | 'live_formula' | 'template_variable' | 'hard_break';
  text?: string;
  pageId?: string;
  pageTitle?: string;
  href?: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
  datasheetId?: string;
  recordId?: string;
  fieldId?: string;
  label?: string;
  value?: string;
  expression?: string;
  result?: string;
  key?: string;
  description?: string;
};

export interface BlockNode {
  type: 'heading' | 'paragraph' | 'text' | 'image' | 'iframe' | 'table' | 'code_block' | 'bullet_list' | 'ordered_list' | 'task_list' | 'task_item' | 'blockquote' | 'horizontal_rule' | 'link' | 'page_link';
  level?: number;
  content?: string;
  children?: BlockNode[];
  src?: string;
  alt?: string;
  headers?: string[];
  rows?: string[][];
  checked?: boolean;
  href?: string;
  language?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  // MWS table embed attrs
  datasheetId?: string | null;
  viewId?: string | null;
  spaceId?: string | null;
  // Page link attrs
  pageId?: string | null;
  pageTitle?: string | null;
  // Structured inline nodes for rich rendering in docx
  inlineNodes?: BlockInlineNode[];
}

export interface GenerateRequest {
  format: 'pdf' | 'docx' | 'md';
  title: string;
  document: ProseMirrorDocument | ProseMirrorNode[] | string;
  auth?: {
    accessToken?: string;
    userId?: string;
    displayName?: string;
  };
  appBaseUrl?: string;
  spaceId?: string;
}

export interface PdfOptions {
  pageSize?: 'A4' | 'Letter' | 'Legal';
  margin?: { top: string; bottom: string; left: string; right: string };
}

export const DEFAULT_PDF_OPTIONS: PdfOptions = {
  pageSize: 'A4',
  margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
};
