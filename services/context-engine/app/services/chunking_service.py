from __future__ import annotations

import re

from app.core.config import settings


class ChunkingService:
    def normalize_text(self, text: str) -> str:
        return re.sub(r"\s+", " ", text).strip()

    def chunk_text(self, text: str) -> list[str]:
        normalized = text.strip()
        if not normalized:
            return []

        paragraphs = [segment.strip() for segment in re.split(r"\n{2,}", normalized) if segment.strip()]
        chunks: list[str] = []
        current = ""

        for paragraph in paragraphs or [normalized]:
            candidate = f"{current}\n\n{paragraph}".strip() if current else paragraph
            if len(candidate) <= settings.chunk_target_chars:
                current = candidate
                continue

            if current:
                chunks.append(current)
                overlap = current[-settings.chunk_overlap_chars :].strip()
                current = f"{overlap}\n\n{paragraph}".strip() if overlap else paragraph
            else:
                step = max(1, settings.chunk_target_chars - settings.chunk_overlap_chars)
                for offset in range(0, len(paragraph), step):
                    part = paragraph[offset : offset + settings.chunk_target_chars].strip()
                    if part:
                        chunks.append(part)
                current = ""

        if current:
            chunks.append(current)

        return [self.normalize_text(chunk) for chunk in chunks if self.normalize_text(chunk)]
