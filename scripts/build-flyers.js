#!/usr/bin/env node
// Gera os panfletos PNG da demonstração (demo/img/*.png) a partir de data/demo-data.js (flyers).
// Usa o Chrome/Chromium headless já instalado (sem dependências npm). Os PNGs vão para o Git,
// então a demo funciona sem rodar este script; rode de novo só se mudar o texto dos panfletos.
//   node scripts/build-flyers.js            (procura google-chrome / chromium no PATH)
//   CHROME=/caminho/do/chrome node scripts/build-flyers.js
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
const D = require('../data/demo-data.js');

const out = path.join(__dirname, '..', 'demo', 'img');
fs.mkdirSync(out, { recursive: true });
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  for (const c of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    try { execFileSync('which', [c], { stdio: 'pipe' }); return c; } catch {}
  }
  throw new Error('Chrome/Chromium não encontrado. Defina CHROME=/caminho/do/chrome');
}

const THEMES = {
  asia: { bg: 'linear-gradient(160deg,#7c2d12 0%,#ea580c 55%,#fbbf24 100%)', card: '#fff7ed', ink: '#431407', accent: '#c2410c' },
  asia2: { bg: 'linear-gradient(160deg,#0f172a 0%,#1e3a8a 55%,#f59e0b 100%)', card: '#fffbeb', ink: '#0f172a', accent: '#b45309' },
  office: { bg: 'linear-gradient(160deg,#1e3a8a 0%,#2563eb 60%,#93c5fd 100%)', card: '#ffffff', ink: '#0f172a', accent: '#1d4ed8' }
};

function html(f) {
  const t = THEMES[f.theme] || THEMES.office;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0} html,body{width:720px;height:960px}
  body{background:${t.bg};font-family:"Noto Sans","DejaVu Sans",Arial,sans-serif;color:${t.ink};padding:36px;display:flex;flex-direction:column;gap:18px}
  .title{font-size:52px;font-weight:900;color:#fff;text-align:center;letter-spacing:.5px;text-shadow:0 3px 0 rgba(0,0,0,.25);line-height:1.05}
  .company{font-size:24px;font-weight:800;color:#fff;text-align:center;letter-spacing:3px;opacity:.95}
  .card{background:${t.card};border-radius:22px;padding:26px 28px;box-shadow:0 10px 30px rgba(0,0,0,.25);flex:1;display:flex;flex-direction:column;gap:11px}
  .role{font-size:28px;font-weight:800;color:${t.accent};text-align:center;margin-bottom:6px}
  .line{font-size:23px;font-weight:600;line-height:1.3}
  .contact{margin-top:auto;font-size:25px;font-weight:800;background:${t.accent};color:#fff;border-radius:14px;padding:14px 16px;text-align:center}
  .footer{font-size:20px;font-weight:700;color:#fff;text-align:center}
  </style></head><body>
  <div class="title">${esc(f.title)}</div><div class="company">${esc(f.company)}</div>
  <div class="card"><div class="role">${esc(f.role)}</div>${f.lines.map((l) => `<div class="line">${esc(l)}</div>`).join('')}<div class="contact">${esc(f.contact)}</div></div>
  <div class="footer">${esc(f.footer)}</div>
  </body></html>`;
}

const chrome = findChrome();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'elo-flyers-'));
for (const f of D.flyers) {
  const src = path.join(tmp, f.key + '.html');
  fs.writeFileSync(src, html(f));
  const png = path.join(out, f.key + '.png');
  execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--window-size=720,960', '--screenshot=' + png, 'file://' + src], { stdio: 'pipe' });
  console.log('ok:', path.relative(process.cwd(), png));
}
fs.rmSync(tmp, { recursive: true, force: true });

// índice dos panfletos: a API reconhece estas imagens pelo SHA-256 (leitura "demo", sem chave nem OCR)
const crypto = require('crypto');
const index = D.flyers.map((f) => ({ key: f.key, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(out, f.key + '.png'))).digest('hex'),
  lang: f.lang, title: f.role, company: f.company, text: f.text }));
fs.writeFileSync(path.join(out, 'flyers.json'), JSON.stringify(index, null, 1) + '\n');
console.log('ok: demo/img/flyers.json');
