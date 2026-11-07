// Redes sociais FICTÍCIAS da demonstração: "Mural" (rede social com feed e grupos) e "RedePro" (rede profissional).
// Layout próximo ao das redes reais (para testar o ELO em condições realistas), mas com NOME, LOGO e CORES PRÓPRIOS
// e aviso de simulação visível. Estrutura de HTML que o content script reconhece:
//   Mural:   [role=feed] > div[aria-posinset]      RedePro: div[data-urn="urn:li:activity:…"]
// Usado por scripts/build-demo.js.
const fs = require('fs'), path = require('path');

module.exports = function buildSocial({ root, D, byKey, NEWS, esc, flyerImg, switcher, SWITCH_CSS }) {
  const v11 = byKey.v11;
  const out = path.join(root, 'social');
  fs.mkdirSync(out, { recursive: true });

  // ---------------------------------------------------------------- utilidades visuais
  const PALETTE = ['#e11d48', '#7c3aed', '#0891b2', '#16a34a', '#ea580c', '#2563eb', '#ca8a04', '#db2777', '#0d9488'];
  const initials = (n) => n.replace(/\(.*?\)/g, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const colorOf = (n) => PALETTE[[...n].reduce((s, c) => s + c.charCodeAt(0), 0) % PALETTE.length];
  const av = (name, size = 40, extra = '') => `<span class="av" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px;background:${colorOf(name)}"${extra}>${esc(initials(name))}</span>`;
  const sq = (name, size = 48) => `<span class="av sq" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.36)}px;background:${colorOf(name)}">${esc(initials(name))}</span>`;
  const I = (d, s = 20, fill = false) => `<svg class="i" width="${s}" height="${s}" viewBox="0 0 24 24" ${fill ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'} aria-hidden="true">${d}</svg>`;
  const ICON = {
    home: '<path d="M3 11l9-8 9 8v10a1 1 0 01-1 1h-5v-7H9v7H4a1 1 0 01-1-1z"/>',
    video: '<rect x="2" y="5" width="15" height="14" rx="2"/><path d="M17 10l5-3v10l-5-3z"/>',
    shop: '<path d="M3 9l1.5-5h15L21 9M3 9h18v11a1 1 0 01-1 1H4a1 1 0 01-1-1zM9 21v-6h6v6"/>',
    groups: '<circle cx="9" cy="8" r="3.2"/><circle cx="17" cy="9" r="2.6"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M14 20c0-2.6 1.4-4.8 3.6-5.6 2.2.6 3.9 2.6 3.9 5.6"/>',
    game: '<rect x="2" y="7" width="20" height="11" rx="5"/><path d="M7 12h4M9 10v4M16 11h.01M18 13h.01"/>',
    menu: '<circle cx="5" cy="5" r="2"/><circle cx="12" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="12" cy="19" r="2"/><circle cx="19" cy="19" r="2"/>',
    chat: '<path d="M12 3C6.5 3 2 7 2 12c0 2.6 1.2 4.9 3.2 6.6L5 22l3.7-1.9c1 .3 2.1.4 3.3.4 5.5 0 10-4 10-9.5S17.5 3 12 3z"/>',
    bell: '<path d="M18 16v-5a6 6 0 10-12 0v5l-2 2h16zM10 21h4"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    like: '<path d="M7 22H4a1 1 0 01-1-1v-9a1 1 0 011-1h3m0 11V11m0 11h10.3a2 2 0 002-1.7l1.4-8A2 2 0 0018.7 10H14V5a3 3 0 00-3-3l-4 9"/>',
    comment: '<path d="M21 12a8 8 0 01-11.8 7L4 20l1.1-4.6A8 8 0 1121 12z"/>',
    share: '<path d="M14 4l7 7-7 7v-4c-6 0-9 2-11 6 1-6 4-10 11-11z"/>',
    send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>',
    dots: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    photo: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
    smile: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5c1.8 2 5.2 2 7 0M9 9.5h.01M15 9.5h.01"/>',
    live: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3"/><circle cx="9" cy="12" r="2"/>',
    users: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-3.9 3.1-7 7-7s7 3.1 7 7M16 4.5a4 4 0 010 7M22 21c0-3-1.7-5.5-4.2-6.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
    flag: '<path d="M4 21V4M4 4h13l-2 4 2 4H4"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M3 13h18"/>',
    network: '<circle cx="12" cy="5" r="3"/><circle cx="5" cy="19" r="3"/><circle cx="19" cy="19" r="3"/><path d="M12 8v4M12 12l-5 4.5M12 12l5 4.5"/>',
    msg: '<path d="M4 4h16a1 1 0 011 1v11a1 1 0 01-1 1H8l-4 4V5a1 1 0 011-1z"/>',
    grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    building: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M10 21v-3h4v3"/>',
    pin: '<path d="M12 22s7-6.3 7-12a7 7 0 10-14 0c0 5.7 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
    check: '<path d="M5 12l5 5L20 7"/>',
    article: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    repost: '<path d="M17 2l4 4-4 4M3 11V9a3 3 0 013-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 01-3 3H3"/>'
  };
  // reações: círculos coloridos com ícone (sem emoji)
  const RX = {
    like: ['#2d6cdf', '<path d="M7 11v9H4v-9zM7 11l4-8a2 2 0 012 2v4h5a2 2 0 012 2.3l-1.2 7A2 2 0 0116.8 20H7z" fill="#fff"/>'],
    love: ['#f02849', '<path d="M12 20s-7-4.4-7-9.5A3.8 3.8 0 0112 8a3.8 3.8 0 017 2.5C19 15.6 12 20 12 20z" fill="#fff"/>'],
    wow: ['#f7b928', '<circle cx="9" cy="10" r="1.4" fill="#5b3a00"/><circle cx="15" cy="10" r="1.4" fill="#5b3a00"/><ellipse cx="12" cy="15.5" rx="2" ry="2.6" fill="#5b3a00"/>'],
    sad: ['#f7b928', '<circle cx="9" cy="10" r="1.3" fill="#5b3a00"/><circle cx="15" cy="10" r="1.3" fill="#5b3a00"/><path d="M8.5 16.5c2-2 5-2 7 0" stroke="#5b3a00" stroke-width="1.6" fill="none"/>'],
    clap: ['#3f8f5b', '<path d="M8 13l3-6a1.4 1.4 0 012.5 1.2L12 11l4-4a1.4 1.4 0 012 2l-5 6a4 4 0 01-6 .2L5 13a1.4 1.4 0 012-2z" fill="#fff"/>'],
    idea: ['#c37d16', '<path d="M12 4a5 5 0 00-3 9v2h6v-2a5 5 0 00-3-9zM10 17h4v2h-4z" fill="#fff"/>']
  };
  const REACT = (kinds) => `<span class="rx">${kinds.map((k, i) => `<span class="re" style="z-index:${3 - i};background:${RX[k][0]}"><svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">${RX[k][1]}</svg></span>`).join('')}</span>`;
  // aviso de simulação: discreto, mas sempre visível (rodapé fixo)
  const SIM = (back, current) => `<div class="sim" role="note"><b>Simulação ELO</b> · rede, empresas e vagas FICTÍCIAS, com padrões reais documentados (OIT, ONU, Itamaraty, PF).${switcher('../', current, true)}</div>`;
  const doc = (title, css, body, attr) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${css}</style></head><body data-elo-social="${attr}">${body}</body></html>`;

  const BASE_CSS0 = `*{box-sizing:border-box} html{-webkit-text-size-adjust:100%} body{margin:0;font:15px/1.34 "Segoe UI Historic","Segoe UI",system-ui,-apple-system,Roboto,Helvetica,Arial,sans-serif;padding-bottom:40px}
a{color:inherit;text-decoration:none} button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;padding:0}
.av{display:inline-grid;place-items:center;border-radius:50%;color:#fff;font-weight:700;flex:none;letter-spacing:.02em} .av.sq{border-radius:6px}
.i{display:block;flex:none} img.flyer{display:block;width:100%;height:auto;border-radius:0}
.sim{position:fixed;left:0;right:0;bottom:0;z-index:50;background:#111827;color:#e5e7eb;font-size:12px;padding:7px 14px;text-align:center} .sim a{color:#93c5fd;text-decoration:underline} .sim b{color:#fff} .sim{display:flex;justify-content:center;align-items:center;flex-wrap:wrap;gap:4px}`;
  const BASE_CSS = BASE_CSS0 + SWITCH_CSS + `
.rx{display:inline-flex;vertical-align:middle} .re{display:inline-grid;place-items:center;width:18px;height:18px;border-radius:50%;font-size:11px;margin-left:-4px;border:2px solid #fff;position:relative;background:#fff} .re:first-child{margin-left:0}`;

  // ================================================================ MURAL (rede social: feed, grupos, stories)
  const M_CSS = BASE_CSS + `
:root{--m-bg:#f0f2f5;--m-card:#fff;--m-ink:#050505;--m-sub:#65676b;--m-line:#ced0d4;--m-hover:#f2f2f2;--m-brand:#2d6cdf;--m-brand-bg:#e7efff;--m-chip:#e4e6eb}
body{background:var(--m-bg);color:var(--m-ink)}
.mtop{position:sticky;top:0;z-index:20;height:56px;background:var(--m-card);box-shadow:0 1px 2px rgba(0,0,0,.12);display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:0 16px}
.mtop .l{display:flex;align-items:center;gap:8px} .logo{width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#2d6cdf,#6a4cff);color:#fff;display:grid;place-items:center;font:800 22px/1 system-ui;letter-spacing:-1px}
.msearch{display:flex;align-items:center;gap:8px;background:var(--m-bg);border-radius:999px;height:40px;padding:0 12px;color:var(--m-sub);width:240px} .msearch span{font-size:15px}
.mtabs{display:flex;gap:6px;height:56px} .mtabs a{width:110px;display:grid;place-items:center;color:var(--m-sub);border-bottom:3px solid transparent;margin-top:3px} .mtabs a:hover{background:var(--m-hover);border-radius:8px}
.mtabs a.on{color:var(--m-brand);border-bottom-color:var(--m-brand);border-radius:0}
.mtop .r{display:flex;gap:8px;justify-content:flex-end;align-items:center} .rb{width:40px;height:40px;border-radius:50%;background:var(--m-chip);display:grid;place-items:center;position:relative}
.badge{position:absolute;top:-4px;right:-4px;background:#e41e3f;color:#fff;font:700 11px/1;border-radius:999px;padding:3px 5px;border:2px solid #fff}
.mlay{display:grid;grid-template-columns:minmax(220px,360px) minmax(0,590px) minmax(220px,360px);justify-content:space-between;gap:24px;padding:16px 16px 0}
.mleft,.mright{position:sticky;top:72px;align-self:start;max-height:calc(100vh - 110px);overflow:auto}
.nav-item{display:flex;align-items:center;gap:12px;padding:8px;border-radius:8px;font-weight:500} .nav-item:hover{background:#e4e6e9}
.ni{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;color:#fff}
.sect{color:var(--m-sub);font-weight:600;font-size:17px;padding:12px 8px 4px;border-top:1px solid var(--m-line);margin-top:8px}
.mfeed{display:flex;flex-direction:column;gap:16px;padding:0;margin:0}
.card{background:var(--m-card);border-radius:8px;box-shadow:0 1px 2px rgba(0,0,0,.2)}
.stories{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
.story{position:relative;height:200px;border-radius:12px;overflow:hidden;color:#fff;font-weight:600;font-size:13px;box-shadow:0 1px 2px rgba(0,0,0,.2)}
.story .bg{position:absolute;inset:0} .story .av{position:absolute;top:10px;left:10px;border:4px solid var(--m-brand)} .story b{position:absolute;left:10px;right:10px;bottom:10px;text-shadow:0 1px 3px rgba(0,0,0,.5)}
.story.me{background:#fff;color:var(--m-ink)} .story.me .bg{bottom:56px;background:linear-gradient(160deg,#94a3b8,#475569)} .story.me .plus{position:absolute;left:50%;bottom:38px;transform:translateX(-50%);width:40px;height:40px;border-radius:50%;background:var(--m-brand);color:#fff;display:grid;place-items:center;border:4px solid #fff} .story.me b{text-align:center;text-shadow:none}
.composer{padding:12px 16px 10px} .composer .row{display:flex;gap:8px;align-items:center} .composer .pill{flex:1;background:var(--m-bg);border-radius:999px;padding:10px 12px;color:var(--m-sub);font-size:17px}
.composer .acts{display:flex;border-top:1px solid #e4e6eb;margin-top:12px;padding-top:6px} .composer .acts span{flex:1;display:flex;gap:8px;justify-content:center;align-items:center;padding:8px;border-radius:8px;color:var(--m-sub);font-weight:600}
.post .ph{display:flex;gap:8px;padding:12px 16px 0;align-items:flex-start} .post .who{flex:1;min-width:0} .post .who b{font-size:15px;font-weight:600} .post .who b a:hover{text-decoration:underline}
.post .meta{color:var(--m-sub);font-size:13px;display:flex;gap:4px;align-items:center;margin-top:2px} .post .ctl{display:flex;gap:4px;color:var(--m-sub)} .post .ctl button{width:36px;height:36px;border-radius:50%;display:grid;place-items:center} .post .ctl button:hover{background:var(--m-hover)}
.post .grp{display:flex;align-items:center;gap:8px} .post .grp .av.sq{border-radius:8px}
.post .tx{padding:4px 16px 12px;font-size:15px;white-space:pre-line} .post .tx.big{font-size:24px;line-height:1.25}
.post .imgw{background:#000;display:flex;justify-content:center} .post .imgw img{max-height:680px;width:auto;max-width:100%}
.lcard{display:block;background:#f0f2f5;padding:10px 16px;border-bottom:1px solid #e4e6eb} .lcard small{display:block;color:var(--m-sub);text-transform:uppercase;font-size:13px} .lcard b{font-size:17px} .lcard .cta{float:right;background:#e4e6eb;border-radius:6px;padding:8px 12px;font-weight:600;font-size:15px;margin-top:-6px}
.news{display:block;border-bottom:1px solid #e4e6eb} .news .th{height:160px;background:linear-gradient(135deg,#1e3a8a,#0f172a);color:#fff;display:flex;align-items:flex-end;padding:14px;font:800 20px/1.2 system-ui} .news div.t{background:#f0f2f5;padding:10px 16px} .news small{color:var(--m-sub);text-transform:uppercase;font-size:13px} .news b{display:block;font-size:17px}
.counts{display:flex;justify-content:space-between;align-items:center;color:var(--m-sub);font-size:15px;padding:10px 16px} .counts .rx .re{width:20px;height:20px;font-size:12px} .counts .lft{display:flex;gap:6px;align-items:center}
.pacts{display:flex;margin:0 12px;border-top:1px solid #ced0d4;padding:4px 0} .pacts span{flex:1;display:flex;gap:8px;justify-content:center;align-items:center;padding:6px;border-radius:6px;color:var(--m-sub);font-weight:600;font-size:15px} .pacts span:hover{background:var(--m-hover)}
.cmts{padding:4px 16px 12px;border-top:1px solid #ced0d4;margin:0 0 0} .more{color:var(--m-sub);font-weight:600;font-size:15px;padding:8px 0;display:block}
.cm{display:flex;gap:6px;margin:6px 0} .cm .bub{background:#f0f2f5;border-radius:18px;padding:8px 12px;font-size:15px;display:inline-block} .cm .bub b{display:block;font-size:13px;font-weight:600}
.cm .sub{font-size:12px;color:var(--m-sub);font-weight:700;margin:2px 0 0 12px;display:flex;gap:12px} .cm .sub span:last-child{font-weight:400}
.cbox{display:flex;gap:6px;align-items:center;margin-top:8px} .cbox span.in{flex:1;background:#f0f2f5;border-radius:18px;padding:8px 12px;color:var(--m-sub);font-size:15px}
.rhead{display:flex;justify-content:space-between;color:var(--m-sub);font-weight:600;font-size:17px;padding:8px} .ad{display:flex;gap:12px;align-items:center;padding:8px;border-radius:8px} .ad:hover{background:#e4e6e9}
.ad .th{width:120px;height:120px;border-radius:8px;flex:none;display:grid;place-items:center;color:#fff;font:800 18px/1.1 system-ui;text-align:center;padding:8px} .ad small{color:var(--m-sub);display:block;font-size:13px}
.contact{display:flex;gap:12px;align-items:center;padding:8px;border-radius:8px;font-weight:500} .contact:hover{background:#e4e6e9} .contact .wrap{position:relative} .contact .on{position:absolute;right:0;bottom:0;width:10px;height:10px;background:#31a24c;border-radius:50%;border:2px solid var(--m-bg)}
@media (max-width:1100px){.mlay{grid-template-columns:minmax(0,590px) minmax(220px,320px);justify-content:center} .mleft{display:none} .mtabs a{width:80px}}
@media (max-width:760px){.mlay{grid-template-columns:minmax(0,1fr);padding:8px 0 0} .mright{display:none} .mtabs,.msearch span{display:none} .msearch{width:40px;padding:0 10px} .stories{grid-template-columns:repeat(3,1fr);padding:0 8px} .stories .story:nth-child(n+4){display:none} .card{border-radius:0} .mtop{grid-template-columns:1fr auto}}`;

  const me = 'Lucas Ramos';
  const mPosts = [
    { author: 'Juliana Rocha', when: '1 h', text: 'Primeiro dia no curso técnico de enfermagem! Obrigada a todo mundo que apoiou.', big: true, rx: ['like', 'love'], n: '132', counts: '24 comentários', comments: [['Tia Célia', 'Orgulho demais, minha filha!', '45 min']] },
    { group: 'Brasileiros na Tailândia — Vagas e Dicas', author: 'Rafa Agente', when: '3 h', text: 'Ainda tem vaga galera!! Quem tiver interesse chama no Telegram', flyer: 'scam-bangkok',
      rx: ['like', 'wow', 'love'], n: '486', counts: '173 comentários · 41 compartilhamentos',
      comments: [['Bruno Alves', 'Tenho interesse! Precisa saber inglês?', '2 h'], ['Rafa Agente', 'Não precisa, chama no Telegram que te passo tudo', '2 h'], ['Camila Duarte', 'Meu primo foi numa dessas e ficou sem o passaporte lá. Cuidado gente.', '1 h']] },
    { author: 'Golden Lotus Careers', page: true, when: 'Patrocinado', text: 'Trabalhe no exterior ganhando em dólar Vagas para quem fala português!', flyer: 'typing-sihanoukville',
      ext: { host: 'LOTUS-CAREERS.EXAMPLE', title: 'Golden Lotus Careers — Apply now', url: 'https://lotus-careers.example/apply', cta: 'Saiba mais' }, rx: ['like', 'love'], n: '1,1 mil', counts: '260 comentários · 88 compartilhamentos' },
    { author: 'Notícias Brasil', page: true, when: '1 d', text: 'Antes de aceitar proposta de trabalho no Sudeste Asiático, leia isto', news: NEWS[0], rx: ['sad', 'like', 'wow'], n: '5,2 mil', counts: '612 comentários · 980 compartilhamentos' },
    { author: 'Logística Aurora (fictícia)', page: true, when: '2 d', text: 'Vagas abertas em Campinas! Confira os detalhes no cartaz.', flyer: 'clt-campinas', rx: ['like'], n: '64', counts: '7 comentários' }
  ];
  const mPost = (p, i) => `<div class="post card" aria-posinset="${i + 1}" aria-setsize="-1" data-post-id="mural-${i}">
  <div class="ph">
    ${p.group ? `<span class="grp" style="position:relative">${sq(p.group, 40)}${av(p.author, 24, ' style="position:absolute;right:-6px;bottom:-6px;width:24px;height:24px;font-size:10px;border:2px solid #fff;background:' + colorOf(p.author) + '"')}</span>` : av(p.author, 40)}
    <div class="who">
      ${p.group ? `<b><a href="#">${esc(p.group)}</a></b><div class="meta"><b style="font-size:13px;color:#65676b;font-weight:600">${esc(p.author)}</b> · ${esc(p.when)} · ${I(ICON.groups, 12)}</div>`
        : `<b><a href="#">${esc(p.author)}</a></b><div class="meta">${esc(p.when)} · ${I(ICON.globe, 12)}</div>`}
    </div>
    <div class="ctl"><button type="button" aria-label="Mais opções">${I(ICON.dots, 20, true)}</button><button type="button" aria-label="Ocultar">${I(ICON.close, 20)}</button></div>
  </div>
  <div class="tx${p.big ? ' big' : ''}">${esc(p.text)}</div>
  ${p.flyer ? `<div class="imgw">${flyerImg(p.flyer, '../')}</div>` : ''}
  ${p.ext ? `<a class="lcard" href="${esc(p.ext.url)}" target="_blank" rel="noopener"><span class="cta">${esc(p.ext.cta)}</span><small>${esc(p.ext.host)}</small><b>${esc(p.ext.title)}</b></a>` : ''}
  ${p.news ? `<a class="news" href="${esc(p.news.url)}" target="_blank" rel="noopener"><div class="th">${esc(p.news.site)}</div><div class="t"><small>${esc(new URL(p.news.url).hostname.replace(/^www\./, ''))}</small><b>${esc(p.news.title)}</b></div></a>` : ''}
  <a data-elo-permalink href="#posts/mural-${i}" style="display:none">post</a>
  <div class="counts"><span class="lft">${REACT(p.rx)} ${esc(p.n)}</span><span>${esc(p.counts)}</span></div>
  <div class="pacts"><span>${I(ICON.like)}Curtir</span><span>${I(ICON.comment)}Comentar</span><span>${I(ICON.share)}Compartilhar</span></div>
  ${p.comments ? `<div class="cmts"><span class="more">Ver mais comentários</span>${p.comments.map((c) => `<div class="cm">${av(c[0], 32)}<div><div class="bub"><b>${esc(c[0])}</b>${esc(c[1])}</div><div class="sub"><span>Curtir</span><span>Responder</span><span>${esc(c[2])}</span></div></div></div>`).join('')}
    <div class="cbox">${av(me, 32)}<span class="in">Escreva um comentário…</span></div></div>` : ''}
</div>`;
  const STORY = [['Ana Paula', '#f97316,#be123c'], ['Diego Lima', '#22c55e,#0f766e'], ['Marina Costa', '#6366f1,#1e1b4b'], ['Pedro H.', '#eab308,#b45309']];
  const navItems = [['Amigos', ICON.users, '#2d6cdf'], ['Memórias', ICON.clock, '#1b74e4'], ['Salvos', ICON.bookmark, '#a033ff'], ['Grupos', ICON.groups, '#1b74e4'], ['Vídeo', ICON.video, '#1b74e4'], ['Classificados', ICON.shop, '#1b74e4'], ['Feeds', ICON.article, '#1b74e4']];
  const mural = `
<header class="mtop">
  <div class="l"><a class="logo" href="mural.html" aria-label="Mural — página inicial">m</a><div class="msearch">${I(ICON.search, 16)}<span>Pesquisar no Mural</span></div></div>
  <nav class="mtabs" aria-label="Seções"><a class="on" href="#" aria-label="Página inicial">${I(ICON.home, 26)}</a><a href="#" aria-label="Vídeos">${I(ICON.video, 26)}</a><a href="#" aria-label="Classificados">${I(ICON.shop, 26)}</a><a href="#" aria-label="Grupos">${I(ICON.groups, 26)}</a><a href="#" aria-label="Jogos">${I(ICON.game, 26)}</a></nav>
  <div class="r"><span class="rb">${I(ICON.menu, 20, true)}</span><span class="rb">${I(ICON.chat, 20, true)}<span class="badge">3</span></span><span class="rb">${I(ICON.bell, 20)}<span class="badge">9+</span></span>${av(me, 40)}</div>
</header>
<div class="mlay">
  <aside class="mleft" aria-label="Atalhos">
    <a class="nav-item" href="#">${av(me, 36)}${esc(me)}</a>
    ${navItems.map(([t, ic, c]) => `<a class="nav-item" href="#"><span class="ni" style="background:${c}">${I(ic, 20)}</span>${t}</a>`).join('')}
    <div class="sect">Seus atalhos</div>
    <a class="nav-item" href="#">${sq('Brasileiros na Tailândia', 36)}Brasileiros na Tailândia — Vagas e Dicas</a>
    <a class="nav-item" href="#">${sq('Trabalho no Exterior', 36)}Trabalho no Exterior 2026</a>
    <a class="nav-item" href="#">${sq('Empregos Campinas', 36)}Empregos Campinas e Região</a>
  </aside>
  <main class="mfeed" role="feed" aria-label="Feed">
    <div class="stories">
      <div class="story me"><div class="bg"></div><span class="plus">${I(ICON.plus, 20)}</span><b>Criar story</b></div>
      ${STORY.map(([n, g]) => `<div class="story"><div class="bg" style="background:linear-gradient(160deg,${g})"></div>${av(n, 40)}<b>${esc(n)}</b></div>`).join('')}
    </div>
    <div class="card composer"><div class="row">${av(me, 40)}<span class="pill">No que você está pensando, Lucas?</span></div>
      <div class="acts"><span>${I(ICON.live, 22).replace('class="i"', 'class="i" style="color:#f02849"')}Vídeo ao vivo</span><span>${I(ICON.photo, 22).replace('class="i"', 'class="i" style="color:#45bd62"')}Foto/vídeo</span><span>${I(ICON.smile, 22).replace('class="i"', 'class="i" style="color:#f7b928"')}Sentimento</span></div></div>
    ${mPosts.map(mPost).join('\n')}
  </main>
  <aside class="mright" aria-label="Patrocinados e contatos">
    <div class="rhead">Patrocinado</div>
    <a class="ad" href="#"><span class="th" style="background:linear-gradient(135deg,#0ea5e9,#1e3a8a)">Curso de inglês grátis</span><span><b>Instituto Tecer Futuro (fictício)</b><small>tecerfuturo.example</small></span></a>
    <a class="ad" href="#"><span class="th" style="background:linear-gradient(135deg,#f59e0b,#b45309)">Vagas CLT na sua cidade</span><span><b>Emprega+ (fictício)</b><small>empregamais.example</small></span></a>
    <div class="rhead" style="border-top:1px solid #ced0d4;margin-top:8px">Contatos <span>${I(ICON.search, 16)}</span></div>
    ${['Ana Paula', 'Diego Lima', 'Marina Costa', 'Bruno Alves', 'Camila Duarte', 'Tia Célia'].map((n) => `<a class="contact" href="#"><span class="wrap">${av(n, 36)}<span class="on"></span></span>${esc(n)}</a>`).join('')}
  </aside>
</div>
${SIM('../index.html', 'social/mural.html')}`;
  fs.writeFileSync(path.join(out, 'mural.html'), doc('Mural', M_CSS, mural, 'mural'));

  // ================================================================ REDEPRO (rede profissional: feed e vagas)
  const P_CSS = BASE_CSS + `
:root{--p-bg:#f4f2ee;--p-card:#fff;--p-ink:rgba(0,0,0,.9);--p-sub:rgba(0,0,0,.6);--p-line:#e8e8e8;--p-brand:#0b7a6e;--p-brand-dark:#075e55;--p-hover:rgba(0,0,0,.08)}
body{background:var(--p-bg);color:var(--p-ink);font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;font-size:14px}
.ptop{position:sticky;top:0;z-index:20;background:#fff;border-bottom:1px solid var(--p-line);height:52px}
.ptop .in{max-width:1128px;margin:0 auto;padding:0 16px;height:100%;display:flex;align-items:center;gap:8px}
.plogo{width:34px;height:34px;border-radius:5px;background:var(--p-brand);color:#fff;display:grid;place-items:center;font:800 17px/1 system-ui;letter-spacing:-1px}
.psearch{display:flex;align-items:center;gap:8px;background:#edf3f8;border-radius:4px;height:34px;padding:0 10px;width:280px;color:var(--p-sub)}
.pnav{margin-left:auto;display:flex;height:100%} .pnav a{min-width:80px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--p-sub);font-size:12px;border-bottom:2px solid transparent;position:relative}
.pnav a:hover{color:var(--p-ink)} .pnav a.on{color:var(--p-ink);border-bottom-color:var(--p-ink)} .pnav .badge{position:absolute;top:4px;left:50%;margin-left:4px;background:#cb112d;color:#fff;font:700 11px/1;border-radius:999px;padding:2px 5px}
.pnav .sep{border-left:1px solid var(--p-line);margin:0 6px}
.play{max-width:1128px;margin:24px auto 0;padding:0 16px;display:grid;grid-template-columns:225px minmax(0,1fr) 300px;gap:24px;align-items:start}
.pc{background:var(--p-card);border-radius:8px;box-shadow:0 0 0 1px rgba(140,140,140,.2)}
.prof{overflow:hidden;text-align:center} .prof .cover{height:56px;background:linear-gradient(120deg,#a7d7c5,#5c8d89 60%,#2f5d62)} .prof .av{margin:-36px auto 0;border:2px solid #fff;display:grid}
.prof h3{margin:12px 0 2px;font-size:16px} .prof .hl{color:var(--p-sub);font-size:12px;padding:0 12px 12px} .prof .st{border-top:1px solid var(--p-line);padding:12px;text-align:left;font-size:12px;color:var(--p-sub);display:flex;justify-content:space-between} .prof .st b{color:var(--p-brand)}
.prof .sv{border-top:1px solid var(--p-line);padding:12px;text-align:left;font-size:12px;font-weight:600;display:flex;gap:8px;align-items:center}
.startp{padding:12px 16px 4px} .startp .row{display:flex;gap:8px;align-items:center} .startp .pill{flex:1;border:1px solid #8c8c8c;border-radius:35px;padding:12px 16px;color:var(--p-sub);font-weight:600}
.startp .acts{display:flex;justify-content:space-around;padding:4px 0} .startp .acts span{display:flex;gap:8px;align-items:center;padding:12px 8px;border-radius:4px;color:var(--p-sub);font-weight:600}
.sortby{display:flex;align-items:center;gap:8px;margin:8px 0;color:var(--p-sub);font-size:12px} .sortby hr{flex:1;border:0;border-top:1px solid #c9c9c9}
.fs{margin-bottom:8px} .fs .ctx{padding:8px 16px;border-bottom:1px solid var(--p-line);color:var(--p-sub);font-size:12px}
.actor{display:flex;gap:8px;padding:12px 16px 0;align-items:flex-start} .actor .who{flex:1;min-width:0} .actor .who b{font-size:14px;font-weight:600} .actor .deg{color:var(--p-sub);font-weight:400}
.actor .hl{color:var(--p-sub);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis} .actor .tm{color:var(--p-sub);font-size:12px;display:flex;gap:4px;align-items:center}
.follow{color:var(--p-brand);font-weight:600;display:flex;gap:4px;align-items:center;padding:4px 8px;border-radius:4px} .follow:hover{background:#e6f2f0}
.commentary{padding:8px 16px 8px;white-space:pre-line;font-size:14px;line-height:1.43} .commentary .tag{color:var(--p-brand);font-weight:600} .commentary .more{color:var(--p-sub)}
.fs .imgw{background:#f3f2ef} .fs .imgw img{max-height:700px;object-fit:contain}
.jobcard{display:flex;gap:12px;align-items:center;background:#eef3f8;padding:12px 16px;border-top:1px solid var(--p-line)} .jobcard b{display:block;font-size:14px} .jobcard small{color:var(--p-sub);display:block} .jobcard .btn{margin-left:auto;border:1px solid var(--p-brand);color:var(--p-brand);border-radius:999px;padding:5px 14px;font-weight:600;white-space:nowrap}
.social{display:flex;justify-content:space-between;align-items:center;padding:8px 16px;color:var(--p-sub);font-size:12px} .social .rx .re{width:16px;height:16px;font-size:10px;border-width:1px}
.acts4{display:flex;border-top:1px solid var(--p-line);margin:0 12px;padding:2px 0} .acts4 span{flex:1;display:flex;gap:6px;justify-content:center;align-items:center;padding:10px 4px;border-radius:4px;color:var(--p-sub);font-weight:600} .acts4 span:hover{background:var(--p-hover)}
.news h2{font-size:16px;margin:0;padding:12px 16px 4px} .news ul{list-style:none;margin:0;padding:0 0 8px} .news li{padding:6px 16px 6px 28px;position:relative} .news li:before{content:"•";position:absolute;left:14px;color:var(--p-sub);font-size:18px;line-height:1}
.news li b{display:block;font-size:14px} .news li small{color:var(--p-sub);font-size:12px} .promo{padding:12px 16px;text-align:center;color:var(--p-sub);font-size:12px}
.foot{color:var(--p-sub);font-size:12px;text-align:center;padding:16px;line-height:1.8}
/* página de vaga */
.jlay{max-width:1128px;margin:24px auto 0;padding:0 16px;display:grid;grid-template-columns:400px minmax(0,1fr);gap:0;align-items:start}
.jlist{background:#fff;border:1px solid var(--p-line);border-radius:8px 0 0 8px;overflow:hidden;position:sticky;top:68px;max-height:calc(100vh - 110px);overflow-y:auto}
.jlist .hd{padding:14px 16px;border-bottom:1px solid var(--p-line)} .jlist .hd b{font-size:16px} .jlist .hd small{display:block;color:var(--p-sub)}
.ji{display:flex;gap:10px;padding:12px 16px;border-bottom:1px solid var(--p-line);border-left:3px solid transparent} .ji.on{background:#edf3f8;border-left-color:var(--p-brand)} .ji b{color:var(--p-brand);font-size:15px;display:block} .ji small{display:block;color:var(--p-sub)} .ji .pr{color:#01754f;font-size:12px;margin-top:4px}
.jdet{background:#fff;border:1px solid var(--p-line);border-left:0;border-radius:0 8px 8px 0;padding:24px;min-width:0}
.jdet .co{display:flex;gap:8px;align-items:center;font-size:14px} .jdet h1{font-size:24px;line-height:1.25;margin:10px 0 6px;font-weight:600}
.jdet .sub{color:var(--p-sub);font-size:14px} .jdet .sub b{color:#01754f;font-weight:600}
.jdet .ins{list-style:none;padding:0;margin:14px 0} .jdet .ins li{display:flex;gap:8px;align-items:center;margin:6px 0;color:var(--p-ink)} .jdet .ins .i{color:var(--p-sub)}
.jdet .pillx{display:inline-block;background:#e6f2f0;color:#075e55;border-radius:4px;padding:2px 8px;font-size:12px;font-weight:600;margin-right:6px}
.jbtns{display:flex;gap:8px;margin:16px 0 4px} .apply{background:var(--p-brand);color:#fff;border-radius:999px;padding:10px 20px;font-weight:600;font-size:16px;display:inline-flex;gap:8px;align-items:center} .apply:hover{background:var(--p-brand-dark)}
.save{border:1px solid var(--p-brand);color:var(--p-brand);border-radius:999px;padding:10px 20px;font-weight:600;font-size:16px}
.jsec{border-top:1px solid var(--p-line);margin-top:24px;padding-top:20px} .jsec h2{font-size:20px;margin:0 0 12px;font-weight:600}
.hirer{display:flex;gap:12px;align-items:center;border:1px solid var(--p-line);border-radius:8px;padding:14px} .hirer small{display:block;color:var(--p-sub)} .hirer .msgb{margin-left:auto;border:1px solid #666;border-radius:999px;padding:5px 14px;font-weight:600;color:#444}
.about{white-space:pre-line;line-height:1.5} .jdet .flyerw{max-width:520px;margin-top:12px;border:1px solid var(--p-line);border-radius:8px;overflow:hidden}
.coabout{display:flex;gap:12px;align-items:center} .coabout small{display:block;color:var(--p-sub)}
dialog{border:0;border-radius:8px;max-width:480px;padding:20px} dialog::backdrop{background:rgba(0,0,0,.5)} dialog .apply{border:0;cursor:pointer;font-size:15px}
@media (max-width:1000px){.play{grid-template-columns:minmax(0,1fr) 300px} .play .left{display:none} .psearch{width:200px} .jlay{grid-template-columns:minmax(0,1fr)} .jlist{display:none} .jdet{border-left:1px solid var(--p-line);border-radius:8px}}
@media (max-width:760px){.play{grid-template-columns:minmax(0,1fr);padding:0;margin-top:8px} .play .right{display:none} .pnav a{min-width:56px} .pnav a span.t,.psearch span,.pnav .sep{display:none} .psearch{width:auto} .pc{border-radius:0} .jlay{padding:0;margin-top:0} .jdet{border-radius:0;padding:16px}}`;

  const ptop = (on) => `<header class="ptop"><div class="in">
  <a class="plogo" href="redepro.html" aria-label="RedePro — início">rp</a>
  <div class="psearch">${I(ICON.search, 16)}<span>Pesquisar</span></div>
  <nav class="pnav" aria-label="Navegação">
    <a${on === 'home' ? ' class="on"' : ''} href="redepro.html">${I(ICON.home, 24)}<span class="t">Início</span></a>
    <a href="#">${I(ICON.network, 24)}<span class="t">Minha rede</span></a>
    <a${on === 'jobs' ? ' class="on"' : ''} href="redepro-vaga.html">${I(ICON.briefcase, 24)}<span class="t">Vagas</span></a>
    <a href="#">${I(ICON.msg, 24)}<span class="badge">2</span><span class="t">Mensagens</span></a>
    <a href="#">${I(ICON.bell, 24)}<span class="badge">5</span><span class="t">Notificações</span></a>
    <a href="#">${av(me, 24)}<span class="t">Eu ▾</span></a>
    <span class="sep"></span>
    <a href="#">${I(ICON.grid, 24)}<span class="t">Para negócios ▾</span></a>
  </nav></div></header>`;
  const profCard = `<div class="pc prof"><div class="cover"></div>${av(me, 72)}<h3>${esc(me)}</h3><div class="hl">Procurando oportunidades em atendimento e TI · Campinas/SP</div>
    <div class="st"><span>Quem viu seu perfil</span><b>23</b></div><div class="st" style="border-top:0;padding-top:0"><span>Impressões da publicação</span><b>148</b></div>
    <div class="sv">${I(ICON.bookmark, 16)}Itens salvos</div></div>`;
  const pPosts = [
    { urn: '7391200000000000001', author: 'Ana Lima', deg: '3º+', headline: 'Talent Acquisition | Lotus Digital Solutions · Recrutamento internacional', when: '6 h', ctx: 'Marcos Vieira comentou isto',
      text: '<span class="tag">#hiring</span> Oportunidade internacional para brasileiros!\nCustomer Support em Bangkok. Todos os detalhes no flyer.\nInteressados, comentem "EU QUERO" que eu chamo no privado.', flyer: 'scam-bangkok', job: v11, rx: ['like', 'clap', 'idea'], n: '312', counts: '198 comentários · 24 compartilhamentos' },
    { urn: '7391200000000000002', author: 'Carlos Menezes', deg: '2º', headline: 'Coordenador de Logística na Logística Aurora (fictícia)', when: '1 d',
      text: 'Estamos contratando auxiliares de logística em Campinas/SP, CLT, R$ 2.300 + benefícios, 44h semanais. Inscrições pelo site logistica-aurora.example/vagas. Processo seletivo gratuito, sem nenhuma taxa. <span class="tag">#vagas</span> <span class="tag">#campinas</span>', rx: ['like', 'love'], n: '88', counts: '12 comentários' },
    { urn: '7391200000000000003', author: 'Patrícia Gomes', deg: '1º', headline: 'Analista de Dados | SQL · Python · Power BI', when: '2 d', ctx: 'Patrícia Gomes começou em um novo cargo',
      text: 'Feliz em compartilhar que estou começando em um novo cargo como Analista de Dados! Obrigada a todos que me ajudaram nessa jornada.', rx: ['clap', 'love', 'like'], n: '540', counts: '96 comentários' },
    { urn: '7391200000000000004', author: 'Hotel Atlântico Lda (fictício)', company: true, headline: '1.204 seguidores · Hotelaria · Porto, Portugal', when: '3 d',
      text: 'Vagas de cozinheiro(a) no Porto. Contrato de trabalho escrito enviado antes da viagem e apoio ao visto de trabalho. € 1.150 por mês. Seleção sem taxas, entrevista por vídeo.', job: byKey.v6, jobHref: '../vaga/' + byKey.v6.slug + '.html', rx: ['like'], n: '205', counts: '31 comentários' }
  ];
  const pPost = (p) => `<div class="pc fs" data-urn="urn:li:activity:${p.urn}">
  ${p.ctx ? `<div class="ctx">${esc(p.ctx)}</div>` : ''}
  <div class="actor">${p.company ? sq(p.author, 48) : av(p.author, 48)}<div class="who"><b><a href="#">${esc(p.author)}</a></b>${p.deg ? ` <span class="deg">• ${esc(p.deg)}</span>` : ''}<div class="hl">${esc(p.headline)}</div><div class="tm">${esc(p.when)} • ${I(ICON.globe, 12)}</div></div>
    <a class="follow" href="#">${I(ICON.plus, 16)}Seguir</a></div>
  <div class="commentary">${p.text}</div>
  ${p.flyer ? `<div class="imgw">${flyerImg(p.flyer, '../')}</div>` : ''}
  ${p.job ? `<a class="jobcard" href="${p.jobHref || 'redepro-vaga.html'}">${sq(p.job.company_name, 40)}<span><b>${esc(p.job.title)}</b><small>${esc(p.job.company_name)} · ${esc(p.job.location)}</small></span><span class="btn">Ver vaga</span></a>` : ''}
  <a data-elo-permalink href="#feed/update/urn:li:activity:${p.urn}" style="display:none">post</a>
  <div class="social"><span>${REACT(p.rx)} ${esc(p.n)}</span><span>${esc(p.counts)}</span></div>
  <div class="acts4"><span>${I(ICON.like, 18)}Gostei</span><span>${I(ICON.comment, 18)}Comentar</span><span>${I(ICON.repost, 18)}Compartilhar</span><span>${I(ICON.send, 18)}Enviar</span></div>
</div>`;
  const newsCard = `<div class="pc news"><h2>Notícias da RedePro</h2><ul>
    <li><b>Itamaraty alerta para vagas falsas na Ásia</b><small>há 2 h • 12.431 leitores</small></li>
    <li><b>Como checar uma empresa antes da entrevista</b><small>há 5 h • 3.120 leitores</small></li>
    <li><b>Contratações temporárias crescem no fim do ano</b><small>há 1 d • 8.904 leitores</small></li>
    <li><b>Trabalho no exterior: o que exigir no contrato</b><small>há 2 d • 5.233 leitores</small></li></ul></div>
    <div class="pc promo" style="margin-top:8px">Promovido · <b>Curso gratuito de atendimento</b><br>Instituto Tecer Futuro (fictício)</div>
    <div class="foot">Sobre · Acessibilidade · Central de Ajuda<br>Privacidade e termos · Opções de anúncio<br>RedePro © 2026 (rede fictícia)</div>`;
  const redepro = `${ptop('home')}
<div class="play">
  <aside class="left">${profCard}</aside>
  <main>
    <div class="pc startp"><div class="row">${av(me, 48)}<span class="pill">Comece uma publicação</span></div>
      <div class="acts"><span>${I(ICON.photo, 22).replace('class="i"', 'class="i" style="color:#378fe9"')}Mídia</span><span>${I(ICON.calendar, 22).replace('class="i"', 'class="i" style="color:#c37d16"')}Evento</span><span>${I(ICON.article, 22).replace('class="i"', 'class="i" style="color:#e06847"')}Escrever artigo</span></div></div>
    <div class="sortby"><hr><span>Classificar por: <b style="color:var(--p-ink)">Relevantes ▾</b></span></div>
    ${pPosts.map(pPost).join('\n')}
  </main>
  <aside class="right">${newsCard}</aside>
</div>
${SIM('../index.html', 'social/redepro.html')}`;
  fs.writeFileSync(path.join(out, 'redepro.html'), doc('Feed | RedePro', P_CSS, redepro, 'redepro'));

  // ---------------- página da vaga (lista à esquerda, detalhe à direita, como os portais profissionais)
  const others = D.demoJobs.filter((j) => j.key !== 'v11').slice(0, 6);
  const v11ld = { '@context': 'https://schema.org', '@type': 'JobPosting', title: v11.title, url: 'https://elo-demo.local/redepro/jobs/view/4100000001', datePosted: '2026-11-03', description: v11.description,
    employmentType: 'FULL_TIME', hiringOrganization: { '@type': 'Organization', name: v11.company_name }, jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: v11.location } } };
  const vaga = `${ptop('jobs')}
<div class="jlay">
  <aside class="jlist" aria-label="Vagas recomendadas">
    <div class="hd"><b>Principais vagas recomendadas para você</b><small>Com base no seu perfil e nas suas pesquisas · ${others.length + 1} resultados</small></div>
    <a class="ji on" href="redepro-vaga.html">${sq(v11.company_name, 48)}<span><b>${esc(v11.title)}</b><small>${esc(v11.company_name)}</small><small>${esc(v11.location)} (Presencial)</small><div class="pr">● Candidatura simplificada</div></span></a>
    ${others.map((j) => `<a class="ji" href="../vaga/${j.slug}.html">${sq(j.company_name || 'Empresa', 48)}<span><b>${esc(j.title)}</b><small>${esc(j.company_name || 'Empresa não informada')}</small><small>${esc(j.location || 'Local não informado')}</small></span></a>`).join('')}
  </aside>
  <main class="jdet">
    <div class="co">${sq(v11.company_name, 24)}<a href="#"><b>${esc(v11.company_name)}</b></a></div>
    <h1>${esc(v11.title)}</h1>
    <div class="sub">${esc(v11.location)} · há 4 dias · <b>Mais de 100 candidaturas</b></div>
    <ul class="ins">
      <li>${I(ICON.briefcase, 22)}<span><span class="pillx">Presencial</span><span class="pillx">Tempo integral</span><span class="pillx">Nível de entrada</span></span></li>
      <li>${I(ICON.building, 22)}<span>2-10 funcionários · Serviços de TI · página criada em out. 2026</span></li>
      <li>${I(ICON.check, 22)}<span>Veja como você se compara a mais de 100 candidatos</span></li>
    </ul>
    <div class="jbtns"><button class="apply" type="button" onclick="document.getElementById('apply').showModal()">Candidatura simplificada</button><button class="save" type="button">Salvar</button></div>
    <div class="jsec"><h2>Conheça a equipe de contratação</h2>
      <div class="hirer">${av('Ana Lima', 56)}<span><b>Ana Lima</b> <span class="deg" style="color:var(--p-sub)">• 3º+</span><small>Talent Acquisition | Lotus Digital Solutions</small><small>Perfil criado há 2 semanas · 3 conexões</small></span><span class="msgb">Enviar mensagem</span></div></div>
    <div class="jsec"><h2>Sobre a vaga</h2>
      <div class="about">${esc(v11.description)}</div>
      <div class="flyerw">${flyerImg(v11.flyer, '../')}</div>
      <div data-elo-inline></div>
    </div>
    <div class="jsec"><h2>Sobre a empresa</h2>
      <div class="coabout">${sq(v11.company_name, 56)}<span><b>${esc(v11.company_name)}</b><small>14 seguidores · Serviços de TI · 2-10 funcionários</small><small>Sem site informado · sem registro público encontrado</small></span></div></div>
    <p class="sub" style="margin-top:20px;font-size:12px"><b style="color:var(--p-sub)">Sobre este exemplo:</b> ${esc(v11.pattern)}</p>
  </main>
</div>
<dialog id="apply"><p>Simulação: neste padrão, a "candidatura simplificada" leva a uma conversa no Telegram que pede foto do passaporte e embarque rápido. Não envie documentos. Nenhum dado foi enviado.</p><form method="dialog"><button class="apply">Entendi</button></form></dialog>
<script type="application/ld+json">${JSON.stringify(v11ld).replace(/</g, '\\u003c')}</script>
${SIM('../index.html', 'social/redepro-vaga.html')}`;
  fs.writeFileSync(path.join(out, 'redepro-vaga.html'), doc(v11.title + ' | Lotus Digital Solutions | RedePro', P_CSS, vaga, 'redepro'));
};
