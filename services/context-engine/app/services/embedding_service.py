from __future__ import annotations

import hashlib
import logging
import re

import numpy as np
from fastembed import TextEmbedding

from app.core.config import settings


logger = logging.getLogger("context-engine")


class EmbeddingService:
    def __init__(self) -> None:
        self.model_name = settings.embedding_model_name
        self._model = None
        self._fallback = False

        try:
            self._model = TextEmbedding(model_name=self.model_name)
        except Exception as error:  # pragma: no cover
            logger.warning("Failed to load embedding model %s: %s. Using fallback embeddings.", self.model_name, error)
            self._fallback = True

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        if self._fallback:
            return [self._fallback_embed(text) for text in texts]

        embeddings = list(self._model.embed(texts))
        return [np.asarray(embedding, dtype=np.float32).tolist() for embedding in embeddings]

    def _fallback_embed(self, text: str) -> list[float]:
        vector = np.zeros(settings.embedding_dim, dtype=np.float32)
        tokens = re.findall(r"\w+", text.lower(), flags=re.UNICODE)

        if not tokens:
            return vector.tolist()

        for token in tokens:
            digest = hashlib.sha256(token.encode("utf-8")).digest()
            for index in range(0, len(digest), 4):
                position = int.from_bytes(digest[index : index + 2], "little") % settings.embedding_dim
                sign = 1.0 if digest[index + 2] % 2 == 0 else -1.0
                vector[position] += sign

        norm = np.linalg.norm(vector)
        if norm > 0:
            vector = vector / norm
        return vector.tolist()
