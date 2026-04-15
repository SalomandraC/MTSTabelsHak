from __future__ import annotations

from app.models.context_engine import ChunkRecord, IndexDocumentRequest, SearchRequest, SearchResponse
from app.repositories.vector_store_repository import VectorStoreRepository
from app.services.chunking_service import ChunkingService


class ContextEngineService:
    def __init__(
        self,
        vector_store_repository: VectorStoreRepository,
        chunking_service: ChunkingService,
    ) -> None:
        self._vector_store_repository = vector_store_repository
        self._chunking_service = chunking_service

    def index_document(self, payload: IndexDocumentRequest) -> int:
        chunks = [
            ChunkRecord(
                chunk_id=f"{payload.pageId}:{index}",
                page_id=payload.pageId,
                space_id=payload.spaceId,
                title=payload.title,
                chunk_text=chunk,
                chunk_index=index,
                snapshot_version=payload.snapshotVersion,
                folder_ids=payload.folderIds,
            )
            for index, chunk in enumerate(self._chunking_service.chunk_text(payload.text))
        ]

        self._vector_store_repository.delete_document(payload.pageId)
        return self._vector_store_repository.add_chunks(chunks)

    def delete_document(self, page_id: str) -> None:
        self._vector_store_repository.delete_document(page_id)

    def search(self, payload: SearchRequest) -> SearchResponse:
        return self._vector_store_repository.search(payload)
