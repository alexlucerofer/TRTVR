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
// ícones desenhados (SVG, sem emoji) para cada linha do panfleto
const ICON = {
  money: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 9v.01M18 15v.01"/>',
  check: '<circle cx="12" cy="12" r="10" fill="currentColor" stroke="none"/><path d="M7 12.5l3.2 3.2L17 9" stroke="#fff"/>',
  plane: '<path d="M10.5 13.5L3 11l1.5-2 8 1 4.5-5a2 2 0 013 3l-5 4.5 1 8-2 1.5-2.5-7.5-3.5 3V20l-1.5 1-1-3.5L3 16.5 4 15h2.5z"/>',
  passport: '<rect x="5" y="2" width="14" height="20" rx="2"/><circle cx="12" cy="10" r="3.2"/><path d="M8.5 17h7"/>',
  van: '<path d="M2 16V7a1 1 0 011-1h11l5 4h2a1 1 0 011 1v5h-2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M9 17h6M14 6v4h5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pin: '<path d="M12 22s7-6.3 7-12a7 7 0 10-14 0c0 5.7 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  doc: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>',
  building: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M10 21v-3h4v3"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>'
};
const ico = (k) => k && ICON[k] ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>` : '';
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
  .line{font-size:23px;font-weight:600;line-height:1.3;display:flex;gap:12px;align-items:flex-start} .line svg,.contact svg{flex:none;width:28px;height:28px;margin-top:-1px} .line svg{color:${t.accent}}
  .contact{display:flex;gap:10px;align-items:center;justify-content:center}
  .contact{margin-top:auto;font-size:25px;font-weight:800;background:${t.accent};color:#fff;border-radius:14px;padding:14px 16px;text-align:center}
  .footer{font-size:20px;font-weight:700;color:#fff;text-align:center}
  </style></head><body>
  <div class="title">${esc(f.title)}</div><div class="company">${esc(f.company)}</div>
  <div class="card"><div class="role">${esc(f.role)}</div>${f.lines.map((l, i) => `<div class="line">${ico((f.icons || [])[i])}<span>${esc(l)}</span></div>`).join('')}<div class="contact">${ico(f.contactIcon)}<span>${esc(f.contact)}</span></div></div>
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
