export interface ContextEngineIndexDocumentRequest {
  pageId: string;
  spaceId: string;
  title: string;
  folderIds: string[];
  snapshotVersion: number;
  text: string;
  updatedAt?: string;
}

export interface ContextEngineSearchRequest {
  spaceId: string;
  query: string;
  pageIds?: string[];
  topK?: number;
}

export interface ContextEngineSearchResultItem {
  chunkId: string;
  pageId: string;
  spaceId: string;
  title: string;
  chunkText: string;
  chunkIndex: number;
  score: number;
}

export interface ContextEngineSearchResponse {
  items: ContextEngineSearchResultItem[];
}
