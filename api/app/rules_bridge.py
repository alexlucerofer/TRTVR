"""Cliente do processo Node persistente (api/bridge/elo_bridge.js) que roda o motor de regras do ELO.

Um único processo é reaproveitado entre requisições (protocolo: uma linha JSON por pedido/resposta).
Se ele morrer, é reiniciado no próximo pedido.
"""
from __future__ import annotations

import itertools
import json
import os
import shutil
import subprocess
import threading
from pathlib import Path

BRIDGE = Path(__file__).resolve().parents[1] / "bridge" / "elo_bridge.js"


class RulesError(RuntimeError):
    pass


class RulesBridge:
    def __init__(self, timeout: float = 25.0):
        self.timeout = timeout
        self._proc: subprocess.Popen | None = None
        self._lock = threading.Lock()
        self._ids = itertools.count(1)
        # chamado sempre que o processo Node (re)inicia: devolve [(ação, payload)] para repor o estado (ex.: base de relatos)
        self.on_start = None

    def _start(self) -> subprocess.Popen:
        node = os.environ.get("ELO_NODE") or shutil.which("node")
        if not node:
            raise RulesError("Node.js não encontrado (defina ELO_NODE ou instale o node)")
        return subprocess.Popen(
            [node, str(BRIDGE)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            text=True, encoding="utf-8", bufsize=1,
        )

    def call(self, action: str, **payload) -> dict:
        with self._lock:
            if self._proc is None or self._proc.poll() is not None:
                self._proc = self._start()
                for a, p in (self.on_start() if self.on_start else []):
                    self._send(a, p)
            return self._send(action, payload)

    def _send(self, action: str, payload: dict) -> dict:
        req_id = next(self._ids)
        assert self._proc.stdin and self._proc.stdout
        try:
            self._proc.stdin.write(json.dumps({"id": req_id, "action": action, **payload}, ensure_ascii=False) + "\n")
            self._proc.stdin.flush()
            result: list[str] = []
            reader = threading.Thread(target=lambda: result.append(self._proc.stdout.readline()), daemon=True)
            reader.start()
            reader.join(self.timeout)
            if not result or not result[0]:
                raise RulesError("motor de regras não respondeu")
            msg = json.loads(result[0])
        except (BrokenPipeError, json.JSONDecodeError, RulesError) as e:
            self.close()
            raise RulesError(str(e) or "falha no motor de regras") from e
        if msg.get("id") != req_id:
            self.close()
            raise RulesError("resposta fora de ordem do motor de regras")
        if not msg.get("ok"):
            raise RulesError(msg.get("error") or "erro no motor de regras")
        return msg["result"]

    def analyze(self, job: dict, profile: dict | None = None) -> dict:
        return self.call("analyze", job=job, profile=profile)

    def indicators(self) -> dict:
        return self.call("indicators")

    def close(self) -> None:
        if self._proc is not None:
            try:
                self._proc.kill()
            except Exception:
                pass
            self._proc = None
