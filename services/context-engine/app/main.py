from __future__ import annotations

import logging
import os

from fastapi import FastAPI

from app.routes.context_engine import router as context_engine_router
from app.routes.health import router as health_router


logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))

app = FastAPI(title="WikiLive Context Engine")
app.include_router(health_router)
app.include_router(context_engine_router)
