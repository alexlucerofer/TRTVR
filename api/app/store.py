"""Armazenamento local (SQLite) das análises e das correções feitas na gestão.

Privacidade: a IMAGEM nunca é gravada — só o SHA-256, os campos extraídos e o resultado.
Do usuário, só o perfil (códigos de área/região), sem nome, e-mail ou IP.
"""
from __future__ import annotations

import json
import os
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path

SCHEMA = """
create table if not exists analises (
  id integer primary key autoincrement,
  criado_em text not null,
  origem text not null check (origem in ('texto','imagem')),
  engine text,
  url text,
  imagem_sha256 text,
  titulo text,
  empresa text,
  nivel text not null,
  regioes text,
  perfil_json text,
  extraido_json text,
  job_json text not null,
  resultado_json text not null
);
create index if not exists analises_nivel on analises(nivel);
create table if not exists correcoes (
  id integer primary key autoincrement,
  analise_id integer not null references analises(id) on delete cascade,
  criado_em text not null,
  job_antes_json text not null,
  job_depois_json text not null,
  nivel_antes text not null,
  nivel_depois text not null
);
create table if not exists relatos (
  id integer primary key autoincrement,
  criado_em text not null,
  categoria text not null,
  texto text,
  status text not null default 'pendente' check (status in ('pendente','aprovado','rejeitado')),
  titulo text, empresa text, url text,
  nivel text, indicadores text,
  imagem_sha256 text,
  contatos text,
  job_json text not null
);
create table if not exists inscricoes (
  id integer primary key autoincrement,
  criado_em text not null,
  regiao_estimada text,
  pais_estimado text,
  lat real, lon real, precisao_m real,
  idioma text, idiomas text, fuso_horario text,
  telefone text, whatsapp_ok integer, email text,
  perfil_json text,
  pagina text, referrer text
);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _dump(o) -> str | None:
    return None if o is None else json.dumps(o, ensure_ascii=False)


class Store:
    def __init__(self, path: str | os.PathLike | None = None):
        default = Path(__file__).resolve().parents[1] / "data" / "elo.db"
        self.path = str(path or os.environ.get("ELO_DB") or default)
        if self.path != ":memory:":
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(self.path, check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        self._db.execute("pragma foreign_keys = on")
        self._db.executescript(SCHEMA)
        self._lock = threading.Lock()

    def save(self, *, origem: str, job: dict, result: dict, engine: str | None = None, extraido: dict | None = None,
             perfil: dict | None = None, imagem_sha256: str | None = None, regioes: list[str] | None = None) -> int:
        with self._lock, self._db:
            cur = self._db.execute(
                "insert into analises (criado_em, origem, engine, url, imagem_sha256, titulo, empresa, nivel, regioes, perfil_json, extraido_json, job_json, resultado_json)"
                " values (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (_now(), origem, engine, job.get("url"), imagem_sha256, job.get("title"), job.get("company"), result["level"],
                 ",".join(regioes or []), _dump(perfil), _dump(extraido), _dump(job), _dump(result)),
            )
            return int(cur.lastrowid)

    @staticmethod
    def _row(r: sqlite3.Row, full: bool = False) -> dict:
        d = {k: r[k] for k in ("id", "criado_em", "origem", "engine", "url", "imagem_sha256", "titulo", "empresa", "nivel")}
        d["regioes"] = [x for x in (r["regioes"] or "").split(",") if x]
        res = json.loads(r["resultado_json"])
        d["indicadores"] = [i["id"] for i in res.get("indicators", [])]
        if full:
            d["perfil"] = json.loads(r["perfil_json"]) if r["perfil_json"] else None
            d["extraido"] = json.loads(r["extraido_json"]) if r["extraido_json"] else None
            d["job"] = json.loads(r["job_json"])
            d["resultado"] = res
        return d

    def list(self, *, nivel: str | None = None, regiao: str | None = None, q: str | None = None, limit: int = 100, offset: int = 0) -> list[dict]:
        sql, args = "select * from analises where 1=1", []
        if nivel:
            sql += " and nivel = ?"; args.append(nivel)
        if regiao:
            sql += " and (',' || regioes || ',') like ?"; args.append(f"%,{regiao},%")
        if q:
            sql += " and (titulo like ? or empresa like ? or job_json like ?)"; args += [f"%{q}%"] * 3
        sql += " order by id desc limit ? offset ?"; args += [max(1, min(limit, 500)), max(0, offset)]
        with self._lock:
            return [self._row(r) for r in self._db.execute(sql, args).fetchall()]

    def get(self, analise_id: int) -> dict | None:
        with self._lock:
            r = self._db.execute("select * from analises where id = ?", (analise_id,)).fetchone()
            if not r:
                return None
            d = self._row(r, full=True)
            d["correcoes"] = [
                {"id": c["id"], "criado_em": c["criado_em"], "nivel_antes": c["nivel_antes"], "nivel_depois": c["nivel_depois"],
                 "job_antes": json.loads(c["job_antes_json"]), "job_depois": json.loads(c["job_depois_json"])}
                for c in self._db.execute("select * from correcoes where analise_id = ? order by id", (analise_id,)).fetchall()
            ]
            return d

    def correct(self, analise_id: int, *, job_antes: dict, job_depois: dict, nivel_antes: str, result: dict, regioes: list[str]) -> None:
        with self._lock, self._db:
            self._db.execute(
                "insert into correcoes (analise_id, criado_em, job_antes_json, job_depois_json, nivel_antes, nivel_depois) values (?,?,?,?,?,?)",
                (analise_id, _now(), _dump(job_antes), _dump(job_depois), nivel_antes, result["level"]),
            )
            self._db.execute(
                "update analises set titulo = ?, empresa = ?, nivel = ?, regioes = ?, job_json = ?, resultado_json = ? where id = ?",
                (job_depois.get("title"), job_depois.get("company"), result["level"], ",".join(regioes), _dump(job_depois), _dump(result), analise_id),
            )

    # ---------------- relatos (base de comparação)
    def report(self, *, categoria: str, texto: str | None, job: dict, nivel: str | None, indicadores: list[str], imagem_sha256: str | None, contatos: list[str]) -> dict:
        with self._lock, self._db:
            cur = self._db.execute(
                "insert into relatos (criado_em, categoria, texto, titulo, empresa, url, nivel, indicadores, imagem_sha256, contatos, job_json) values (?,?,?,?,?,?,?,?,?,?,?)",
                (_now(), categoria, texto, job.get("title"), job.get("company"), job.get("url"), nivel, ",".join(indicadores), imagem_sha256, ",".join(contatos), _dump(job)),
            )
            rid = int(cur.lastrowid)
        return self.get_report(rid)

    @staticmethod
    def _report_row(r: sqlite3.Row) -> dict:
        d = dict(r)
        d["job"] = json.loads(d.pop("job_json"))
        d["indicadores"] = [x for x in (d["indicadores"] or "").split(",") if x]
        d["contatos"] = [x for x in (d["contatos"] or "").split(",") if x]
        return d

    def get_report(self, rid: int) -> dict | None:
        with self._lock:
            r = self._db.execute("select * from relatos where id = ?", (rid,)).fetchone()
        return self._report_row(r) if r else None

    def reports(self, status: str | None = None, limit: int = 200) -> list[dict]:
        sql, args = "select * from relatos", []
        if status:
            sql += " where status = ?"; args.append(status)
        sql += " order by id desc limit ?"; args.append(max(1, min(limit, 5000)))
        with self._lock:
            return [self._report_row(r) for r in self._db.execute(sql, args).fetchall()]

    def set_report_status(self, rid: int, status: str) -> None:
        with self._lock, self._db:
            self._db.execute("update relatos set status = ? where id = ?", (status, rid))

    def subscribe(self, d: dict) -> int:
        cols = ["regiao_estimada", "pais_estimado", "lat", "lon", "precisao_m", "idioma", "idiomas", "fuso_horario", "telefone", "whatsapp_ok", "email", "perfil_json", "pagina", "referrer"]
        with self._lock, self._db:
            cur = self._db.execute(f"insert into inscricoes (criado_em, {', '.join(cols)}) values (?{', ?' * len(cols)})", [_now()] + [d.get(c) for c in cols])
            return int(cur.lastrowid)

    def subscriptions(self, limit: int = 200) -> list[dict]:
        with self._lock:
            rows = self._db.execute("select * from inscricoes order by id desc limit ?", (max(1, min(limit, 1000)),)).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            d["perfil"] = json.loads(d.pop("perfil_json")) if d.get("perfil_json") else None
            d["idiomas"] = [x for x in (d.get("idiomas") or "").split(",") if x]
            d["whatsapp_ok"] = bool(d["whatsapp_ok"]) if d["whatsapp_ok"] is not None else None
            out.append(d)
        return out

    def summary(self) -> dict:
        with self._lock:
            rows = self._db.execute("select nivel, count(*) n from analises group by nivel").fetchall()
            return {r["nivel"]: r["n"] for r in rows}
