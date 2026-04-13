from __future__ import annotations

import os


class Settings:
    persist_directory = os.getenv("QDRANT_PERSIST_DIRECTORY", os.getenv("CHROMA_PERSIST_DIRECTORY", "/data/qdrant"))
    collection_name = os.getenv("CONTEXT_ENGINE_COLLECTION", "wikilive_document_chunks")
    embedding_model_name = os.getenv("CONTEXT_ENGINE_EMBEDDING_MODEL", "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
    embedding_dim = int(os.getenv("CONTEXT_ENGINE_EMBEDDING_DIM", "312"))
    chunk_target_chars = int(os.getenv("CONTEXT_ENGINE_CHUNK_TARGET_CHARS", "900"))
    chunk_overlap_chars = int(os.getenv("CONTEXT_ENGINE_CHUNK_OVERLAP_CHARS", "120"))
    search_default_k = int(os.getenv("CONTEXT_ENGINE_SEARCH_TOP_K", "5"))


settings = Settings()
