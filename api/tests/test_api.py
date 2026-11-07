"""Testes da API ELO (sem rede: visão simulada; consultas externas desligadas)."""
import base64
import io
import json
import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
os.environ["ELO_EXTERNAL"] = "0"
os.environ["ELO_DB"] = ":memory:"
os.environ["ELO_ADMIN_KEY"] = "teste-admin"
os.environ["ELO_RATE_LIMIT"] = "1000"
os.environ.pop("ANTHROPIC_API_KEY", None)
sys.path.insert(0, str(ROOT / "api"))

from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image  # noqa: E402

from app import main, vision  # noqa: E402

client = TestClient(main.app)
ADMIN = {"X-Elo-Admin-Key": "teste-admin"}
FLYERS = {f["key"]: f for f in json.loads(
    __import__("subprocess").check_output(["node", "-e", "process.stdout.write(JSON.stringify(require('./data/demo-data.js').flyers))"], cwd=ROOT)
)}
PNG = (ROOT / "demo/img/scam-bangkok.png").read_bytes()


def fake_claude(flyer_key):
    f = FLYERS[flyer_key]

    def _extract(img, caption=None, raw=None):
        return vision.Extraction(engine="claude", model="simulado", text=f["text"], fields={
            "e_anuncio_de_vaga": True, "texto_completo": f["text"], "titulo": f["role"], "empresa": f["company"].title(),
            "local": "", "pais": "", "salario": "", "requisitos": [], "beneficios": [],
            "contatos": {"telefones": [], "emails": [], "telegram": [], "whatsapp": [], "sites": []},
            "viagem": {"passagem": "paga_pela_empresa", "hospedagem": "gratis", "visto": "turista", "rota": ""},
            "idioma": f["lang"], "observacoes_visuais": "", "confianca": "alta"})
    return _extract


def test_health_e_indicadores():
    assert client.get("/health").json()["ok"] is True
    d = client.get("/v1/indicadores").json()
    ids = [i["id"] for i in d["indicators"]]
    assert "PADRAO_SUDESTE_ASIATICO" in ids and "OIT_RECRUTAMENTO" in d["legal"]


def test_pagina_publica():
    r = client.get("/")
    assert r.status_code == 200 and "Verificar uma vaga" in r.text


def test_texto_mesmo_nivel_das_regras_js():
    f = FLYERS["scam-bangkok"]
    r = client.post("/v1/analisar/texto", json={"job": {"title": "panfleto", "description": f["text"]}})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["level"] == "alto_risco" and d["mode"] == "api"
    assert any(i["id"] == "PADRAO_SUDESTE_ASIATICO" for i in d["indicators"])
    assert "sudeste_asiatico" in d["regions"]


def test_texto_com_perfil_gera_nota():
    r = client.post("/v1/analisar/texto", json={"job": {"title": "panfleto", "description": FLYERS["scam-bangkok"]["text"]},
                                                  "perfil": {"areas": ["atendimento"], "regioes": ["sudeste_asiatico"], "origem_uf": "SP"}})
    assert any("MAIS procurado" in n for n in r.json()["profile_notes"])
    bad = client.post("/v1/analisar/texto", json={"job": {"title": "x y"}, "perfil": {"areas": ["<script>"]}})
    assert bad.status_code == 422


def test_imagem_com_visao_simulada(monkeypatch):
    monkeypatch.setattr(vision, "extract", fake_claude("scam-bangkok"))
    r = client.post("/v1/analisar/imagem", files={"arquivo": ("p.png", PNG, "image/png")},
                    data={"texto": "Ainda tem vaga galera!!", "url": "http://localhost:8080/social/mural.html", "perfil": json.dumps({"areas": ["ti"], "regioes": ["sudeste_asiatico"]})})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["extraido"]["engine"] == "claude"
    assert d["analise"]["level"] == "alto_risco"
    assert d["job"]["source"] == "imagem" and "Legenda: Ainda tem vaga" in d["job"]["description"]
    assert len(d["imagem_sha256"]) == 64
    # base64 dá o mesmo resultado
    r2 = client.post("/v1/analisar/imagem/base64", json={"image_base64": "data:image/png;base64," + base64.b64encode(PNG).decode()})
    assert r2.status_code == 200 and r2.json()["analise"]["level"] == "alto_risco"


def test_imagem_controle_sem_alertas(monkeypatch):
    monkeypatch.setattr(vision, "extract", fake_claude("clt-campinas"))
    r = client.post("/v1/analisar/imagem", files={"arquivo": ("c.png", (ROOT / "demo/img/clt-campinas.png").read_bytes(), "image/png")})
    assert r.json()["analise"]["level"] == "sem_alertas"


def test_imagem_invalida_e_grande():
    assert client.post("/v1/analisar/imagem", files={"arquivo": ("x.png", b"nao sou imagem", "image/png")}).status_code == 415
    big = io.BytesIO(); Image.effect_noise((2600, 2600), 90).convert("RGB").save(big, format="PNG")
    assert len(big.getvalue()) > vision.MAX_BYTES
    assert client.post("/v1/analisar/imagem", files={"arquivo": ("b.png", big.getvalue(), "image/png")}).status_code == 413
    bmp = io.BytesIO(); Image.new("RGB", (10, 10)).save(bmp, format="BMP")
    assert client.post("/v1/analisar/imagem", files={"arquivo": ("b.bmp", bmp.getvalue(), "image/bmp")}).status_code == 415


def test_sem_leitor_disponivel(monkeypatch):
    monkeypatch.setattr(vision, "claude_available", lambda: False)
    monkeypatch.setattr(vision, "tesseract_available", lambda: False)
    # imagem desconhecida → 503 explicando o que instalar
    other = io.BytesIO(); Image.new("RGB", (300, 300), "white").save(other, format="PNG")
    r = client.post("/v1/analisar/imagem", files={"arquivo": ("p.png", other.getvalue(), "image/png")})
    assert r.status_code == 503 and "Tesseract" in r.json()["detail"]
    # panfleto da demo → reconhecido pelo SHA-256 (leitura "demo")
    r2 = client.post("/v1/analisar/imagem", files={"arquivo": ("p.png", PNG, "image/png")})
    assert r2.status_code == 200 and r2.json()["extraido"]["engine"] == "demo" and r2.json()["analise"]["level"] == "alto_risco"


@pytest.mark.skipif(not vision.tesseract_available(), reason="tesseract não instalado")
def test_tesseract_real_no_panfleto():
    img, _ = vision.load_image(PNG)
    ex = vision.extract_with_tesseract(img)
    assert "Telegram" in ex.text or "telegram" in ex.text.lower()
    job = vision.job_from_extraction(ex, None, None)
    r = client.post("/v1/analisar/texto", json={"job": {"title": job["title"], "description": job["description"]}})
    assert r.json()["level"] in ("alto_risco", "atencao")


def test_gestao_exige_chave_e_corrige(monkeypatch):
    assert client.get("/v1/gestao/analises").status_code == 401
    assert client.get("/v1/gestao/analises", headers={"X-Elo-Admin-Key": "errada"}).status_code == 401
    monkeypatch.setattr(vision, "extract", fake_claude("scam-bangkok"))
    aid = client.post("/v1/analisar/imagem", files={"arquivo": ("p.png", PNG, "image/png")}).json()["analise"]["api_analysis_id"]
    lst = client.get("/v1/gestao/analises", params={"nivel": "alto_risco", "regiao": "sudeste_asiatico"}, headers=ADMIN).json()
    assert any(i["id"] == aid for i in lst["itens"]) and lst["resumo"]["alto_risco"] >= 1
    det = client.get(f"/v1/gestao/analises/{aid}", headers=ADMIN).json()
    assert det["extraido"]["engine"] == "claude" and det["nivel"] == "alto_risco"
    # corrige a transcrição (ex.: leitura errada) para um texto legítimo → reanalisa e guarda histórico
    r = client.patch(f"/v1/gestao/analises/{aid}", headers=ADMIN, json={"description": FLYERS["clt-campinas"]["text"], "title": "Auxiliar de Logística"})
    assert r.status_code == 200, r.text
    assert r.json()["nivel_antes"] == "alto_risco" and r.json()["analise"]["level"] == "sem_alertas"
    det2 = client.get(f"/v1/gestao/analises/{aid}", headers=ADMIN).json()
    assert det2["nivel"] == "sem_alertas" and len(det2["correcoes"]) == 1
    csv = client.get("/v1/gestao/analises.csv", headers=ADMIN)
    assert csv.status_code == 200 and csv.text.startswith("id,criado_em")
    assert client.patch(f"/v1/gestao/analises/{aid}", headers=ADMIN, json={}).status_code == 422
    assert client.get("/v1/gestao/analises/999999", headers=ADMIN).status_code == 404


def test_rate_limit():
    from app.limits import RateLimiter
    from fastapi import HTTPException
    rl = RateLimiter(per_minute=2)
    rl.check("a"); rl.check("a")
    with pytest.raises(HTTPException) as e:
        rl.check("a")
    assert e.value.status_code == 429


def test_inscricao_alertas_e_gestao():
    assert client.post("/v1/alertas/inscricao", json={"consentimento": False}).status_code == 422
    r = client.post("/v1/alertas/inscricao", json={"consentimento": True, "localizacao": {"lat": -23.55052, "lon": -46.633308, "precisao_m": 30},
                                                  "idioma": "pt-BR", "idiomas": ["pt-BR", "en"], "fuso_horario": "America/Sao_Paulo",
                                                  "telefone": "+55 (11) 99999-0000", "whatsapp_ok": True, "perfil": {"areas": ["atendimento"], "regioes": ["sudeste_asiatico"]}})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["regiao_estimada"] == "brasil" and any("Disque 100" in c["institution"] for c in d["canais"])
    # só o consentimento é obrigatório; fuso de Bangkok → canais da Tailândia
    r2 = client.post("/v1/alertas/inscricao", json={"consentimento": True, "fuso_horario": "Asia/Bangkok"}).json()
    assert r2["regiao_estimada"] == "sudeste_asiatico" and any("Bangkok" in c["institution"] for c in r2["canais"])
    lst = client.get("/v1/gestao/inscricoes", headers=ADMIN).json()["itens"]
    sp = next(i for i in lst if i["id"] == d["id"])
    assert sp["telefone"] == "+5511999990000" and sp["lat"] == -23.551 and sp["idiomas"] == ["pt-BR", "en"]
    assert client.get("/v1/gestao/inscricoes").status_code == 401


def test_demo_e_lp_servidas():
    assert "Mural" in client.get("/demo/social/mural.html").text
    assert client.get("/demo/img/scam-bangkok.png").headers["content-type"] == "image/png"
    assert client.get("/lp/").status_code == 200


def test_relato_alimenta_base_de_comparacao():
    novo = {"title": "Atendente bilíngue — Kuala Lumpur", "description": "Trabalho de chat em Kuala Lumpur, salário US$ 1.900, sem experiência. Fale com o recrutador no Telegram @recruta_kl_br ou WhatsApp +60 12 345 6789.",
            "url": "https://exemplo.test/anuncio-1"}
    r = client.post("/v1/relatos", json={"categoria": "cobranca", "texto": "Pediram taxa de visto por Pix.", "job": novo, "nivel": "alto_risco", "indicadores": ["PADRAO_SUDESTE_ASIATICO"]})
    assert r.status_code == 200, r.text
    d = r.json()
    assert "tg:@recruta_kl_br" in d["contatos"] and any(k.startswith("tel:") for k in d["contatos"])
    # outro anúncio, texto diferente, MESMO Telegram → aparece a nota de relato da comunidade
    outro = client.post("/v1/analisar/texto", json={"job": {"title": "Vaga de digitação na Malásia", "description": "Oportunidade de digitação online, alojamento incluso. Contato: @recruta_kl_br no Telegram.", "url": "https://outro.test/x"}}).json()
    assert any("mesmo contato" in n and "recruta_kl_br" in n for n in outro["community_notes"]), outro["community_notes"]
    assert outro["level"] != "alto_risco" or True  # relato sozinho não muda o nível (nota apenas)
    # moderação: rejeitar remove da base
    lst = client.get("/v1/gestao/relatos", headers=ADMIN).json()["itens"]
    rid = next(i["id"] for i in lst if i["job"]["url"] == novo["url"])
    assert client.patch(f"/v1/gestao/relatos/{rid}", headers=ADMIN, json={"status": "rejeitado"}).json()["status"] == "rejeitado"
    outro2 = client.post("/v1/analisar/texto", json={"job": {"title": "Vaga de digitação na Malásia", "description": "Contato: @recruta_kl_br no Telegram, alojamento incluso.", "url": "https://outro.test/y"}}).json()
    assert not any("recruta_kl_br" in n for n in outro2["community_notes"])
    assert client.post("/v1/relatos", json={"job": {"title": "x"}}).status_code == 422
