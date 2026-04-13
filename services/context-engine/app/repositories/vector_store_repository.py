from __future__ import annotations

from typing import Any

import chromadb

from app.core.config import settings
from app.models.context_engine import ChunkRecord, SearchRequest, SearchResponse, SearchResultItem
from app.services.embedding_service import EmbeddingService


class VectorStoreRepository:
    def __init__(self, embedding_service: EmbeddingService) -> None:
        self._client = chromadb.PersistentClient(path=settings.persist_directory)
        self._collection = self._client.get_or_create_collection(name=settings.collection_name)
        self._embedding_service = embedding_service

    def add_chunks(self, chunks: list[ChunkRecord]) -> int:
        if not chunks:
            return 0

        embeddings = self._embedding_service.embed_texts([chunk.chunk_text for chunk in chunks])
        self._collection.add(
            ids=[chunk.chunk_id for chunk in chunks],
            embeddings=embeddings,
            documents=[chunk.chunk_text for chunk in chunks],
            metadatas=[
                {
                    "page_id": chunk.page_id,
                    "space_id": chunk.space_id,
                    "title": chunk.title,
                    "chunk_index": chunk.chunk_index,
                    "snapshot_version": chunk.snapshot_version,
                    "folder_ids": chunk.folder_ids,
                }
                for chunk in chunks
            ],
        )
        return len(chunks)

    def delete_document(self, page_id: str) -> None:
        self._collection.delete(where={"page_id": page_id})

    def search(self, payload: SearchRequest) -> SearchResponse:
        if not payload.query.strip():
            return SearchResponse(items=[])

        where: dict[str, Any] = {"space_id": payload.spaceId}
        if payload.pageIds:
            where = {
                "$and": [
                    {"space_id": payload.spaceId},
                    {"page_id": {"$in": payload.pageIds}},
                ]
            }

        query_embedding = self._embedding_service.embed_texts([payload.query])[0]
        response = self._collection.query(
            query_embeddings=[query_embedding],
            n_results=max(1, payload.topK),
            where=where,
        )

        documents = response.get("documents", [[]])[0]
        metadatas = response.get("metadatas", [[]])[0]
        distances = response.get("distances", [[]])[0]
        ids = response.get("ids", [[]])[0]

        items: list[SearchResultItem] = []
        for chunk_id, document, metadata, distance in zip(ids, documents, metadatas, distances):
            score = 1.0 / (1.0 + float(distance))
            items.append(
                SearchResultItem(
                    chunkId=chunk_id,
                    pageId=str(metadata.get("page_id")),
                    spaceId=str(metadata.get("space_id")),
                    title=str(metadata.get("title") or "Без названия"),
                    chunkText=document,
                    chunkIndex=int(metadata.get("chunk_index") or 0),
                    score=score,
                )
            )

        return SearchResponse(items=items)
