from __future__ import annotations

from fastapi import APIRouter

from app.dependencies import get_context_engine_service
from app.models.context_engine import IndexDocumentRequest, SearchRequest, SearchResponse


router = APIRouter(tags=["context-engine"])


@router.post("/index/documents")
def index_document(payload: IndexDocumentRequest) -> dict[str, object]:
    service = get_context_engine_service()
    chunks = service.index_document(payload)
    return {
        "ok": True,
        "pageId": payload.pageId,
        "chunksIndexed": chunks,
    }


@router.delete("/index/documents/{page_id}")
def delete_document(page_id: str) -> dict[str, object]:
    service = get_context_engine_service()
    service.delete_document(page_id)
    return {
        "ok": True,
        "pageId": page_id,
    }


@router.post("/search", response_model=SearchResponse)
def search(payload: SearchRequest) -> SearchResponse:
    service = get_context_engine_service()
    return service.search(payload)
