export type FileValidationResult =
  | { ok: true }
  | { ok: false; error: string };

export type ProseMirrorMark = {
  type: string;
  attrs?: Record<string, unknown>;
};

export type ProseMirrorNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: ProseMirrorNode[];
  text?: string;
  marks?: ProseMirrorMark[];
};

export type ProseMirrorDoc = {
  type: 'doc';
  content: ProseMirrorNode[];
};

export type ParsedDocument = {
  title: string | null;
  prosemirrorDoc: ProseMirrorDoc;
};
