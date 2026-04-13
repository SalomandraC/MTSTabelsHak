from __future__ import annotations

from functools import lru_cache

from app.repositories.vector_store_repository import VectorStoreRepository
from app.services.chunking_service import ChunkingService
from app.services.context_engine_service import ContextEngineService
from app.services.embedding_service import EmbeddingService


@lru_cache
def get_embedding_service() -> EmbeddingService:
    return EmbeddingService()


@lru_cache
def get_chunking_service() -> ChunkingService:
    return ChunkingService()


@lru_cache
def get_vector_store_repository() -> VectorStoreRepository:
    return VectorStoreRepository(get_embedding_service())


@lru_cache
def get_context_engine_service() -> ContextEngineService:
    return ContextEngineService(
        vector_store_repository=get_vector_store_repository(),
        chunking_service=get_chunking_service(),
    )
