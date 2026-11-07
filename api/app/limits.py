"""Limite de requisições por IP (janela deslizante, em memória). Suficiente para rodar localmente
ou numa única instância; numa API pública com várias instâncias, troque por Redis ou pelo proxy."""
from __future__ import annotations

import os
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request


class RateLimiter:
    def __init__(self, per_minute: int | None = None):
        self.per_minute = per_minute or int(os.environ.get("ELO_RATE_LIMIT", "30"))
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str) -> None:
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and now - q[0] > 60:
                q.popleft()
            if len(q) >= self.per_minute:
                raise HTTPException(status_code=429, detail=f"limite de {self.per_minute} análises por minuto; tente de novo em instantes",
                                    headers={"Retry-After": str(int(60 - (now - q[0])) + 1)})
            q.append(now)

    def __call__(self, request: Request) -> None:
        self.check(request.client.host if request.client else "anon")
