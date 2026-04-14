from __future__ import annotations

from dataclasses import dataclass

from pydantic import BaseModel, Field

from app.core.config import settings


class IndexDocumentRequest(BaseModel):
    pageId: str
    spaceId: str
    title: str
    folderIds: list[str] = Field(default_factory=list)
    snapshotVersion: int
    text: str
    updatedAt: str | None = None


class SearchRequest(BaseModel):
    spaceId: str
    query: str
    pageIds: list[str] | None = None
    topK: int = settings.search_default_k


class SearchResultItem(BaseModel):
    chunkId: str
    pageId: str
    spaceId: str
    title: str
    chunkText: str
    chunkIndex: int
    score: float


class SearchResponse(BaseModel):
    items: list[SearchResultItem]


@dataclass
class ChunkRecord:
    chunk_id: str
    page_id: str
    space_id: str
    title: str
    chunk_text: str
    chunk_index: int
    snapshot_version: int
    folder_ids: list[str]
