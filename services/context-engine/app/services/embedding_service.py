from __future__ import annotations

import hashlib
import logging
import re

import numpy as np

from app.core.config import settings

try:
    import torch
    from transformers import AutoModel, AutoTokenizer
except Exception:  # pragma: no cover
    torch = None
    AutoModel = None
    AutoTokenizer = None


logger = logging.getLogger("context-engine")


class EmbeddingService:
    def __init__(self) -> None:
        self.model_name = settings.embedding_model_name
        self._tokenizer = None
        self._model = None
        self._fallback = False

        if AutoTokenizer is None or AutoModel is None or torch is None:
            logger.warning("Transformers/torch are unavailable, using fallback embeddings")
            self._fallback = True
            return

        try:
            self._tokenizer = AutoTokenizer.from_pretrained(self.model_name)
            self._model = AutoModel.from_pretrained(self.model_name)
            self._model.eval()
        except Exception as error:  # pragma: no cover
            logger.warning("Failed to load embedding model %s: %s. Using fallback embeddings.", self.model_name, error)
            self._fallback = True

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        if self._fallback:
            return [self._fallback_embed(text) for text in texts]

        encoded = self._tokenizer(
            texts,
            padding=True,
            truncation=True,
            max_length=512,
            return_tensors="pt",
        )

        with torch.no_grad():
            model_output = self._model(**encoded)

        token_embeddings = model_output.last_hidden_state
        attention_mask = encoded["attention_mask"]
        input_mask_expanded = attention_mask.unsqueeze(-1).expand(token_embeddings.size()).float()
        sum_embeddings = torch.sum(token_embeddings * input_mask_expanded, dim=1)
        sum_mask = torch.clamp(input_mask_expanded.sum(dim=1), min=1e-9)
        embeddings = sum_embeddings / sum_mask
        normalized = torch.nn.functional.normalize(embeddings, p=2, dim=1)
        return normalized.cpu().numpy().tolist()

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
