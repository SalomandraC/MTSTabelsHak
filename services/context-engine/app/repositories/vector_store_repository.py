from __future__ import annotations

from typing import Any

from qdrant_client import QdrantClient
from qdrant_client.http import models as qdrant_models

from app.core.config import settings
from app.models.context_engine import ChunkRecord, SearchRequest, SearchResponse, SearchResultItem
from app.services.embedding_service import EmbeddingService


class VectorStoreRepository:
    def __init__(self, embedding_service: EmbeddingService) -> None:
        self._client = QdrantClient(path=settings.persist_directory)
        self._embedding_service = embedding_service
        self._collection_initialized = False

    def add_chunks(self, chunks: list[ChunkRecord]) -> int:
        if not chunks:
            return 0

        embeddings = self._embedding_service.embed_texts([chunk.chunk_text for chunk in chunks])
        self._ensure_collection(vector_size=len(embeddings[0]))
        self._client.upsert(
            collection_name=settings.collection_name,
            points=[
                qdrant_models.PointStruct(
                    id=chunk.chunk_id,
                    vector=embedding,
                    payload={
                        "page_id": chunk.page_id,
                        "space_id": chunk.space_id,
                        "title": chunk.title,
                        "chunk_text": chunk.chunk_text,
                        "chunk_index": chunk.chunk_index,
                        "snapshot_version": chunk.snapshot_version,
                        "folder_ids": chunk.folder_ids,
                    },
                )
                for chunk, embedding in zip(chunks, embeddings)
            ],
        )
        return len(chunks)

    def delete_document(self, page_id: str) -> None:
        if not self._collection_exists():
            return

        self._client.delete(
            collection_name=settings.collection_name,
            points_selector=qdrant_models.Filter(
                must=[
                    qdrant_models.FieldCondition(
                        key="page_id",
                        match=qdrant_models.MatchValue(value=page_id),
                    ),
                ],
            ),
        )

    def search(self, payload: SearchRequest) -> SearchResponse:
        if not payload.query.strip() or not self._collection_exists():
            return SearchResponse(items=[])

        filters: list[qdrant_models.FieldCondition] = [
            qdrant_models.FieldCondition(
                key="space_id",
                match=qdrant_models.MatchValue(value=payload.spaceId),
            ),
        ]
        if payload.pageIds:
            filters.append(
                qdrant_models.FieldCondition(
                    key="page_id",
                    match=qdrant_models.MatchAny(any=payload.pageIds),
                ),
            )

        query_embedding = self._embedding_service.embed_texts([payload.query])[0]
        response = self._client.search(
            collection_name=settings.collection_name,
            query_vector=query_embedding,
            query_filter=qdrant_models.Filter(must=filters),
            limit=max(1, payload.topK),
            with_payload=True,
            with_vectors=False,
        )

        items: list[SearchResultItem] = []
        for point in response:
            metadata = point.payload or {}
            score = float(point.score or 0.0)
            items.append(
                SearchResultItem(
                    chunkId=str(point.id),
                    pageId=str(metadata.get("page_id")),
                    spaceId=str(metadata.get("space_id")),
                    title=str(metadata.get("title") or "Без названия"),
                    chunkText=str(metadata.get("chunk_text") or ""),
                    chunkIndex=int(metadata.get("chunk_index") or 0),
                    score=score,
                )
            )

        return SearchResponse(items=items)

    def _ensure_collection(self, vector_size: int) -> None:
        if self._collection_exists():
            self._collection_initialized = True
            return

        self._client.create_collection(
            collection_name=settings.collection_name,
            vectors_config=qdrant_models.VectorParams(
                size=vector_size,
                distance=qdrant_models.Distance.COSINE,
            ),
        )
        self._collection_initialized = True

    def _collection_exists(self) -> bool:
        if self._collection_initialized:
            return True

        try:
            self._client.get_collection(settings.collection_name)
            self._collection_initialized = True
            return True
        except Exception:
            return False
