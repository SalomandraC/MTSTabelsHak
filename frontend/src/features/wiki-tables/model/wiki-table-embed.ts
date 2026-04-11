export type WikiTableEmbedAttrs = {
  blockId: string;
  title?: string | null;
  spaceId: string;
  nodeId: string;
  datasheetId: string;
  viewId?: string | null;
  displayMode?: string;
  selectedFieldIds?: string[];
  filterByFormula?: string | null;
  pageSize?: number;
  allowInlineEdit?: boolean;
};

export type WikiTableEmbedJson = {
  blockId: string;
  title: string | null;
  spaceId: string;
  nodeId: string;
  datasheetId: string;
  viewId: string | null;
  displayMode: string;
  selectedFieldIds: string[];
  filterByFormula: string | null;
  pageSize: number;
  allowInlineEdit: boolean;
};

export type WikiTableSelection = {
  spaceId: string;
  nodeId: string;
  datasheetId: string;
  title: string;
  viewId: string | null;
  selectedFieldIds: string[];
  pageSize: number;
  allowInlineEdit: boolean;
};

const DEFAULT_WIKI_TABLE_EMBED: Omit<WikiTableEmbedJson, 'blockId' | 'spaceId' | 'nodeId' | 'datasheetId'> = {
  title: null,
  viewId: null,
  displayMode: 'table',
  selectedFieldIds: [],
  filterByFormula: null,
  pageSize: 10,
  allowInlineEdit: false,
};

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function normalizeNullableString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function normalizeSelectedFieldIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function normalizePageSize(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_WIKI_TABLE_EMBED.pageSize;
  }

  return Math.max(1, Math.round(value));
}

export function normalizeWikiTableEmbed(attrs: Partial<WikiTableEmbedAttrs> | null | undefined): WikiTableEmbedJson {
  return {
    blockId: normalizeString(attrs?.blockId),
    title: normalizeNullableString(attrs?.title),
    spaceId: normalizeString(attrs?.spaceId),
    nodeId: normalizeString(attrs?.nodeId),
    datasheetId: normalizeString(attrs?.datasheetId),
    viewId: normalizeNullableString(attrs?.viewId),
    displayMode: normalizeString(attrs?.displayMode) || DEFAULT_WIKI_TABLE_EMBED.displayMode,
    selectedFieldIds: normalizeSelectedFieldIds(attrs?.selectedFieldIds),
    filterByFormula: normalizeNullableString(attrs?.filterByFormula),
    pageSize: normalizePageSize(attrs?.pageSize),
    allowInlineEdit: Boolean(attrs?.allowInlineEdit),
  };
}

export class WikiTableEmbed {
  private readonly attrs: WikiTableEmbedJson;

  constructor(attrs: Partial<WikiTableEmbedAttrs> | null | undefined) {
    this.attrs = normalizeWikiTableEmbed(attrs);
  }

  static create(attrs: WikiTableEmbedAttrs) {
    return new WikiTableEmbed(attrs);
  }

  static fromNodeAttrs(attrs: Partial<WikiTableEmbedAttrs> | null | undefined) {
    return new WikiTableEmbed(attrs);
  }

  toJSON(): WikiTableEmbedJson {
    return {
      ...this.attrs,
      selectedFieldIds: [...this.attrs.selectedFieldIds],
    };
  }

  toJson(): WikiTableEmbedJson {
    return this.toJSON();
  }

  toNode() {
    return {
      type: 'mwsTableEmbed' as const,
      attrs: this.toJSON(),
    };
  }
}

export function createWikiTableEmbed(attrs: WikiTableEmbedAttrs) {
  return WikiTableEmbed.create(attrs);
}

export function createWikiTableEmbedNode(attrs: WikiTableEmbedAttrs) {
  return createWikiTableEmbed(attrs).toNode();
}
