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

export interface BlockNode {
  type: 'heading' | 'paragraph' | 'text' | 'image' | 'iframe' | 'table' | 'code_block' | 'bullet_list' | 'ordered_list' | 'task_list' | 'task_item' | 'blockquote' | 'horizontal_rule' | 'link';
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
}

export interface GenerateRequest {
  /** Format to generate: pdf, docx, or md */
  format: 'pdf' | 'docx' | 'md';
  /** Page title */
  title: string;
  /**
   * ProseMirror JSON document.
   * Can be:
   * - Full { type: 'doc', content: [...] } object
   * - Just the content array
   * - JSON string of either of the above
   */
  document: ProseMirrorDocument | ProseMirrorNode[] | string;
  /** Auth credentials to proxy to backend API */
  auth?: {
    accessToken?: string;
    userId?: string;
    displayName?: string;
  };
}

export interface PdfOptions {
  pageSize?: 'A4' | 'Letter' | 'Legal';
  margin?: { top: string; bottom: string; left: string; right: string };
}

export const DEFAULT_PDF_OPTIONS: PdfOptions = {
  pageSize: 'A4',
  margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
};
