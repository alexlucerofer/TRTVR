"""ELO API — verificação pública de vagas (texto e imagem) e gestão local das análises.

Rodar:  npm run api   (ou: cd api && .venv/bin/uvicorn app.main:app --port 8787 --env-file ../.env)
Docs:   http://localhost:8787/docs
"""
from __future__ import annotations

import csv
import hashlib
import hmac
import io
import json
import os
from pathlib import Path
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import vision
from .limits import RateLimiter
from .rules_bridge import RulesBridge, RulesError
from .store import Store

VERSION = "0.3.3"
AREAS = Literal["atendimento", "ti", "marketing_digital", "agro", "construcao", "hotelaria", "domestico", "beleza_entretenimento", "outra"]
REGIOES = Literal["brasil", "america_do_sul", "europa", "america_do_norte", "oriente_medio", "sudeste_asiatico", "asia_leste"]
NIVEIS = Literal["alto_risco", "atencao", "dados_insuficientes", "sem_alertas"]

app = FastAPI(
    title="ELO API — vagas seguras",
    version=VERSION,
    description=(
        "API pública do ELO para identificar sinais de recrutamento enganoso, tráfico de pessoas e trabalho escravo "
        "em ofertas de emprego, a partir de **texto** ou de **imagem** (panfletos, prints de posts). "
        "Cada alerta traz o trecho que o disparou e o fundamento (OIT, Código Penal, ONU). "
        "O resultado aponta sinais para verificar; **não afirma que houve crime**.\n\n"
        "Rotas `/v1/gestao/*` exigem o header `X-Elo-Admin-Key`."
    ),
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST", "PATCH", "OPTIONS"], allow_headers=["*"])

bridge = RulesBridge()
store = Store()
limiter = RateLimiter()
STATIC = Path(__file__).resolve().parent / "static"
ROOT = Path(__file__).resolve().parents[2]
SEED = json.loads((ROOT / "extension/data/seed.json").read_text(encoding="utf-8"))


# ---------------------------------------------------------------- modelos
class Perfil(BaseModel):
    """Área de interesse e região (painel da extensão). Gera notas, nunca muda o nível de risco."""
    areas: list[AREAS] = Field(default_factory=list, max_length=9)
    regioes: list[REGIOES] = Field(default_factory=list, max_length=7)
    origem_uf: str | None = Field(default=None, pattern=r"^[A-Za-z]{2}$")


class Vaga(BaseModel):
    title: str = Field(min_length=2, max_length=300, examples=["Atendente em Bangkok — US$ 2.500"])
    description: str | None = Field(default=None, max_length=8000)
    company: str | None = Field(default=None, max_length=200)
    location: str | None = Field(default=None, max_length=200)
    salary: str | None = Field(default=None, max_length=200)
    url: str | None = Field(default=None, max_length=2000)


class PedidoTexto(BaseModel):
    job: Vaga
    perfil: Perfil | None = None


class PedidoImagemBase64(BaseModel):
    image_base64: str = Field(max_length=7_200_000, description="Imagem PNG/JPEG/WEBP/GIF em base64 (até 5 MB)")
    texto: str | None = Field(default=None, max_length=3000, description="Legenda publicada junto com a imagem")
    url: str | None = Field(default=None, max_length=2000)
    perfil: Perfil | None = None


class Correcao(BaseModel):
    """Campos corrigidos pela gestão. Só os enviados são trocados; a análise é refeita."""
    title: str | None = Field(default=None, min_length=2, max_length=300)
    description: str | None = Field(default=None, max_length=8000)
    company: str | None = Field(default=None, max_length=200)
    location: str | None = Field(default=None, max_length=200)
    salary: str | None = Field(default=None, max_length=200)


# ---------------------------------------------------------------- utilidades
def _profile(p: Perfil | None) -> dict | None:
    return p.model_dump() if p else None


def _analyze(job: dict, perfil: dict | None) -> dict:
    job = {**job, "url": job.get("url") if (job.get("url") or "").startswith(("http://", "https://")) else "https://elo-api.local/texto"}
    try:
        return bridge.analyze(job, perfil)
    except RulesError as e:
        msg = str(e)
        raise HTTPException(status_code=400 if ("inválid" in msg or "ausente" in msg) else 500, detail=msg) from e


def _public(result: dict, analise_id: int) -> dict:
    return {"mode": "api", "mode_reason": "API ELO local", "api_analysis_id": analise_id, **result}


def require_admin(x_elo_admin_key: Annotated[str | None, Header()] = None) -> None:
    expected = os.environ.get("ELO_ADMIN_KEY")
    if not expected:
        raise HTTPException(status_code=503, detail="gestão desativada: defina ELO_ADMIN_KEY no .env")
    if not x_elo_admin_key or not hmac.compare_digest(x_elo_admin_key, expected):
        raise HTTPException(status_code=401, detail="chave de administrador inválida (header X-Elo-Admin-Key)")


def _analyze_image(data: bytes, texto: str | None, url: str | None, perfil: dict | None) -> dict:
    try:
        img, _mime = vision.load_image(data)
    except vision.ImageError as e:
        raise HTTPException(status_code=415 if "formato" in str(e) or "não é" in str(e) else 413 if "5 MB" in str(e) else 400, detail=str(e)) from e
    try:
        ex = vision.extract(img, texto, data)
    except vision.VisionUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    job = vision.job_from_extraction(ex, texto, url)
    result = _analyze(job, perfil)
    sha = hashlib.sha256(data).hexdigest()
    extraido = {"engine": ex.engine, "model": ex.model, "campos": ex.fields, "avisos": ex.warnings}
    aid = store.save(origem="imagem", job=job, result=result, engine=ex.engine, extraido=extraido, perfil=perfil,
                     imagem_sha256=sha, regioes=result.get("regions"))
    return {"extraido": extraido, "job": job, "analise": _public(result, aid), "imagem_sha256": sha}


# ---------------------------------------------------------------- rotas públicas
@app.get("/", include_in_schema=False)
def pagina_publica():
    return FileResponse(STATIC / "index.html")


@app.get("/health", tags=["público"])
def health():
    return {"ok": True, "version": VERSION, "leitores": {"claude": vision.claude_available(), "tesseract": vision.tesseract_available()},
            "gestao": bool(os.environ.get("ELO_ADMIN_KEY"))}


@app.get("/v1/indicadores", tags=["público"], summary="Regras usadas, severidade e base legal")
def indicadores():
    return bridge.indicators()


@app.post("/v1/analisar/texto", tags=["público"], summary="Analisa o texto de uma vaga", dependencies=[Depends(limiter)])
def analisar_texto(pedido: PedidoTexto):
    perfil = _profile(pedido.perfil)
    job = {**pedido.job.model_dump(), "source": "pagina"}
    result = _analyze(job, perfil)
    aid = store.save(origem="texto", job=job, result=result, perfil=perfil, regioes=result.get("regions"))
    return _public(result, aid)


@app.post("/v1/analisar/imagem", tags=["público"], summary="Lê a imagem de um anúncio (panfleto/print) e analisa", dependencies=[Depends(limiter)])
async def analisar_imagem(
    arquivo: Annotated[UploadFile, File(description="PNG, JPEG, WEBP ou GIF, até 5 MB")],
    texto: Annotated[str | None, Form(max_length=3000, description="Legenda do post")] = None,
    url: Annotated[str | None, Form(max_length=2000)] = None,
    perfil: Annotated[str | None, Form(description='JSON do perfil, ex.: {"areas":["atendimento"],"regioes":["sudeste_asiatico"]}')] = None,
):
    data = await arquivo.read(vision.MAX_BYTES + 1)
    p = None
    if perfil:
        try:
            p = _profile(Perfil.model_validate_json(perfil))
        except ValueError as e:
            raise HTTPException(status_code=422, detail="perfil inválido") from e
    return _analyze_image(data, texto, url, p)


@app.post("/v1/analisar/imagem/base64", tags=["público"], summary="Igual a /v1/analisar/imagem, com a imagem em base64 (JSON)", dependencies=[Depends(limiter)])
def analisar_imagem_base64(pedido: PedidoImagemBase64):
    import base64, binascii
    raw = pedido.image_base64.split(",", 1)[1] if pedido.image_base64.startswith("data:") else pedido.image_base64
    try:
        data = base64.b64decode(raw, validate=True)
    except (binascii.Error, ValueError) as e:
        raise HTTPException(status_code=400, detail="base64 inválido") from e
    return _analyze_image(data, pedido.texto, pedido.url, _profile(pedido.perfil))


# ---------------------------------------------------------------- relatos (alimentam a base de comparação)
CATEGORIAS = Literal["inconsistencia", "cobranca", "documentos", "pressao", "outro"]


class Relato(BaseModel):
    """Relato de anúncio suspeito, enviado pelo botão "Reportar" da extensão (ou por qualquer cliente)."""
    categoria: CATEGORIAS = "inconsistencia"
    texto: str | None = Field(default=None, max_length=2000, description="O que a pessoa percebeu (sem dados pessoais)")
    job: Vaga
    nivel: NIVEIS | None = None
    indicadores: list[str] = Field(default_factory=list, max_length=30)
    imagem_sha256: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")


def _reported_item(r: dict) -> dict:
    j = r["job"]
    return {"id": r["id"], "title": j.get("title"), "company": j.get("company"), "description": j.get("description") or "", "url": j.get("url"),
            "created_at": r["criado_em"], "status": r["status"], "category": r["categoria"]}


def _reported_snapshot():
    # base de comparação: tudo que não foi rejeitado pela moderação
    return [("reported_set", {"items": [_reported_item(r) for r in reversed(store.reports(limit=5000)) if r["status"] != "rejeitado"]})]


bridge.on_start = _reported_snapshot


@app.post("/v1/relatos", tags=["público"], summary="Reporta um anúncio suspeito e o adiciona à base de comparação", dependencies=[Depends(limiter)])
def reportar(rel: Relato):
    job = rel.job.model_dump()
    if not (job.get("url") or "").startswith(("http://", "https://")):
        job["url"] = None
    contatos = bridge.call("contacts", text=" ".join(filter(None, [job.get("title"), job.get("description")])))["keys"]
    # quantos relatos anteriores batem com este (texto parecido ou mesmo contato), antes de adicioná-lo
    similares = _analyze({**job, "url": job.get("url") or "https://elo-api.local/relato"}, None).get("community_notes", [])
    r = store.report(categoria=rel.categoria, texto=(rel.texto or "").strip() or None, job=job, nivel=rel.nivel,
                     indicadores=[i[:60] for i in rel.indicadores], imagem_sha256=rel.imagem_sha256, contatos=contatos)
    bridge.call("reported_add", item=_reported_item(r))
    return {"id": r["id"], "status": r["status"], "contatos": contatos, "parecidos_ja_reportados": similares,
            "message": f"Relato nº {r['id']} adicionado à base ELO. Anúncios parecidos ou com o mesmo contato passam a mostrar este relato."}


# ---------------------------------------------------------------- inscrição em alertas (landing page)
class Localizacao(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    precisao_m: float | None = Field(default=None, ge=0, le=1_000_000)


class Inscricao(BaseModel):
    """Tudo opcional, menos o consentimento. Enviado pela landing page (formulário de alertas)."""
    consentimento: Literal[True] = Field(description="A pessoa marcou que concorda em enviar estes dados")
    localizacao: Localizacao | None = None
    idioma: str | None = Field(default=None, max_length=20)
    idiomas: list[str] = Field(default_factory=list, max_length=10)
    fuso_horario: str | None = Field(default=None, max_length=60)
    telefone: str | None = Field(default=None, max_length=30)
    whatsapp_ok: bool | None = None
    email: str | None = Field(default=None, max_length=200, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    perfil: Perfil | None = None
    pagina: str | None = Field(default=None, max_length=300)
    referrer: str | None = Field(default=None, max_length=300)


# caixas aproximadas (lat_min, lat_max, lon_min, lon_max) — só para escolher canais de ajuda, não para localizar a pessoa
BOXES = [("brasil", "BR", -34.0, 5.5, -74.0, -34.0), ("sudeste_asiatico", "TH", -11.0, 28.5, 92.0, 141.0), ("europa", "EU", 35.0, 71.0, -25.0, 40.0),
         ("oriente_medio", "AE", 12.0, 42.0, 34.0, 63.0), ("america_do_norte", "US", 14.0, 72.0, -170.0, -52.0), ("america_do_sul", "SA", -56.0, 13.0, -82.0, -34.0),
         ("asia_leste", "CN", 18.0, 54.0, 73.0, 146.0)]
TZ_REGION = {"America/Sao_Paulo": "brasil", "America/Bahia": "brasil", "America/Fortaleza": "brasil", "America/Recife": "brasil", "America/Belem": "brasil",
             "America/Manaus": "brasil", "America/Cuiaba": "brasil", "America/Campo_Grande": "brasil", "America/Porto_Velho": "brasil", "America/Boa_Vista": "brasil",
             "America/Rio_Branco": "brasil", "America/Maceio": "brasil", "America/Araguaina": "brasil", "America/Noronha": "brasil", "America/Santarem": "brasil",
             "Asia/Bangkok": "sudeste_asiatico", "Asia/Phnom_Penh": "sudeste_asiatico", "Asia/Yangon": "sudeste_asiatico", "Asia/Rangoon": "sudeste_asiatico",
             "Asia/Vientiane": "sudeste_asiatico", "Asia/Manila": "sudeste_asiatico", "Asia/Ho_Chi_Minh": "sudeste_asiatico", "Asia/Kuala_Lumpur": "sudeste_asiatico",
             "Asia/Dubai": "oriente_medio", "Asia/Qatar": "oriente_medio", "Asia/Riyadh": "oriente_medio"}


def estimate_region(loc: Localizacao | None, tz: str | None) -> tuple[str | None, str | None]:
    if loc:
        for reg, code, la0, la1, lo0, lo1 in BOXES:
            if la0 <= loc.lat <= la1 and lo0 <= loc.lon <= lo1:
                return reg, code
    if tz:
        reg = TZ_REGION.get(tz) or ("europa" if tz.startswith("Europe/") else None)
        if reg:
            return reg, {"brasil": "BR", "sudeste_asiatico": "TH", "oriente_medio": "AE", "europa": "EU"}[reg]
    return None, None


@app.post("/v1/alertas/inscricao", tags=["público"], summary="Inscrição em alertas de vagas falsas (landing page)", dependencies=[Depends(limiter)])
def inscrever(i: Inscricao):
    regiao, pais = estimate_region(i.localizacao, i.fuso_horario)
    tel = "".join(ch for ch in (i.telefone or "") if ch.isdigit() or ch == "+")[:20] or None
    loc = i.localizacao
    iid = store.subscribe({
        "regiao_estimada": regiao, "pais_estimado": pais,
        # 3 casas decimais ≈ 100 m: suficiente para alertas regionais sem guardar o endereço exato
        "lat": round(loc.lat, 3) if loc else None, "lon": round(loc.lon, 3) if loc else None, "precisao_m": loc.precisao_m if loc else None,
        "idioma": i.idioma, "idiomas": ",".join(x[:20] for x in i.idiomas), "fuso_horario": i.fuso_horario,
        "telefone": tel, "whatsapp_ok": None if i.whatsapp_ok is None else int(i.whatsapp_ok), "email": i.email,
        "perfil_json": json.dumps(_profile(i.perfil), ensure_ascii=False) if i.perfil else None, "pagina": i.pagina, "referrer": i.referrer,
    })
    countries = ["TH", "INT", "BR"] if regiao == "sudeste_asiatico" else ["BR", "INT"] if regiao in (None, "brasil") else ["INT", "BR"]
    canais = sorted([s for s in SEED["supportResources"] if s["country"] in countries and s["support_type"] in ("denuncia", "emergencia_exterior", "orientacao", "assistencia")],
                    key=lambda s: countries.index(s["country"]))[:6]
    return {"id": iid, "regiao_estimada": regiao, "pais_estimado": pais,
            "canais": [{k: s.get(k) for k in ("institution", "phone", "official_url", "description")} for s in canais]}


# ---------------------------------------------------------------- gestão (chave de administrador)
class Moderacao(BaseModel):
    status: Literal["pendente", "aprovado", "rejeitado"]


@app.get("/v1/gestao/relatos", tags=["gestão"], dependencies=[Depends(require_admin)])
def listar_relatos(status: Literal["pendente", "aprovado", "rejeitado"] | None = None, limit: int = 200):
    return {"itens": store.reports(status, limit)}


@app.patch("/v1/gestao/relatos/{relato_id}", tags=["gestão"], summary="Modera um relato (rejeitado sai da base de comparação)", dependencies=[Depends(require_admin)])
def moderar_relato(relato_id: int, m: Moderacao):
    if not store.get_report(relato_id):
        raise HTTPException(status_code=404, detail="relato não encontrado")
    store.set_report_status(relato_id, m.status)
    for a, p in _reported_snapshot():
        bridge.call(a, **p)
    return store.get_report(relato_id)


@app.get("/v1/gestao/inscricoes", tags=["gestão"], dependencies=[Depends(require_admin)])
def listar_inscricoes(limit: int = 200):
    return {"itens": store.subscriptions(limit)}


@app.get("/v1/gestao/analises", tags=["gestão"], dependencies=[Depends(require_admin)])
def listar(nivel: NIVEIS | None = None, regiao: REGIOES | None = None, q: Annotated[str | None, Query(max_length=100)] = None,
           limit: int = 100, offset: int = 0):
    return {"resumo": store.summary(), "itens": store.list(nivel=nivel, regiao=regiao, q=q, limit=limit, offset=offset)}


@app.get("/v1/gestao/analises.csv", tags=["gestão"], dependencies=[Depends(require_admin)])
def exportar_csv(nivel: NIVEIS | None = None, regiao: REGIOES | None = None):
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["id", "criado_em", "origem", "engine", "nivel", "titulo", "empresa", "regioes", "indicadores", "url", "imagem_sha256"])
    for r in store.list(nivel=nivel, regiao=regiao, limit=500):
        w.writerow([r["id"], r["criado_em"], r["origem"], r["engine"] or "", r["nivel"], r["titulo"] or "", r["empresa"] or "",
                    " ".join(r["regioes"]), " ".join(r["indicadores"]), r["url"] or "", r["imagem_sha256"] or ""])
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": 'attachment; filename="elo-analises.csv"'})


@app.get("/v1/gestao/analises/{analise_id}", tags=["gestão"], dependencies=[Depends(require_admin)])
def detalhe(analise_id: int):
    d = store.get(analise_id)
    if not d:
        raise HTTPException(status_code=404, detail="análise não encontrada")
    return d


@app.patch("/v1/gestao/analises/{analise_id}", tags=["gestão"], summary="Corrige campos extraídos e refaz a análise", dependencies=[Depends(require_admin)])
def corrigir(analise_id: int, correcao: Correcao):
    d = store.get(analise_id)
    if not d:
        raise HTTPException(status_code=404, detail="análise não encontrada")
    mudancas = correcao.model_dump(exclude_unset=True)
    if not mudancas:
        raise HTTPException(status_code=422, detail="nenhum campo para corrigir")
    antes = d["job"]
    depois = {**antes, **{k: (v.strip() or None) if isinstance(v, str) else v for k, v in mudancas.items()}}
    if not depois.get("title"):
        raise HTTPException(status_code=422, detail="título não pode ficar vazio")
    result = _analyze(depois, d["perfil"])
    store.correct(analise_id, job_antes=antes, job_depois=depois, nivel_antes=d["nivel"], result=result, regioes=result.get("regions") or [])
    return {"nivel_antes": d["nivel"], "analise": _public(result, analise_id), "job": depois}


# ---------------------------------------------------------------- versão online (ngrok): demo e landing page no mesmo endereço
# `ngrok http 8787` publica a API, as redes simuladas (/demo/social/mural.html, /demo/social/redepro.html) e a LP (/lp/).
@app.get("/demo", include_in_schema=False)
def _demo_redirect():
    return RedirectResponse("/demo/")


@app.get("/lp", include_in_schema=False)
def _lp_redirect():
    return RedirectResponse("/lp/")


app.mount("/demo", StaticFiles(directory=ROOT / "demo", html=True), name="demo")
app.mount("/lp", StaticFiles(directory=ROOT / "site", html=True), name="lp")
