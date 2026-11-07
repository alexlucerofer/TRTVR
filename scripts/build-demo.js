#!/usr/bin/env node
// Gera a "internet simulada" da demonstração a partir de data/demo-data.js:
//   demo/index.html  · demo/busca.html (buscador) · demo/feed.html (rede social)
//   demo/vagas.html (portal) · demo/vaga/*.html (página de cada vaga com JSON-LD, como portais reais)
//   demo/social/mural.html (rede social estilo feed/grupos) · demo/social/redepro*.html (rede profissional)
//   demo/img/*.png: panfletos gerados por scripts/build-flyers.js (preservados entre builds)
// Marcas próprias e fictícias ("Procura", "Conecta", "VagasJá", "Mural", "RedePro") — não imitam marcas reais.
const fs = require('fs'), path = require('path');
const D = require('../data/demo-data.js');
const R = require('../shared/rules.js');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const root = path.join(__dirname, '..', 'demo');
// apaga o HTML gerado, mas mantém demo/img (panfletos PNG versionados)
for (const f of fs.existsSync(root) ? fs.readdirSync(root) : []) if (f !== 'img') fs.rmSync(path.join(root, f), { recursive: true, force: true });
fs.mkdirSync(path.join(root, 'vaga'), { recursive: true });
fs.mkdirSync(path.join(root, 'social'), { recursive: true });
// imagem de panfleto: alt genérico, como as redes reais geram ("Pode ser uma imagem de texto") — o texto só existe na imagem
const flyerImg = (key, base, cls = 'flyer') => `<img class="${cls}" src="${base}img/${key}.png" width="720" height="960" alt="Pode ser uma imagem de texto" loading="eager" data-elo-flyer>`;

// ---------- ilustrações (SVG próprio, sem fotos de pessoas reais)
const ART = {
  asia: ['#fde68a', '#f97316', '<circle cx="250" cy="70" r="34" fill="#fff7ed"/><path d="M0 170 L40 120 L60 140 L90 90 L120 150 L150 110 L190 160 L230 100 L270 150 L320 120 L320 200 L0 200Z" fill="#7c2d12" opacity=".85"/><path d="M60 60 l70 18 l20 -8 l6 6 l-18 12 l-4 22 l-8 2 l-2 -18 l-60 -8z" fill="#fff"/>'],
  farm: ['#bbf7d0', '#15803d', '<circle cx="260" cy="60" r="28" fill="#fef9c3"/><path d="M0 150 Q80 120 160 150 T320 140 L320 200 L0 200Z" fill="#166534"/><rect x="60" y="100" width="70" height="50" fill="#92400e"/><path d="M55 100 L95 70 L135 100Z" fill="#7f1d1d"/><path d="M160 150 l0 -30 M175 150 l0 -30 M190 150 l0 -30 M205 150 l0 -30 M155 128 L215 128" stroke="#fef3c7" stroke-width="3"/>'],
  office: ['#dbeafe', '#1d4ed8', '<rect x="40" y="60" width="240" height="110" rx="10" fill="#fff"/><rect x="60" y="80" width="110" height="70" rx="6" fill="#bfdbfe"/><circle cx="220" cy="100" r="18" fill="#1d4ed8"/><rect x="195" y="125" width="50" height="25" rx="10" fill="#1d4ed8"/><rect x="60" y="160" width="200" height="6" rx="3" fill="#93c5fd"/>'],
  europe: ['#e0e7ff', '#4338ca', '<circle cx="60" cy="60" r="26" fill="#fff"/><path d="M30 190 L30 110 L70 80 L110 110 L110 190Z M130 190 L130 90 L175 60 L220 90 L220 190Z M240 190 L240 120 L270 100 L300 120 L300 190Z" fill="#4338ca" opacity=".85"/><path d="M180 40 l60 14 l16 -6 l5 5 l-15 10 l-3 18 l-7 2 l-2 -15 l-50 -7z" fill="#fff"/>'],
  desert: ['#fef3c7', '#b45309', '<circle cx="250" cy="60" r="30" fill="#fffbeb"/><path d="M0 170 Q100 140 200 165 T320 160 L320 200 L0 200Z" fill="#d97706"/><path d="M150 170 L158 40 L166 170Z" fill="#78350f"/><rect x="185" y="100" width="22" height="70" fill="#92400e"/><rect x="100" y="115" width="26" height="55" fill="#92400e"/>'],
  kitchen: ['#ffe4e6', '#be123c', '<rect x="40" y="120" width="240" height="60" rx="8" fill="#fff"/><path d="M120 120 Q120 70 160 70 Q200 70 200 120Z" fill="#fff"/><rect x="130" y="55" width="60" height="22" rx="10" fill="#fff"/><circle cx="90" cy="150" r="14" fill="#be123c"/><circle cx="230" cy="150" r="14" fill="#be123c"/>'],
  news: ['#f1f5f9', '#334155', '<rect x="50" y="40" width="220" height="130" rx="8" fill="#fff"/><rect x="70" y="60" width="120" height="14" rx="3" fill="#334155"/><rect x="70" y="86" width="180" height="8" rx="3" fill="#cbd5e1"/><rect x="70" y="102" width="180" height="8" rx="3" fill="#cbd5e1"/><rect x="70" y="118" width="140" height="8" rx="3" fill="#cbd5e1"/><rect x="70" y="140" width="90" height="16" rx="8" fill="#ef4444"/>'],
};
const art = (k, label) => { const [a, b, g] = ART[k] || ART.office; return `<svg viewBox="0 0 320 200" role="img" aria-label="${esc(label || 'ilustração')}" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g${k}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}" stop-opacity=".55"/></linearGradient></defs><rect width="320" height="200" fill="url(#g${k})"/>${g}</svg>`; };
const ARTOF = { v11: 'asia', v1: 'office', v2: 'farm', v3: 'office', v4: 'asia', v5: 'farm', v6: 'kitchen', v7: 'desert', v8: 'asia', v9: 'asia', v10: 'europe' };
const COLORS = ['#2563eb', '#16a34a', '#db2777', '#ea580c', '#7c3aed', '#0891b2', '#ca8a04'];
const avatar = (name, size = 40) => { const i = name.replace(/\(.*?\)/g, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase(); const c = COLORS[[...name].reduce((s, ch) => s + ch.charCodeAt(0), 0) % COLORS.length]; return `<span class="av" style="width:${size}px;height:${size}px;background:${c};font-size:${size * 0.4}px">${esc(i)}</span>`; };

const css = `:root{--bg:#f3f4f6;--card:#fff;--ink:#111827;--muted:#6b7280;--line:#e5e7eb;--accent:#1a56db}
*{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
a{color:var(--accent)} .top{background:#fff;border-bottom:1px solid var(--line);padding:10px 16px;display:flex;gap:14px;align-items:center;flex-wrap:wrap;position:sticky;top:0;z-index:5}
.brand{font-weight:800;font-size:20px;letter-spacing:-.02em;text-decoration:none;color:var(--ink)} .top nav{margin-left:auto;display:flex;gap:14px;font-size:14px}
.warn{background:#fffbeb;color:#92400e;padding:7px 16px;font-size:12.5px;border-bottom:1px solid #fde68a}
main{max-width:720px;margin:18px auto;padding:0 16px} .card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:14px}
h1{font-size:24px;line-height:1.25;margin:0 0 6px} h2{font-size:18px;margin:0 0 4px} .meta{color:var(--muted);font-size:13.5px}
.btn{display:inline-block;background:#111827;color:#fff;border:0;border-radius:8px;padding:10px 16px;font:600 15px system-ui;cursor:pointer;text-decoration:none}
.av{display:inline-grid;place-items:center;border-radius:50%;color:#fff;font-weight:700;flex:none}
svg{display:block;width:100%;height:auto;border-radius:10px} dialog{border:0;border-radius:12px;max-width:480px;padding:20px} dialog::backdrop{background:rgba(17,24,39,.45)}
img.flyer{display:block;width:100%;height:auto;border-radius:10px} .pattern{font-size:13px;color:var(--muted);border-top:1px solid var(--line);margin-top:16px;padding-top:10px}
/* buscador */
.sbar{display:flex;gap:8px;flex:1;max-width:560px} .sbar input{flex:1;padding:10px 16px;border:1px solid #d1d5db;border-radius:999px;font:inherit;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.tabs{display:flex;gap:18px;max-width:720px;margin:0 auto;padding:8px 16px 0;font-size:14px} .tabs button{border:0;background:none;padding:8px 2px;font:inherit;color:var(--muted);cursor:pointer;border-bottom:3px solid transparent} .tabs button[aria-pressed=true]{color:var(--accent);border-color:var(--accent);font-weight:600}
.count{max-width:720px;margin:6px auto 0;padding:0 16px;font-size:13px;color:var(--muted)}
.result{margin:0 0 26px} .site{display:flex;gap:10px;align-items:center;font-size:13px} .site b{display:block;font-weight:500;color:var(--ink)} .result h3{font-size:19px;font-weight:500;margin:4px 0 2px;color:var(--accent)} .result a{text-decoration:none} .result a:hover h3{text-decoration:underline}
.chips{display:flex;gap:6px;flex-wrap:wrap;margin:4px 0} .chip{font-size:12px;background:#eef2ff;color:#3730a3;border-radius:999px;padding:2px 8px}
/* rede social */
.post{background:#fff;border:1px solid var(--line);border-radius:12px;margin-bottom:14px;overflow:hidden} .post .ph{display:flex;gap:10px;align-items:center;padding:12px 14px 6px} .post .ph b{display:block;font-size:15px} .post .tx{padding:4px 14px 10px;white-space:pre-line}
.post svg{border-radius:0} .post .ft{display:flex;justify-content:space-between;padding:8px 14px;font-size:13px;color:var(--muted);border-top:1px solid var(--line)} .post .lk{display:block;padding:10px 14px;font-weight:600;text-decoration:none}
.preview{display:block;margin:0 14px 12px;border:1px solid var(--line);border-radius:10px;overflow:hidden;text-decoration:none;color:var(--ink)} .preview div{padding:10px 12px} .preview small{color:var(--muted);text-transform:uppercase;font-size:11px}
.compose{display:flex;gap:10px;align-items:center} .compose span.ph{flex:1;background:#f3f4f6;border-radius:999px;padding:10px 14px;color:var(--muted)}
/* página da vaga */
.job-head{display:flex;gap:12px;align-items:center;margin:14px 0} .facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:12px 0} .facts div{background:#f9fafb;border-radius:8px;padding:8px 10px;font-size:13.5px} .facts b{display:block;font-size:12px;color:var(--muted);font-weight:500}`;
const nav = (base) => `<nav><a href="${base}index.html">Início</a><a href="${base}busca.html">Procura</a><a href="${base}feed.html">Conecta</a><a href="${base}social/mural.html">Mural</a><a href="${base}social/redepro.html">RedePro</a><a href="${base}vagas.html">VagasJá</a></nav>`;
const page = (title, body, base = '', extra = {}) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${css}${extra.css || ''}</style></head><body${extra.bodyAttr || ''}>${body.replaceAll('{{NAV}}', nav(base))}</body></html>`;
const WARN = '<div class="warn">Simulação para demonstrar o ELO. Marcas, empresas e vagas são FICTÍCIAS; os textos seguem padrões reais documentados (OIT, ONU, Itamaraty, Polícia Federal). Links de notícias, portais e canais oficiais são REAIS.</div>';

const levels = Object.fromEntries(D.demoJobs.map((j) => [j.key, R.analyze({ title: j.title, company: j.company_name, description: j.description, location: j.location, salary: j.salary, url: j.url }).level]));

// ---------- notícias reais (links verdadeiros)
const NEWS = [
  { site: 'SBT News', title: 'Itamaraty alerta para falsas ofertas de emprego que mascaram tráfico de brasileiros na Ásia', url: 'https://sbtnews.sbt.com.br/noticia/brasil/itamaraty-alerta-para-falsas-ofertas-de-emprego-que-mascaram-trafico-de-brasileiros-na-asia', snippet: 'Alerta do Ministério das Relações Exteriores sobre aliciamento por anúncios falsos no Sudeste Asiático.' },
  { site: 'Polícia Federal — gov.br', title: 'PF combate tráfico internacional de brasileiros para centros de golpes no Sudeste Asiático', url: 'https://www.gov.br/pf/pt-br/assuntos/noticias/2026/07/pf-combate-trafico-internacional-de-brasileiros-para-centros-de-golpes-no-sudeste-asiatico', snippet: 'Notícia oficial da Polícia Federal, julho de 2026.' },
  { site: 'Poder360', title: 'Sudeste Asiático concentra casos de tráfico de brasileiros', url: 'https://www.poder360.com.br/poder-internacional/sudeste-asiatico-concentra-casos-de-trafico-de-brasileiros/', snippet: 'Reportagem sobre casos de brasileiros traficados para centros de golpes.' },
  { site: 'gov.br', title: 'Buscar emprego no Sistema Nacional de Emprego (SINE)', url: 'https://www.gov.br/pt-br/servicos/buscar-emprego-no-sistema-nacional-de-emprego-sine', snippet: 'Serviço oficial e gratuito do governo federal para procurar vagas.' },
];

// ---------- página de cada vaga (JSON-LD como portais reais)
for (const j of D.demoJobs) {
  const c = D.companies.find((x) => x.key === j.company);
  const ld = { '@context': 'https://schema.org', '@type': 'JobPosting', title: j.title, url: j.url, datePosted: '2026-11-01',
    description: [j.salary ? 'Salário: ' + j.salary + '.' : '', j.description].join(' ').trim(),
    hiringOrganization: j.company_name ? { '@type': 'Organization', name: j.company_name, ...(c && c.domain ? { sameAs: 'https://' + c.domain } : {}) } : undefined,
    jobLocation: j.location ? { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: j.location } } : undefined };
  const lvl = levels[j.key], risky = lvl === 'alto_risco' || lvl === 'atencao';
  const applyMsg = risky
    ? 'Simulação: em anúncios reais com este padrão, o próximo passo costuma ser levar a conversa para WhatsApp/Telegram e pedir dinheiro, foto do passaporte ou viagem rápida. Não envie documentos nem pagamentos. Nenhum dado foi enviado.'
    : lvl === 'dados_insuficientes'
      ? 'Simulação: antes de se candidatar, peça o nome da empresa, CNPJ, salário, local e tipo de contrato. Nenhum dado foi enviado.'
      : 'Simulação: aqui você seria levado ao site da empresa para enviar o currículo. Em uma vaga real, confira o CNPJ/registro e nunca pague para se candidatar. Nenhum dado foi enviado.';
  fs.writeFileSync(path.join(root, 'vaga', j.slug + '.html'), page(j.title + ' — VagasJá', `
<div class="top"><a class="brand" href="../vagas.html">VagasJá</a><span class="meta">portal de vagas fictício</span>{{NAV}}</div>${WARN}
<main><article class="card">
  ${j.flyer ? flyerImg(j.flyer, '../') : art(ARTOF[j.key], j.title)}
  <div class="job-head">${avatar(j.company_name || 'Anônimo', 48)}<div><h1>${esc(j.title)}</h1><div class="meta">${esc(j.company_name || 'Empresa não informada')} · publicada em 01/11/2026</div></div></div>
  <div class="facts"><div><b>Local</b>${esc(j.location || 'não informado')}</div><div><b>Salário</b>${esc(j.salary || 'não informado')}</div><div><b>Empresa</b>${esc(j.company_name || 'não informada')}</div></div>
  <h2>Descrição da vaga</h2>
  <p>${esc(j.description)}</p>
  <div data-elo-inline></div>
  <button class="btn" type="button" onclick="document.getElementById('apply').showModal()">Candidatar-se</button>
  <div class="pattern"><b>Sobre este exemplo:</b> ${esc(j.pattern)}</div>
</article></main>
<dialog id="apply"><p>${esc(applyMsg)}</p><form method="dialog"><button class="btn">Entendi</button></form></dialog>
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`, '../'));
}

// ---------- portal (lista)
fs.writeFileSync(path.join(root, 'vagas.html'), page('VagasJá — portal de vagas (fictício)', `
<div class="top"><a class="brand" href="vagas.html">VagasJá</a><span class="meta">portal de vagas fictício</span>{{NAV}}</div>${WARN}
<main>${D.demoJobs.map((j) => `<article class="card" data-elo-job data-elo-url="${esc(j.url)}">
  <div style="display:flex;gap:12px">${avatar(j.company_name || 'Anônimo', 44)}<div style="flex:1">
  <h2 data-elo-title><a href="vaga/${j.slug}.html">${esc(j.title)}</a></h2>
  <div class="meta">${j.company_name ? `<span data-elo-company>${esc(j.company_name)}</span>` : 'Empresa não informada'}${j.location ? ` · <span data-elo-location>${esc(j.location)}</span>` : ''}${j.salary ? ` · <span data-elo-salary>${esc(j.salary)}</span>` : ''}</div>
  <p data-elo-description>${esc(j.description)}</p>${j.flyer ? `<a href="vaga/${j.slug}.html" style="display:block;max-width:260px">${flyerImg(j.flyer, '')}</a>` : ''}</div></div>
</article>`).join('\n')}</main>`));

// ---------- buscador "Procura"
const jobResults = D.demoJobs.map((j) => ({ kind: 'vaga', site: 'VagasJá', crumb: 'vagasja.simulado › vaga › ' + j.slug, title: j.title + (j.company_name ? ' — ' + j.company_name : ''), url: 'vaga/' + j.slug + '.html',
  chips: [j.location, j.salary].filter(Boolean), snippet: j.description.slice(0, 160) + '…' }));
const newsResults = NEWS.map((n) => ({ kind: 'noticia', site: n.site, crumb: n.url.replace('https://', '').split('/').slice(0, 3).join(' › '), title: n.title, url: n.url, chips: [], snippet: n.snippet }));
const all = [jobResults[3], newsResults[0], jobResults[0], jobResults[8], jobResults[5], newsResults[3], jobResults[6], jobResults[1], jobResults[9], jobResults[7], newsResults[1], jobResults[4], jobResults[2], newsResults[2]];
fs.writeFileSync(path.join(root, 'busca.html'), page('vagas no exterior — Procura', `
<div class="top"><a class="brand" href="busca.html" style="color:#1a56db">Procura</a>
  <form class="sbar" onsubmit="event.preventDefault();filtrar()"><input id="q" value="vagas de emprego no exterior e no Brasil" aria-label="Buscar"><button class="btn">Buscar</button></form>{{NAV}}</div>${WARN}
<div class="tabs"><button type="button" data-k="" aria-pressed="true">Todos</button><button type="button" data-k="vaga" aria-pressed="false">Vagas</button><button type="button" data-k="noticia" aria-pressed="false">Notícias</button></div>
<div class="count" id="count"></div>
<main id="search" data-elo-serp>
${all.map((r) => `<div class="result" data-elo-result data-kind="${r.kind}">
  <div class="site">${avatar(r.site, 28)}<div><b>${esc(r.site)}</b><span class="meta">${esc(r.crumb)}</span></div></div>
  <a href="${esc(r.url)}"${r.url.startsWith('http') ? ' target="_blank" rel="noopener"' : ''}><h3>${esc(r.title)}</h3></a>
  ${r.chips.length ? `<div class="chips">${r.chips.map((c) => `<span class="chip">${esc(c)}</span>`).join('')}</div>` : ''}
  <div class="meta">${esc(r.snippet)}</div></div>`).join('\n')}
</main>
<script>
let kind='';
function norm(s){return s.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'')}
function filtrar(){ const q=norm(document.getElementById('q').value).split(/\\s+/).filter(w=>w.length>3&&!['vagas','vaga','emprego','exterior','brasil'].includes(w)); let n=0;
  for(const r of document.querySelectorAll('[data-elo-result]')){ const ok=(!kind||r.dataset.kind===kind)&&(!q.length||q.some(w=>norm(r.textContent).includes(w))); r.style.display=ok?'':'none'; if(ok)n++; }
  document.getElementById('count').textContent='Aproximadamente '+n+' resultados (simulação)'; }
for(const b of document.querySelectorAll('.tabs button')) b.onclick=()=>{ kind=b.dataset.k; for(const x of document.querySelectorAll('.tabs button')) x.setAttribute('aria-pressed', String(x===b)); filtrar(); };
filtrar();
</script>`));

// ---------- rede social "Conecta"
const byKey = Object.fromEntries(D.demoJobs.map((j) => [j.key, j]));
const posts = [
  { author: 'Maria Souza (perfil fictício)', when: '2 h', text: 'Que dia lindo hoje no parque com as crianças! ☀️', react: '48 reações · 6 comentários' },
  { author: 'Oportunidades Ásia (página fictícia)', when: 'Patrocinado', text: D.feedPosts[1].text, link: byKey.v4, img: 'asia', react: '1,2 mil reações · 340 comentários' },
  { author: 'Hotel Atlântico Lda (fictício)', when: '5 h', text: 'Estamos contratando cozinheiro(a) para o Porto, Portugal. Contrato de trabalho escrito antes da viagem e apoio ao visto de trabalho. Salário € 1.150 por mês. Processo seletivo sem nenhuma taxa, entrevista por vídeo. Candidaturas pelo site hotelatlantico.example/carreiras.', link: byKey.v6, img: 'kitchen', react: '210 reações · 18 comentários' },
  { author: 'Notícias Brasil (página fictícia)', when: '1 d', text: 'Atenção antes de aceitar proposta de trabalho no exterior 👇', news: NEWS[0], react: '3,4 mil reações · 512 compartilhamentos' },
  { author: 'Empreiteiro Zé (perfil fictício)', when: '8 h', text: D.feedPosts[3].text, link: byKey.v5, img: 'farm', react: '96 reações · 41 comentários' },
];
const later = [
  { author: 'Star Talents Agency (página fictícia)', when: 'Patrocinado', text: 'VAGAS EM DUBAI ✨ Procuramos mulheres de 18 a 25 anos para recepcionista e modelo em eventos de luxo. Salário de US$ 4.000, não precisa experiência! Envie fotos de corpo inteiro pelo direct. Passagem paga. Vagas limitadas!', link: byKey.v7, img: 'desert', react: '880 reações · 205 comentários' },
  { author: 'Pacific Bridge Staffing (página fictícia)', when: '3 h', text: 'We are hiring Portuguese speakers in Bangkok! Customer support, USD 2,200 per month, no experience needed. Free flight ticket. Pay the visa processing fee and send a photo of your passport on Telegram. Limited slots, apply today!', link: byKey.v9, img: 'asia', react: '430 reações · 97 comentários' },
  { author: 'Logística Aurora (fictícia)', when: '1 d', text: D.feedPosts[2].text, img: 'office', react: '75 reações · 9 comentários' },
];
const postHtml = (p, i) => `<div role="article" class="post">
  <div class="ph">${avatar(p.author)}<div><b>${esc(p.author)}</b><span class="meta">${esc(p.when)} · 🌐</span></div></div>
  <div class="tx">${esc(p.text)}</div>
  ${p.img ? art(p.img, p.text.slice(0, 60)) : ''}
  ${p.news ? `<a class="preview" href="${esc(p.news.url)}" target="_blank" rel="noopener">${art('news', p.news.title)}<div><small>${esc(p.news.site)}</small><br><b>${esc(p.news.title)}</b></div></a>` : ''}
  ${p.link ? `<a class="lk" data-elo-permalink href="vaga/${p.link.slug}.html">Ver vaga completa →</a>` : `<a class="lk" data-elo-permalink href="#post-${i}" style="display:none">post</a>`}
  <div class="ft"><span>${esc(p.react)}</span><span>Curtir · Comentar · Compartilhar</span></div></div>`;
fs.writeFileSync(path.join(root, 'feed.html'), page('Conecta — rede social (fictícia)', `
<div class="top"><a class="brand" href="feed.html" style="color:#7c3aed">Conecta</a><span class="meta">rede social fictícia</span>{{NAV}}</div>${WARN}
<main id="feed">
  <div class="card compose">${avatar('Você Usuário')}<span class="ph">No que você está pensando? (simulação)</span></div>
  ${posts.map(postHtml).join('\n')}
</main>
<p class="meta" style="text-align:center" id="loading">carregando mais publicações…</p>
<script>
// simula o "carregar mais" do feed: novos posts entram depois, como no scroll infinito
const later = ${JSON.stringify(later.map((p, i) => postHtml(p, 100 + i)))};
setTimeout(() => { for (const h of later) document.getElementById('feed').insertAdjacentHTML('beforeend', h); document.getElementById('loading').remove(); }, 1500);
</script>`));

// ---------- início
fs.writeFileSync(path.join(root, 'index.html'), page('ELO — demonstração', `
<div class="top"><span class="brand">ELO — demonstração</span>{{NAV}}</div>${WARN}
<main>
  <div class="card"><h1>Internet simulada</h1><p>Com a extensão ELO instalada, abra qualquer página abaixo. Os selos aparecem sozinhos; na página de uma vaga, a análise aparece no meio do anúncio, com os motivos e vagas mais seguras logo abaixo.</p></div>
  <a class="card" style="display:block;text-decoration:none;color:inherit" href="busca.html"><h2 style="color:#1a56db">Procura — buscador</h2><p class="meta">Resultados de vagas e notícias reais. O ELO faz análise <b>preliminar</b> com título e resumo.</p></a>
  <a class="card" style="display:block;text-decoration:none;color:inherit" href="feed.html"><h2 style="color:#7c3aed">Conecta — rede social</h2><p class="meta">Posts com fotos, anúncios patrocinados e notícia real; mais posts carregam depois. Inclui anúncio em inglês.</p></a>
  <a class="card" style="display:block;text-decoration:none;color:inherit" href="social/mural.html"><h2 style="color:#0d9488">Mural — rede social com grupos</h2><p class="meta">Grupo "Brasileiros na Tailândia", post patrocinado e anúncio que é <b>só um panfleto</b>: o texto do golpe está na imagem. Use "Ler imagem" do ELO (API local).</p></a>
  <a class="card" style="display:block;text-decoration:none;color:inherit" href="social/redepro.html"><h2 style="color:#0f766e">RedePro — rede profissional</h2><p class="meta">Recrutador com perfil recém-criado, vaga de scam center com "candidatura simplificada" e panfleto anexado.</p></a>
  <a class="card" style="display:block;text-decoration:none;color:inherit" href="vagas.html"><h2>VagasJá — portal de vagas</h2><p class="meta">${D.demoJobs.length} vagas no Brasil e no exterior, em português, inglês e espanhol. Cada uma tem página própria com dados estruturados, como portais reais.</p></a>
</main>`));
// ================================================================ redes sociais fictícias (com imagens)
// Estrutura de HTML parecida com a das redes reais (feed com [role=feed] > [aria-posinset]; posts com data-urn de atividade),
// para o content script do ELO ser testado nas mesmas condições. Nomes, cores e logos são próprios.
const v11 = byKey.v11;
const socialCss = `body{background:#eef2f1} .top{background:#0d9488;border:0} .top .brand,.top a,.top .meta{color:#fff} .top nav a{color:#e6fffa}
.layout{max-width:1040px;margin:18px auto;padding:0 16px;display:grid;grid-template-columns:220px minmax(0,1fr) 240px;gap:16px}
@media (max-width:900px){.layout{grid-template-columns:minmax(0,1fr)} .side{display:none}}
.side .card{position:sticky;top:70px} .side a{display:block;padding:6px 0;text-decoration:none;color:var(--ink);font-size:14px}
.post .gp{font-size:12.5px;color:var(--muted);padding:10px 14px 0} .post .gp b{color:var(--ink)}
.post img.flyer{border-radius:0;max-height:640px;object-fit:contain;background:#111}
.cm{display:flex;gap:8px;padding:6px 14px} .cm .bub{background:#f1f5f9;border-radius:14px;padding:6px 10px;font-size:13.5px} .cm .bub b{display:block;font-size:12.5px}
.sp{font-size:12px;color:var(--muted)} .tag{display:inline-block;font-size:11px;background:#ccfbf1;color:#115e59;border-radius:6px;padding:1px 6px;margin-left:6px}`;
const proCss = `body{background:#f3f2ef} .top{background:#fff} .top .brand{color:#0f766e} .layout{max-width:1040px;margin:18px auto;padding:0 16px;display:grid;grid-template-columns:230px minmax(0,1fr) 260px;gap:16px}
@media (max-width:900px){.layout{grid-template-columns:minmax(0,1fr)} .side{display:none}}
.feed-shared{background:#fff;border:1px solid var(--line);border-radius:10px;margin-bottom:12px;overflow:hidden}
.actor{display:flex;gap:10px;padding:12px 14px 4px} .actor b{display:block} .actor .meta{font-size:12.5px}
.commentary{padding:6px 14px 10px;white-space:pre-line} .feed-shared img.flyer{border-radius:0}
.job-card{display:block;margin:0 14px 12px;border:1px solid var(--line);border-radius:8px;padding:10px 12px;text-decoration:none;color:var(--ink)} .job-card small{color:var(--muted)}
.social-counts{padding:8px 14px;font-size:12.5px;color:var(--muted);border-top:1px solid var(--line)}
.top-card h1{font-size:24px} .pill{display:inline-block;background:#e7f3ef;color:#0f5132;border-radius:999px;padding:2px 10px;font-size:12.5px;margin-right:6px}
.btn.pro{background:#0f766e;border-radius:999px} .recruiter{display:flex;gap:10px;align-items:center}`;

const comments = (list) => list.map((c) => `<div class="cm">${avatar(c[0], 28)}<div class="bub"><b>${esc(c[0])}</b>${esc(c[1])}</div></div>`).join('');
const muralPosts = [
  { author: 'Juliana Rocha (perfil fictício)', when: '1 h', text: 'Primeiro dia no curso técnico de enfermagem! 💙 Obrigada a todo mundo que apoiou.', react: '132 reações · 24 comentários' },
  { group: 'Brasileiros na Tailândia — Vagas e Dicas (grupo fictício)', author: 'Rafa Agente (perfil fictício)', when: '3 h', text: 'Ainda tem vaga galera!! Quem tiver interesse chama no Telegram 👇🇹🇭', flyer: 'scam-bangkok',
    react: '486 reações · 173 comentários', comments: [['Bruno (perfil fictício)', 'Tenho interesse! Precisa saber inglês?'], ['Rafa Agente (perfil fictício)', 'Não precisa, chama no Telegram que te passo tudo 😉']] },
  { author: 'Golden Lotus Careers (página fictícia)', when: 'Patrocinado', text: 'Trabalhe no exterior ganhando em dólar 💵✈️ Saiba mais no link.', flyer: 'typing-sihanoukville', ext: { host: 'lotus-careers.example', title: 'Golden Lotus Careers — Apply now', url: 'https://lotus-careers.example/apply' },
    react: '1,1 mil reações · 260 comentários' },
  { author: 'Notícias Brasil (página fictícia)', when: '1 d', text: 'Antes de aceitar proposta de trabalho no Sudeste Asiático, leia isto 👇', news: NEWS[0], react: '5,2 mil reações · 980 compartilhamentos' },
  { author: 'Logística Aurora (fictícia)', when: '2 d', text: 'Vagas abertas em Campinas! Confira os detalhes no cartaz.', flyer: 'clt-campinas', react: '64 reações · 7 comentários' }
];
const muralPost = (p, i) => `<div class="post" aria-posinset="${i + 1}" aria-setsize="-1" data-post-id="mural-${i}">
  ${p.group ? `<div class="gp">Publicado no grupo <b>${esc(p.group)}</b></div>` : ''}
  <div class="ph">${avatar(p.author)}<div><b>${esc(p.author)}</b><span class="meta">${esc(p.when)} · 🌐</span></div></div>
  <div class="tx">${esc(p.text)}</div>
  ${p.flyer ? flyerImg(p.flyer, '../') : ''}
  ${p.ext ? `<a class="preview" href="${esc(p.ext.url)}" target="_blank" rel="noopener"><div><small>${esc(p.ext.host)}</small><br><b>${esc(p.ext.title)}</b></div></a>` : ''}
  ${p.news ? `<a class="preview" href="${esc(p.news.url)}" target="_blank" rel="noopener">${art('news', p.news.title)}<div><small>${esc(p.news.site)}</small><br><b>${esc(p.news.title)}</b></div></a>` : ''}
  <a class="lk" data-elo-permalink href="#posts/mural-${i}" style="display:none">post</a>
  <div class="ft"><span>${esc(p.react)}</span><span>Curtir · Comentar · Compartilhar</span></div>
  ${p.comments ? comments(p.comments) : ''}</div>`;
fs.writeFileSync(path.join(root, 'social', 'mural.html'), page('Mural — rede social (fictícia)', `
<div class="top"><a class="brand" href="mural.html">◉ Mural</a><span class="meta">rede social fictícia</span>{{NAV}}</div>${WARN}
<div class="layout">
  <aside class="side"><div class="card"><b>Atalhos</b><a href="#">🏠 Página inicial</a><a href="#">👥 Grupos</a><a href="#">🛍️ Classificados</a><a href="#">🎬 Vídeos</a></div></aside>
  <main role="feed" aria-label="Feed" style="margin:0;padding:0;max-width:none">
    <div class="card compose">${avatar('Você Usuário')}<span class="ph">No que você está pensando? (simulação)</span></div>
    ${muralPosts.map(muralPost).join('\n')}
  </main>
  <aside class="side"><div class="card"><b>Patrocinado</b><p class="sp">Anúncios nesta página são fictícios.</p><b>Grupos sugeridos</b><p class="sp">Brasileiros na Tailândia — Vagas e Dicas<br>Trabalho no Exterior 2026</p></div></aside>
</div>`, '../', { css: socialCss, bodyAttr: ' data-elo-social="mural"' }));

const proPosts = [
  { urn: '7391200000000000001', author: 'Ana Lima (perfil fictício)', headline: 'Talent Acquisition | Lotus Digital Solutions · perfil criado há 2 semanas · 3 conexões', when: '6 h',
    text: '#hiring 🚀 Oportunidade internacional para brasileiros!\nCustomer Support em Bangkok. Todos os detalhes no flyer.\nInteressados, comentem "EU QUERO" que eu chamo no privado. 🙌', flyer: 'scam-bangkok', job: v11, counts: '312 reações · 198 comentários' },
  { urn: '7391200000000000002', author: 'Carlos Menezes (perfil fictício)', headline: 'Coordenador de Logística na Logística Aurora (fictícia)', when: '1 d',
    text: 'Estamos contratando auxiliares de logística em Campinas/SP, CLT, R$ 2.300 + benefícios, 44h semanais. Inscrições pelo site logistica-aurora.example/vagas. Processo seletivo gratuito, sem nenhuma taxa.', counts: '88 reações · 12 comentários' },
  { urn: '7391200000000000003', author: 'Patrícia Gomes (perfil fictício)', headline: 'Analista de Dados', when: '2 d', text: 'Feliz em compartilhar que comecei em um novo cargo como Analista de Dados! 🎉', counts: '540 reações · 96 comentários' },
  { urn: '7391200000000000004', author: 'Hotel Atlântico Lda (fictício)', headline: 'Hotelaria · Porto, Portugal', when: '3 d',
    text: 'Vagas de cozinheiro(a) no Porto. Contrato de trabalho escrito enviado antes da viagem e apoio ao visto de trabalho. € 1.150 por mês. Seleção sem taxas, entrevista por vídeo.', job: byKey.v6, jobHref: '../vaga/' + byKey.v6.slug + '.html', counts: '205 reações · 31 comentários' }
];
const proPost = (p) => `<div class="feed-shared" data-urn="urn:li:activity:${p.urn}">
  <div class="actor">${avatar(p.author, 44)}<div><b>${esc(p.author)}</b><span class="meta">${esc(p.headline)}<br>${esc(p.when)} · 🌐</span></div></div>
  <div class="commentary">${esc(p.text)}</div>
  ${p.flyer ? flyerImg(p.flyer, '../') : ''}
  ${p.job ? `<a class="job-card" href="${p.jobHref || 'redepro-vaga.html'}"><b>${esc(p.job.title)}</b><br><small>${esc(p.job.company_name)} · ${esc(p.job.location)}</small></a>` : ''}
  <a data-elo-permalink href="#feed/update/urn:li:activity:${p.urn}" style="display:none">post</a>
  <div class="social-counts">${esc(p.counts)} · Gostei · Comentar · Compartilhar</div></div>`;
const proSide = `<aside class="side"><div class="card">${avatar('Você Usuário', 56)}<p><b>Você Usuário</b></p><p class="meta">Procurando oportunidades</p></div></aside>`;
fs.writeFileSync(path.join(root, 'social', 'redepro.html'), page('RedePro — rede profissional (fictícia)', `
<div class="top"><a class="brand" href="redepro.html">▣ RedePro</a><span class="meta">rede profissional fictícia</span>{{NAV}}</div>${WARN}
<div class="layout">${proSide}
  <main style="margin:0;padding:0;max-width:none">${proPosts.map(proPost).join('\n')}</main>
  <aside class="side"><div class="card"><b>Vagas recomendadas</b><p class="sp"><a href="redepro-vaga.html">${esc(v11.title)}</a><br>${esc(v11.company_name)}</p></div></aside>
</div>`, '../', { css: proCss, bodyAttr: ' data-elo-social="redepro"' }));

const v11ld = { '@context': 'https://schema.org', '@type': 'JobPosting', title: v11.title, url: 'https://elo-demo.local/redepro/jobs/view/4100000001', datePosted: '2026-11-03', description: v11.description,
  employmentType: 'FULL_TIME', hiringOrganization: { '@type': 'Organization', name: v11.company_name }, jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: v11.location } } };
fs.writeFileSync(path.join(root, 'social', 'redepro-vaga.html'), page(v11.title + ' — RedePro', `
<div class="top"><a class="brand" href="redepro.html">▣ RedePro</a><span class="meta">rede profissional fictícia</span>{{NAV}}</div>${WARN}
<div class="layout">${proSide}
  <main style="margin:0;padding:0;max-width:none"><article class="card top-card">
    <div class="recruiter">${avatar(v11.company_name, 48)}<div><b>${esc(v11.company_name)}</b><div class="meta">Empresa · 2–10 funcionários · página criada em out. 2026</div></div></div>
    <h1 style="margin-top:12px">${esc(v11.title)}</h1>
    <div class="meta">${esc(v11.location)} · há 4 dias · Mais de 100 candidaturas</div>
    <p style="margin:10px 0"><span class="pill">Presencial</span><span class="pill">Tempo integral</span><span class="pill">Nível de entrada</span></p>
    <button class="btn pro" type="button" onclick="document.getElementById('apply').showModal()">Candidatura simplificada</button>
    <h2 style="margin-top:18px">Sobre a vaga</h2>
    <p>${esc(v11.description)}</p>
    ${flyerImg(v11.flyer, '../')}
    <div data-elo-inline></div>
    <h2 style="margin-top:18px">Conheça quem está recrutando</h2>
    <div class="recruiter">${avatar('Ana Lima', 40)}<div><b>Ana Lima (perfil fictício)</b><div class="meta">Talent Acquisition · perfil criado há 2 semanas · 3 conexões</div></div></div>
    <div class="pattern"><b>Sobre este exemplo:</b> ${esc(v11.pattern)}</div>
  </article></main>
  <aside class="side"><div class="card"><b>Dica</b><p class="sp">Empresas reais têm site, CNPJ/registro e recrutadores com histórico.</p></div></aside>
</div>
<dialog id="apply"><p>Simulação: neste padrão, a "candidatura simplificada" leva a uma conversa no Telegram que pede foto do passaporte e embarque rápido. Não envie documentos. Nenhum dado foi enviado.</p><form method="dialog"><button class="btn">Entendi</button></form></dialog>
<script type="application/ld+json">${JSON.stringify(v11ld).replace(/</g, '\\u003c')}</script>`, '../', { css: proCss, bodyAttr: ' data-elo-social="redepro"' }));

console.log('ok: demo/ (' + D.demoJobs.length + ' vagas, Mural, RedePro)');
