/* ELO — content script. Detecta vagas automaticamente e mostra selo + painel explicável.
 * Estratégias (da mais precisa à mais genérica):
 *  1. [data-elo-job] (página de demonstração)       → análise completa
 *  2. JSON-LD JobPosting (LinkedIn, Indeed, Gupy...)  → análise completa
 *  3. Resultados do Google                            → análise PRELIMINAR (título + resumo)
 *  4. Posts de feed ([role=article]: Facebook etc.)   → lê o texto visível de cada post
 *  5. Página genérica com cara de vaga (h1 + texto)   → análise completa
 */
(() => {
  if (window.__ELO_LOADED__) return; window.__ELO_LOADED__ = true;
  const R = globalThis.ELORules;
  const HOST = location.hostname.replace(/^www\./, '');
  const IS_GOOGLE = /(^|\.)google\.[a-z.]+$/.test(HOST) && location.pathname.startsWith('/search');
  const IS_SERP = () => IS_GOOGLE || !!document.querySelector('[data-elo-serp]'); // buscador real ou simulado
  const IS_SOCIAL = /(^|\.)(facebook|instagram|linkedin|x|twitter|threads)\.(com|net)$/.test(HOST);
  const done = new WeakMap(); // elemento -> hash do texto analisado
  let paused = false;
 
  const LEVEL = {
    alto_risco: { label: 'Alto risco', color: '#b42318', bg: '#fef3f2', icon: '⚠' },
    atencao: { label: 'Atenção', color: '#b54708', bg: '#fffaeb', icon: '!' },
    dados_insuficientes: { label: 'Dados insuficientes', color: '#475467', bg: '#f2f4f7', icon: '?' },
    sem_alertas: { label: 'Sem alertas', color: '#067647', bg: '#ecfdf3', icon: '✓' },
  };
 
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const txt = (el) => (el ? (el.innerText || el.textContent || '').trim() : '');
  const send = (msg) => new Promise((res) => { try { chrome.runtime.sendMessage(msg, (r) => res(r || { ok: false, error: chrome.runtime.lastError?.message })); } catch (e) { res({ ok: false, error: String(e) }); } });
 
  // ------------------------------------------------------------------ extração
  function fromDataAttr(el) {
    const g = (k) => txt(el.querySelector(`[data-elo-${k}]`)) || null;
    return { title: g('title'), company: g('company'), location: g('location'), salary: g('salary'), description: g('description'),
      url: el.getAttribute('data-elo-url') || location.href, source: 'demo' };
  }
 
  function fromJsonLd() {
    const out = [];
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      let data; try { data = JSON.parse(s.textContent); } catch { continue; }
      const items = [].concat(data, data['@graph'] || []).flat();
      for (const it of items) {
        if (!it || !/JobPosting/.test([].concat(it['@type']).join(','))) continue;
        const div = document.createElement('div'); div.innerHTML = it.description || '';
        const sal = it.baseSalary && it.baseSalary.value ? `${it.baseSalary.currency || ''} ${it.baseSalary.value.value ?? it.baseSalary.value.minValue ?? ''} ${it.baseSalary.value.unitText || ''}`.trim() : null;
        const loc = [].concat(it.jobLocation || []).map((l) => l.address && [l.address.addressLocality, l.address.addressRegion, l.address.addressCountry].filter(Boolean).join(', ')).filter(Boolean).join(' / ');
        out.push({ title: it.title, company: it.hiringOrganization && it.hiringOrganization.name, company_url: it.hiringOrganization && (it.hiringOrganization.sameAs || it.hiringOrganization.url),
          description: (div.textContent || '').slice(0, 7000), location: loc || null, salary: sal, url: it.url || location.href, source: 'jsonld' });
      }
    }
    return out;
  }
 
  function googleResults() {
    const out = [];
    for (const h3 of document.querySelectorAll('#search a h3, #rso a h3, [data-elo-serp] a h3')) {
      const a = h3.closest('a'); const block = a && (a.closest('div.g, div[data-hveid], div.MjjYud, [data-elo-result]') || a.parentElement);
      if (!a || !block) continue;
      if (/(\.gov\.br|\.gov|\.gov\.[a-z]{2}|europa\.eu|\.gc\.ca)$/.test((() => { try { return new URL(a.href).hostname; } catch { return ''; } })())) continue; // sites oficiais de governo
      const snippet = txt(block).replace(txt(h3), '').slice(0, 600);
      const text = txt(h3) + ' ' + snippet;
      if (!R.isJobLike(text)) continue;
      out.push({ el: block, anchor: a, job: { title: txt(h3), company: null, description: snippet, url: a.href, source: 'google', preliminary: true } });
    }
    return out;
  }
 
  function feedPosts() {
    const out = [];
    // Facebook atual: posts do feed = [aria-posinset] ou filhos de [role=feed]; comentários = [role=article] aninhados.
    // LinkedIn: [data-urn*="activity"]; X/Twitter: [data-testid=tweet]; demo e outros: [role=article].
    const SEL = '[aria-posinset], [role="feed"] > div, [data-pagelet^="FeedUnit"], [data-urn*="activity"], [data-testid="tweet"], [role="article"], [data-elo-post]';
    const posts = [...document.querySelectorAll(SEL)].filter((p) => !(p.parentElement && p.parentElement.closest(SEL))); // só o bloco mais externo
    for (const p of posts) {
      // o texto de vagas costuma estar DENTRO da imagem; o Facebook descreve esse texto no "alt" das imagens
      const alts = [...p.querySelectorAll('img[alt]')].map((i) => i.alt).filter((a) => a.length > 15).join('\n');
      const t = (txt(p) + (alts ? '\n' + alts : '')).slice(0, 9000);
      if (t.length < 60 || !R.isJobLike(t)) continue;
      // link externo do anúncio (o Facebook embrulha em l.facebook.com/l.php?u=...)
      let company_url = null;
      for (const a of p.querySelectorAll('a[href]')) {
        let h = a.href; try { const u = new URL(h); if (/(^|\.)l\.facebook\.com$/.test(u.hostname) && u.searchParams.get('u')) h = u.searchParams.get('u'); } catch {}
        if (/^https?:/.test(h) && !/(facebook|fbcdn|instagram|whatsapp|wa\.me|linkedin|twitter|x\.com)\./.test(h) && !h.startsWith(location.origin)) { company_url = h; break; }
      }
      const link = p.querySelector('a[href*="/posts/"], a[href*="/permalink/"], a[href*="story_fbid"], a[href*="/p/"], a[data-elo-permalink]');
      const url = link ? link.href.split('?')[0] : location.href.split('#')[0] + '#elo-' + R.contentHash(t);
      const lines = t.split('\n').map((l) => l.trim()).filter(Boolean);
      // não envia nome de quem postou: título = primeira linha com cara de vaga
      const title = (lines.find((l) => R.isJobLike(l + ' vaga salario')) || lines[0] || 'Post com oferta de trabalho').slice(0, 140);
      out.push({ el: p, job: { title, company: null, company_url, description: t.slice(0, 7000), url, source: 'facebook', preliminary: t.length < 120 } });
    }
    return out;
  }
 
  function genericPage() {
    const h1 = document.querySelector('h1');
    const main = document.querySelector('main, [role="main"], article') || document.body;
    const t = txt(main).slice(0, 7000);
    if (!h1 || !R.isJobLike(txt(h1) + ' ' + t.slice(0, 1500)) || !/vaga|emprego|job|salario|salário|contrat/i.test(txt(h1) + document.title)) return null;
    return { el: h1, job: { title: txt(h1).slice(0, 200), company: null, description: t, url: location.href, source: 'pagina' } };
  }
 
  // ------------------------------------------------------------------ selo
  function badge(target, job, placement) {
    const host = document.createElement('elo-badge');
    host.style.cssText = 'all:initial;display:inline-block;margin:4px 0;position:relative;z-index:2147483000;';
    const sh = host.attachShadow({ mode: 'open' });
    sh.innerHTML = `<style>
      button{font:600 12px/1.2 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;border-radius:999px;padding:5px 10px;border:1px solid #d0d5dd;background:#fff;color:#344054;cursor:pointer;display:inline-flex;gap:6px;align-items:center}
      .dot{width:16px;height:16px;border-radius:50%;display:inline-grid;place-items:center;font-size:11px;color:#fff;background:#98a2b3}
      .pre{font-weight:500;opacity:.75}
      .why{font:12.5px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:4px 2px 0;max-width:560px}
    </style><button type="button" title="Ver análise do ELO"><span class="dot">…</span><span class="lbl">ELO analisando…</span></button><div class="why"></div>`;
    const btn = sh.querySelector('button');
    let current = null;
    const paint = (res) => {
      current = res; const L = LEVEL[res.level];
      btn.style.borderColor = L.color; btn.style.background = L.bg; btn.style.color = L.color;
      sh.querySelector('.dot').style.background = L.color; sh.querySelector('.dot').textContent = L.icon;
      const n = res.indicators.length;
      sh.querySelector('.lbl').innerHTML = `ELO: ${L.label}${n ? ' · ' + n + (n > 1 ? ' sinais' : ' sinal') : ''}${res.preliminary ? ' <span class="pre">(preliminar)</span>' : ''}`;
      // motivo visível sem clicar
      const SHORT = [['empresa', 'empresa'], ['Salário', 'salário'], ['contrato', 'contrato'], ['Local', 'local']];
      const missing = SHORT.filter(([k]) => res.insufficient.some((x) => x.includes(k) && !/consulado/.test(x))).map(([, v]) => v);
      const why = n ? res.indicators.slice(0, 2).map((a) => a.title).join(' · ') + (n > 2 ? ` · +${n - 2}` : '')
        : missing.length ? 'Faltam dados: ' + missing.join(', ') + '. Confirme antes de enviar documentos.' : 'Nenhum sinal de risco no texto visível.';
      const w = sh.querySelector('.why'); w.textContent = why + ' — clique no selo para detalhes.'; w.style.color = L.color;
    };
    btn.addEventListener('click', async (e) => {
      e.preventDefault(); e.stopPropagation();
      // ao clicar, garante consulta ao servidor (se configurado) para registrar e trazer dados do banco
      const r = await send({ type: 'analyze', job, opts: { forceServer: true } });
      if (r.ok) { paint(r.result); openPanel(job, r.result); } else if (current) openPanel(job, current);
    });
    if (placement === 'prepend') target.prepend(host); else if (placement === 'after') target.after(host); else target.appendChild(host);
    return { host, paint, fail: (m) => { sh.querySelector('.lbl').textContent = 'ELO: erro — ' + m; } };
  }
 
  async function process(el, job, placement, anchor, inline) {
    const h = R.contentHash([job.title, job.description].join(' '));
    if (done.get(el) === h) return;
    const prev = el.__eloBadge; if (prev) prev.host.remove();
    done.set(el, h);
    const b = badge(anchor || el, job, placement); el.__eloBadge = b;
    const r = await send({ type: 'analyze', job });
    if (!r.ok) return b.fail(r.error || 'sem resposta');
    b.paint(r.result);
    // Social: só mostra selo quando há algo a dizer (não polui o feed)
    if (job.source === 'facebook' && r.result.level === 'sem_alertas') b.host.style.display = 'none';
    if (inline) renderInline(job, r.result);
  }
 
  // ------------------------------------------------------------------ componentes visuais (abas, ícones, cartões)
  const svg = (d, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON_PATHS = {
    COBRANCA_TAXA: '<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2s1.3 1.7 3 2 3 .8 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6v2m0 8v2"/>',
    RETENCAO_DOCUMENTOS: '<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M8.5 17h7"/>',
    PASSAPORTE_ANTECIPADO: '<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M8.5 17h7"/>',
    SERVIDAO_DIVIDA: '<path d="M9 15l6-6"/><path d="M10.5 6.5l1.8-1.8a4 4 0 015.7 5.7l-1.8 1.8M13.5 17.5l-1.8 1.8a4 4 0 01-5.7-5.7l1.8-1.8"/>',
    RESTRICAO_LIBERDADE: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>',
    JORNADA_EXAUSTIVA: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    ALOJAMENTO_ISOLADO: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>',
    PADRAO_SUDESTE_ASIATICO: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>',
    SINAIS_EXPLORACAO_SEXUAL: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    PRESSAO_URGENCIA: '<path d="M6 3h12M6 21h12M7 3c0 4 5 5 5 9s-5 5-5 9M17 3c0 4-5 5-5 9s5 5 5 9"/>',
    SEM_CONDICOES_CONTRATUAIS: '<path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 3v6h6M9 14l6 6M15 14l-6 6"/>',
    PROMESSA_VAGA: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    CONTATO_INFORMAL: '<path d="M21 12a8 8 0 01-11.8 7L4 20l1.1-4.6A8 8 0 1121 12z"/>',
    INFORMACOES_CONTRADITORIAS: '<path d="M4 21V9l8-6 8 6v12"/><path d="M9 21v-6h6v6"/><path d="M10 9h4"/>',
    DOMINIO_RECENTE: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
    ANUNCIO_REPLICADO: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/>',
    CADASTRO_EMPREGADORES: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
    _default: '<path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    ok: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
    job: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M3 13h18"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    gov: '<path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18"/>',
    help: '<path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .4 1.9.7 2.8a2 2 0 01-.5 2.1L8 9.9a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.4c.9.3 1.8.6 2.8.7a2 2 0 011.7 2z"/>',
    alert: '<path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  };
  const icon = (id, size) => svg(ICON_PATHS[id] || ICON_PATHS._default, size);
  const SEV = {
    critico: { label: 'Crítico', color: '#b42318', bg: '#fef3f2', rank: 0 },
    alto: { label: 'Alto', color: '#b54708', bg: '#fffaeb', rank: 1 },
    medio: { label: 'Médio', color: '#475467', bg: '#f2f4f7', rank: 2 },
  };
  const sev = (s) => SEV[s] || SEV.medio;
  const sortBySeverity = (list) => [...(list || [])].sort((a, b) => sev(a.severity).rank - sev(b.severity).rank);
  const officialPortals = (res) => (res.support || []).filter((s) => s.support_type === 'portal_emprego' && (res.abroad ? s.country !== 'BR' : s.country === 'BR'));
  const helpChannels = (res) => (res.support || []).filter((s) => !['reintegracao', 'portal_emprego'].includes(s.support_type)).slice(0, 6);
  const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());

  const UI_CSS = `
    *{box-sizing:border-box}
    .tabs{display:flex;gap:4px;border-bottom:1px solid #eaecf0;margin:0 0 14px}
    .tab{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:6px;padding:10px 12px;font:600 14px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#667085;border-bottom:3px solid transparent;margin-bottom:-1px;border-radius:6px 6px 0 0}
    .tab:hover{color:#101828;background:#f9fafb} .tab:focus{outline:none} .tab:focus-visible{outline:2px solid #175cd3;outline-offset:-2px}
    .tab[aria-selected="true"]{color:#101828;border-bottom-color:var(--accent,#101828)}
    .tab .n{font-size:12px;min-width:20px;padding:3px 6px;border-radius:999px;background:#f2f4f7;color:#344054;text-align:center}
    .tab[aria-selected="true"] .n{background:var(--accent,#101828);color:#fff}
    [role="tabpanel"][hidden]{display:none}
    .hero{display:flex;gap:12px;align-items:flex-start;border-radius:12px;padding:14px;border:1px solid}
    .hero .hi{flex:none;width:44px;height:44px;border-radius:12px;display:grid;place-items:center;color:#fff}
    .hero .kicker{font:700 11px/1 system-ui,sans-serif;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}
    .hero .t{font-weight:700;font-size:16px;line-height:1.3;color:#101828}
    .quote{display:block;margin-top:8px;background:#fff;border-left:3px solid currentColor;border-radius:0 6px 6px 0;padding:6px 10px;font-size:13px;color:#344054;font-style:italic}
    .pill{display:inline-block;font:700 11px/1 system-ui,sans-serif;text-transform:uppercase;letter-spacing:.04em;padding:4px 8px;border-radius:999px;vertical-align:middle}
    .sig{display:flex;gap:10px;align-items:flex-start;padding:12px 0;border-top:1px solid #f2f4f7}
    .sig:first-child{border-top:0}
    .sig .si{flex:none;width:34px;height:34px;border-radius:10px;display:grid;place-items:center}
    .sig .st{font-weight:600;color:#101828}
    .sig .sd{font-size:13px;color:#475467;margin-top:2px}
    .sig .quote{background:#f9fafb}
    .basis{font-size:12px;color:#475467;margin-top:4px} .basis a{color:#175cd3}
    .sec{display:flex;align-items:center;gap:8px;margin:18px 0 8px;font:700 12px/1.2 system-ui,sans-serif;text-transform:uppercase;letter-spacing:.05em;color:#475467}
    .sec:first-child{margin-top:4px} .sec svg{color:#667085}
    .job{display:flex;gap:10px;align-items:center;border:1px solid #eaecf0;border-radius:12px;padding:12px;margin-bottom:8px;background:#fff}
    .job .ji{flex:none;width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:#ecfdf3;color:#067647}
    .job.gov .ji{background:#eff8ff;color:#175cd3} .job.srch .ji{background:#f4f3ff;color:#5925dc}
    .job .jb{flex:1;min-width:0} .job b{display:block;color:#101828;line-height:1.3} .job small{display:block;color:#667085;font-size:12.5px;margin-top:2px}
    .job .links{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
    .go{flex:none;display:inline-block;text-decoration:none;font:600 13px/1 system-ui,sans-serif;padding:8px 10px;border-radius:8px;background:#101828;color:#fff;white-space:nowrap}
    .go.sm{padding:6px 8px;font-size:12px;background:#f2f4f7;color:#101828}
    .go:hover{opacity:.9}
    .tag{display:inline-block;font-size:11px;font-weight:600;color:#067647;background:#ecfdf3;border-radius:999px;padding:2px 7px;margin-left:4px;vertical-align:middle}
    .note{font-size:12px;color:#667085;margin:6px 0 0}
    .okbox{display:flex;gap:10px;align-items:flex-start;background:#ecfdf3;color:#067647;border-radius:12px;padding:12px}
    .okbox div{color:#101828}
    ul.plain{margin:0;padding-left:18px} ul.plain li{margin:0 0 6px}
  `;

  // abas acessíveis dentro de um shadow root
  function tabsHTML(id, items) {
    const vis = items.filter((t) => t.show !== false);
    return `<div class="tabs" role="tablist" aria-label="Análise ELO">${vis.map((t, i) => `<button class="tab" type="button" role="tab" id="${id}-t${i}" aria-controls="${id}-p${i}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${t.icon ? icon(t.icon, 16) : ''}${esc(t.label)}${t.count != null ? `<span class="n">${t.count}</span>` : ''}</button>`).join('')}</div>
      ${vis.map((t, i) => `<div role="tabpanel" id="${id}-p${i}" aria-labelledby="${id}-t${i}" tabindex="0"${i ? ' hidden' : ''}>${t.html}</div>`).join('')}`;
  }
  function wireTabs(root) {
    const tabs = [...root.querySelectorAll('[role="tab"]')];
    const select = (t, kb) => {
      for (const x of tabs) { const on = x === t; x.setAttribute('aria-selected', on); x.tabIndex = on ? 0 : -1; root.getElementById(x.getAttribute('aria-controls')).hidden = !on; }
      if (kb) t.focus();
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(t));
      t.addEventListener('keydown', (e) => {
        const k = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
        if (k) { e.preventDefault(); select(tabs[(i + k + tabs.length) % tabs.length], true); }
        if (e.key === 'Home') { e.preventDefault(); select(tabs[0], true); }
        if (e.key === 'End') { e.preventDefault(); select(tabs[tabs.length - 1], true); }
      });
    });
  }

  // aba "Alerta": aviso principal em destaque + demais sinais com ícone
  function alertTab(res, { full = false, basis = null } = {}) {
    const L = LEVEL[res.level];
    const list = sortBySeverity(res.indicators);
    if (!list.length) {
      return `<div class="okbox">${icon('ok', 22)}<div><b>Nenhum sinal de risco no texto${res.preliminary ? ' disponível' : ''}.</b><br>Mesmo assim, confirme a empresa e nunca pague para se candidatar.</div></div>`;
    }
    const [main, ...rest] = list;
    const S = sev(main.severity);
    const sig = (a) => { const s = sev(a.severity); return `<div class="sig"><div class="si" style="background:${s.bg};color:${s.color}">${icon(a.id)}</div><div style="flex:1;min-width:0">
      <span class="st">${esc(a.title)}</span> <span class="pill" style="background:${s.bg};color:${s.color}">${s.label}</span>
      ${full ? `<div class="sd">${esc(a.description)}</div>` : ''}
      ${(full ? a.evidence : a.evidence.slice(0, 1)).map((e) => `<q class="quote" style="color:${s.color}"><span style="color:#344054">${esc(e)}</span></q>`).join('')}
      ${full && basis ? `<div class="basis">Fundamento: ${basis(a.basis)}</div>` : ''}</div></div>`; };
    const why = full ? '' : `<div class="sec">${icon('alert', 16)}Por que parece ${res.level === 'alto_risco' ? 'falsa ou perigosa' : 'suspeita'}</div>`;
    return `${why}<div class="hero" style="background:${L.bg};border-color:${L.color}33">
        <div class="hi" style="background:${S.color}">${icon(main.id, 24)}</div>
        <div style="flex:1;min-width:0"><div class="kicker" style="color:${S.color}">Alerta principal · ${S.label}</div>
          <div class="t">${esc(main.title)}</div>
          ${full ? `<div class="sd" style="font-size:13px;color:#475467;margin-top:4px">${esc(main.description)}</div>` : ''}
          ${(full ? main.evidence : main.evidence.slice(0, 1)).map((e) => `<q class="quote" style="color:${S.color}"><span style="color:#344054">${esc(e)}</span></q>`).join('')}
          ${full && basis ? `<div class="basis">Fundamento: ${basis(main.basis)}</div>` : ''}
        </div></div>
      ${rest.length ? `<div class="sec">${icon('alert', 16)}O que mais o ELO encontrou (${rest.length})</div>${(full ? rest : rest.slice(0, 3)).map(sig).join('')}${!full && rest.length > 3 ? `<p class="note">+ ${rest.length - 3} outro(s) sinal(is) em “Ver em detalhes”.</p>` : ''}` : ''}`;
  }

  // aba "Vagas verdadeiras": parceiras verificadas + busca em portais + portais oficiais
  function jobsCount(res) {
    return (res.alternatives || []).length + ((res.theme && res.theme.occupations) || []).length + officialPortals(res).length;
  }
  function jobsTab(res, { altTitle = 'Vagas que parecem mais seguras', portalTitle = 'Procure em portais oficiais' } = {}) {
    const alts = res.alternatives || [];
    const portals = officialPortals(res);
    const th = res.theme || { occupations: [] };
    const loc = th.city ? titleCase(th.city) : (res.abroad ? '' : 'Brasil');
    const parts = [];
    if (alts.length) parts.push(`<div class="sec">${icon('job', 16)}${esc(altTitle)}</div>${alts.map((o) => `<div class="job"><div class="ji">${icon('job')}</div><div class="jb"><b>${esc(o.title)}${o.is_demo ? '<span class="tag">demo</span>' : ''}</b><small>${esc(o.institution)}${o.location ? ' · ' + esc(o.location) : ''}${o.salary ? ' · ' + esc(o.salary) : ''}</small></div>${o.url ? `<a class="go" href="${esc(o.url)}" target="_blank" rel="noopener">Ver vaga</a>` : ''}</div>`).join('')}<p class="note">Da base ELO de parceiros verificados — não de toda a internet.${alts.some((o) => o.is_demo) ? ' Parceiras marcadas "demo" são fictícias.' : ''}</p>`);
    if (th.occupations.length) parts.push(`<div class="sec">${icon('search', 16)}Vagas reais do mesmo tema</div>${th.occupations.map((t) => { const q = encodeURIComponent(t), l = encodeURIComponent(loc); return `<div class="job srch"><div class="ji">${icon('search')}</div><div class="jb"><b>${esc(titleCase(t))}${loc ? ' — ' + esc(loc) : ''}</b><div class="links"><a class="go sm" href="https://br.indeed.com/jobs?q=${q}&l=${l}" target="_blank" rel="noopener">Indeed</a><a class="go sm" href="https://www.linkedin.com/jobs/search/?keywords=${q}&location=${l || 'Brasil'}" target="_blank" rel="noopener">LinkedIn Vagas</a><a class="go sm" href="https://www.gov.br/pt-br/servicos/buscar-emprego-no-sistema-nacional-de-emprego-sine" target="_blank" rel="noopener">SINE</a></div></div></div>`; }).join('')}<p class="note">Busca nos portais com o cargo identificado no anúncio. O ELO também analisa as vagas que você abrir lá.</p>`);
    if (portals.length) parts.push(`<div class="sec">${icon('gov', 16)}${esc(portalTitle)}</div>${portals.map((s) => `<div class="job gov"><div class="ji">${icon('gov')}</div><div class="jb"><b>${esc(s.institution)}</b><small>${esc(s.description || '')}</small></div><a class="go" href="${esc(s.official_url)}" target="_blank" rel="noopener">Abrir</a></div>`).join('')}`);
    return parts.join('') || '<p class="note">Nenhuma vaga parecida encontrada para este anúncio.</p>';
  }

  // ------------------------------------------------------------------ análise no meio da página da vaga
  async function translate(text, from) {
    try {
      if (!('Translator' in self)) return null;
      const t = await self.Translator.create({ sourceLanguage: from, targetLanguage: 'pt' });
      return await t.translate(text);
    } catch { return null; }
  }
  function renderInline(job, res) {
    document.querySelector('elo-inline')?.remove();
    const slot = document.querySelector('[data-elo-inline]');
    const h1 = document.querySelector('h1');
    const host = document.createElement('elo-inline');
    host.style.cssText = 'all:initial;display:block;margin:16px 0;';
    const sh = host.attachShadow({ mode: 'open' });
    const L = LEVEL[res.level];
    const risky = res.level === 'alto_risco' || res.level === 'atencao';
    const canTranslate = res.lang && res.lang !== 'pt' && 'Translator' in self;
    const nJobs = jobsCount(res);
    sh.innerHTML = `<style>${UI_CSS}
      .box{--accent:${L.color};font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#101828;border:2px solid ${L.color};border-radius:14px;background:#fff;overflow:hidden;box-shadow:0 4px 16px rgba(16,24,40,.08)}
      .head{background:${L.bg};padding:14px 16px;display:flex;gap:12px;align-items:flex-start}
      .ic{flex:none;width:32px;height:32px;border-radius:50%;background:${L.color};color:#fff;display:grid;place-items:center;font-weight:700;font-size:16px}
      .head b{color:${L.color};font-size:17px} .body{padding:6px 16px 16px}
      .actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;padding-top:14px;border-top:1px solid #eaecf0}
      button.act{font:600 14px system-ui,sans-serif;border-radius:8px;padding:10px 14px;cursor:pointer;border:1px solid #d0d5dd;background:#fff;color:#101828}
      button.main{background:#101828;color:#fff;border-color:#101828}
      .tr{background:#f9fafb;border-radius:8px;padding:10px;margin-top:10px;white-space:pre-wrap} .lang{font-size:12px;color:#475467;margin-top:2px}
    </style>
    <div class="box" role="region" aria-label="Análise ELO desta vaga">
      <div class="head"><div class="ic">${L.icon}</div><div><b>ELO: ${L.label}${res.preliminary ? ' (preliminar)' : ''}</b><div>${esc(res.justification)}</div>${res.lang && res.lang !== 'pt' ? `<div class="lang">Anúncio em ${esc(res.lang_name)} — analisado com as regras nesse idioma.</div>` : ''}</div></div>
      <div class="body">
        ${tabsHTML('elo-in', [
          { label: 'Alerta', icon: 'alert', count: res.indicators.length, html: alertTab(res) },
          { label: 'Vagas verdadeiras', icon: 'job', count: nJobs, show: risky && nJobs > 0, html: jobsTab(res) },
        ])}
        <div class="actions">
          <button class="act main" type="button" data-a="details">${risky ? 'Ver em detalhes por que parece falsa' : 'Ver análise completa'}</button>
          ${canTranslate ? '<button class="act" type="button" data-a="translate">Traduzir anúncio para português</button>' : ''}
        </div>
        <div class="tr" hidden></div>
      </div>
    </div>`;
    wireTabs(sh);
    sh.querySelector('[data-a="details"]').onclick = () => openPanel(job, res);
    const tb = sh.querySelector('[data-a="translate"]');
    if (tb) tb.onclick = async () => { const box = sh.querySelector('.tr'); box.hidden = false; box.textContent = 'Traduzindo no seu navegador…'; box.textContent = (await translate(job.description, res.lang)) || 'Não foi possível traduzir neste Chrome.'; };
    if (slot) slot.replaceChildren(host);
    else if (h1) (h1.closest('header, section, div') || h1).after(host);
  }

  function scan() {
    if (paused) return;
    let found = false;
    for (const el of document.querySelectorAll('[data-elo-job]')) { found = true; process(el, fromDataAttr(el), 'after', el.querySelector('[data-elo-title]') || el); }
    if (found) return;
    if (IS_SERP()) { for (const g of googleResults()) process(g.el, g.job, 'after', g.anchor); return; }
    const posts = feedPosts();
    for (const p of posts) process(p.el, p.job, 'prepend');
    if (IS_SOCIAL && posts.length) return;
    const ld = fromJsonLd();
    if (ld.length) { const h1 = document.querySelector('h1') || document.body.firstElementChild; process(h1, ld[0], 'after', null, true); return; }
    if (!posts.length) { const g = genericPage(); if (g) process(g.el, g.job, 'after', null, true); }
  }
 
  // ------------------------------------------------------------------ painel
  let panelHost = null;
  function openPanel(job, res) {
    panelHost?.remove();
    panelHost = document.createElement('elo-panel');
    panelHost.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;';
    const sh = panelHost.attachShadow({ mode: 'open' });
    const L = LEVEL[res.level];
    const legal = res.legal || R.LEGAL;
    const basis = (ids) => ids.map((id) => legal[id] ? `<a href="${esc(legal[id].url)}" target="_blank" rel="noopener" title="${esc(legal[id].summary)}">${esc(legal[id].short)}</a>` : '').filter(Boolean).join(' · ');
    const list = (items, fn, empty) => items && items.length ? `<ul class="plain">${items.map(fn).join('')}</ul>` : `<p class="muted">${empty}</p>`;
    const risky = res.level === 'alto_risco' || res.level === 'atencao';
    const nJobs = jobsCount(res);
    const source = res.mode === 'supabase'
      ? `Consultado e registrado no Supabase · análise <code>${esc(String(res.analysis_id).slice(0, 8))}</code> · ${new Date(res.stored_at).toLocaleString('pt-BR')}`
      : `Modo local — ${esc(res.mode_reason || '')}. Mesmas regras, dados de demonstração.`;
    const help = helpChannels(res);
    const alertHTML = `${alertTab(res, { full: true, basis })}
      <div class="sec">${icon('ok', 16)}Informações verificadas</div>
      ${list(res.verified, (v) => `<li><b>${esc(v.item)}:</b> ${esc(v.value)} <span class="basis">— ${esc(v.source)}</span></li>`, 'Nada pôde ser verificado em fonte externa.')}
      <div class="sec">${icon('_default', 16)}Informações insuficientes</div>
      ${list(res.insufficient, (v) => `<li>${esc(v)}</li>`, 'Nenhuma lacuna importante.')}
      ${risky && help.length ? `<div class="sec">${icon('help', 16)}Onde pedir ajuda (canais oficiais)</div>${help.map((s) => `<div class="job gov"><div class="ji">${icon('help')}</div><div class="jb"><b>${esc(s.institution)}${s.phone ? ` · ${esc(s.phone)}` : ''}</b><small>${esc(s.description || '')}</small></div><a class="go sm" href="${esc(s.official_url)}" target="_blank" rel="noopener">Site oficial</a></div>`).join('')}<p class="note">O ELO não envia denúncias às autoridades. Em perigo imediato no Brasil, ligue 190.</p>` : ''}`;
    sh.innerHTML = `<style>${UI_CSS}
      .back{position:fixed;inset:0;background:rgba(16,24,40,.4)}
      aside{--accent:${L.color};position:fixed;top:0;right:0;height:100%;width:min(480px,100%);background:#fff;color:#101828;font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;box-shadow:-8px 0 24px rgba(16,24,40,.18);overflow:auto;padding:20px}
      header{display:flex;justify-content:space-between;align-items:start;gap:12px} h2{font-size:18px;margin:0 0 2px;line-height:1.3}
      h3{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#475467;margin:22px 0 8px}
      .close{border:0;background:#f2f4f7;border-radius:8px;padding:8px 12px;cursor:pointer;font:600 13px system-ui,sans-serif}
      .lvl{border-radius:12px;padding:12px 14px;margin:14px 0 16px;display:flex;gap:10px;align-items:flex-start}
      .lvl .ic{flex:none;width:28px;height:28px;border-radius:50%;color:#fff;display:grid;place-items:center;font-weight:700}
      .lvl b{font-size:15px} .muted{color:#667085;margin:0}
      form{display:grid;gap:8px} select,textarea{font:inherit;padding:8px;border:1px solid #d0d5dd;border-radius:8px;width:100%} textarea{min-height:80px}
      .send{background:#101828;color:#fff;border:0;border-radius:8px;padding:10px;font:600 14px system-ui;cursor:pointer}
      .src{font-size:12px;color:#667085;border-top:1px solid #eaecf0;margin-top:20px;padding-top:10px} code{font-size:12px}
    </style>
    <div class="back"></div>
    <aside role="dialog" aria-label="Análise ELO">
      <header><div><h2>${esc(job.title)}</h2><div class="muted">${esc(job.company || 'Empresa não informada')}${job.location ? ' · ' + esc(job.location) : ''}</div></div><button class="close" type="button">Fechar</button></header>
      <div class="lvl" style="background:${L.bg}"><div class="ic" style="background:${L.color}">${L.icon}</div><div><b style="color:${L.color}">${L.label}${res.preliminary ? ' — análise preliminar' : ''}</b><div>${esc(res.justification)}</div></div></div>

      ${tabsHTML('elo-pn', [
        { label: 'Alerta', icon: 'alert', count: res.indicators.length, html: alertHTML },
        { label: 'Vagas verdadeiras', icon: 'job', count: nJobs, show: res.level !== 'sem_alertas' && nJobs > 0, html: jobsTab(res, { altTitle: 'Vagas parecidas verificadas', portalTitle: 'Onde procurar vagas reais com segurança' }) },
      ])}

      <h3>Relatar inconsistência</h3>
      <form>
        <select name="category"><option value="inconsistencia">Informação inconsistente</option><option value="cobranca">Pediram dinheiro</option><option value="documentos">Pediram/retiveram documentos</option><option value="pressao">Pressão para aceitar</option><option value="outro">Outro</option></select>
        <textarea name="body" placeholder="O que você percebeu? Não inclua seus dados pessoais." maxlength="2000" required minlength="10"></textarea>
        <button class="send" type="submit">Enviar para moderação</button>
        <div class="muted msg" role="status"></div>
      </form>
      <div class="src">${source}<br>Regras v${esc(res.rules_version)} · sem IA treinada: regras escritas a partir das fontes citadas.</div>
    </aside>`;
    wireTabs(sh);
    const close = () => { panelHost?.remove(); panelHost = null; };
    sh.querySelector('.close').onclick = close; sh.querySelector('.back').onclick = close;
    sh.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target, msg = sh.querySelector('.msg');
      msg.textContent = 'Enviando…';
      const r = await send({ type: 'report', payload: { job_url: job.url, category: f.category.value, body: f.body.value } });
      msg.textContent = r.ok ? (r.result.message || 'Relato registrado como pendente de moderação.') : 'Erro: ' + r.error;
      if (r.ok) f.body.value = '';
    });
    document.documentElement.appendChild(panelHost);
  }

  // ------------------------------------------------------------------ ciclo
  let timer = null;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(scan, 700); };
  chrome.storage.local.get('pausedHosts').then(({ pausedHosts = [] }) => {
    paused = pausedHosts.includes(HOST);
    if (paused) return;
    scan();
    new MutationObserver((muts) => {
      if (muts.every((m) => [...m.addedNodes].every((n) => n.nodeName === 'ELO-BADGE' || n.nodeName === 'ELO-PANEL'))) return;
      schedule();
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  window.__ELO_SCAN__ = scan; // usado nos testes
})();