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
    const top = res.indicators.slice(0, 3);
    const portals = (res.support || []).filter((s) => s.support_type === 'portal_emprego' && (res.abroad ? s.country !== 'BR' : s.country === 'BR'));
    const canTranslate = res.lang && res.lang !== 'pt' && 'Translator' in self;
    sh.innerHTML = `<style>
      .box{font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#101828;border:2px solid ${L.color};border-radius:12px;background:#fff;overflow:hidden}
      .head{background:${L.bg};padding:12px 14px;display:flex;gap:10px;align-items:flex-start} .ic{flex:none;width:28px;height:28px;border-radius:50%;background:${L.color};color:#fff;display:grid;place-items:center;font-weight:700}
      .head b{color:${L.color};font-size:16px} .body{padding:12px 14px} ul{margin:6px 0 0;padding-left:18px} li{margin-bottom:6px} q{color:#475467;font-size:13px}
      button{font:600 14px system-ui,sans-serif;border-radius:8px;padding:9px 12px;cursor:pointer;border:1px solid #d0d5dd;background:#fff;color:#101828;margin:8px 8px 0 0}
      button.main{background:#101828;color:#fff;border-color:#101828} h4{margin:14px 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#475467}
      .alt{border:1px solid #eaecf0;border-radius:10px;padding:10px;margin-bottom:8px} .alt small{color:#667085} a{color:#175cd3} .tr{background:#f9fafb;border-radius:8px;padding:10px;margin-top:8px;white-space:pre-wrap} .lang{font-size:12px;color:#475467}
    </style>
    <div class="box" role="region" aria-label="Análise ELO desta vaga">
      <div class="head"><div class="ic">${L.icon}</div><div><b>ELO: ${L.label}${res.preliminary ? ' (preliminar)' : ''}</b><div>${esc(res.justification)}</div>${res.lang && res.lang !== 'pt' ? `<div class="lang">Anúncio em ${esc(res.lang_name)} — analisado com as regras nesse idioma.</div>` : ''}</div></div>
      <div class="body">
        ${top.length ? `<b>Por que parece ${res.level === 'alto_risco' ? 'falsa ou perigosa' : 'suspeita'}:</b><ul>${top.map((a) => `<li><b>${esc(a.title)}</b><br><q>${esc(a.evidence[0])}</q></li>`).join('')}</ul>${res.indicators.length > 3 ? `<div class="lang">+ ${res.indicators.length - 3} outro(s) sinal(is) nos detalhes.</div>` : ''}` : `<div>Nenhum sinal de risco no texto. Mesmo assim, confirme a empresa e nunca pague para se candidatar.</div>`}
        <button class="main" type="button" data-a="details">${risky ? 'Ver em detalhes por que parece falsa' : 'Ver análise completa'}</button>
        ${canTranslate ? '<button type="button" data-a="translate">Traduzir anúncio para português</button>' : ''}
        <div class="tr" hidden></div>
        ${risky && res.alternatives && res.alternatives.length ? `<h4>Vagas que parecem mais seguras</h4>${res.alternatives.map((o) => `<div class="alt"><b>${esc(o.title)}</b><br><small>${esc(o.institution)} · ${esc(o.location || '')}${o.salary ? ' · ' + esc(o.salary) : ''}${o.is_demo ? ' · parceira fictícia (demo)' : ''}</small><br>${o.url ? `<a href="${esc(o.url)}" target="_blank" rel="noopener">Ver vaga</a>` : ''}</div>`).join('')}` : ''}
        ${risky ? themeLinks(res).replace('<h3>', '<h4>').replace('</h3>', '</h4>').replaceAll('class="card"', 'class="alt"') : ''}
        ${risky && portals.length ? `<h4>Procure em portais oficiais</h4>${portals.map((s) => `<div class="alt"><b>${esc(s.institution)}</b><br><small>${esc(s.description || '')}</small><br><a href="${esc(s.official_url)}" target="_blank" rel="noopener">Abrir portal oficial</a></div>`).join('')}` : ''}
      </div>
    </div>`;
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
 
  // ------------------------------------------------------------------ vagas reais do mesmo tema (busca em portais)
  function themeLinks(res) {
    const th = res.theme || { occupations: [] };
    const terms = th.occupations.length ? th.occupations : [];
    if (!terms.length) return '';
    const loc = th.city ? th.city.replace(/\b\w/g, (c) => c.toUpperCase()) : (res.abroad ? '' : 'Brasil');
    const items = terms.map((t) => {
      const q = encodeURIComponent(t), l = encodeURIComponent(loc);
      return `<div class="card"><b>${esc(t.replace(/\b\w/g, (c) => c.toUpperCase()))}${loc ? ' — ' + esc(loc) : ''}</b><br>
        <a href="https://br.indeed.com/jobs?q=${q}&l=${l}" target="_blank" rel="noopener">Indeed</a> ·
        <a href="https://www.linkedin.com/jobs/search/?keywords=${q}&location=${l || 'Brasil'}" target="_blank" rel="noopener">LinkedIn Vagas</a> ·
        <a href="https://www.gov.br/pt-br/servicos/buscar-emprego-no-sistema-nacional-de-emprego-sine" target="_blank" rel="noopener">SINE (gov.br)</a></div>`;
    }).join('');
    return `<h3>Vagas reais do mesmo tema</h3>${items}<p class="muted" style="font-size:12px">Busca nos portais com o cargo identificado no anúncio. O ELO também analisa as vagas que você abrir lá.</p>`;
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
    const basis = (ids) => ids.map((id) => legal[id] ? `<a href="${esc(legal[id].url)}" target="_blank" rel="noopener" title="${esc(legal[id].summary)}">${esc(legal[id].short)}</a>` : '').join(' · ');
    const list = (items, fn, empty) => items && items.length ? `<ul>${items.map(fn).join('')}</ul>` : `<p class="muted">${empty}</p>`;
    const source = res.mode === 'supabase'
      ? `Consultado e registrado no Supabase · análise <code>${esc(String(res.analysis_id).slice(0, 8))}</code> · ${new Date(res.stored_at).toLocaleString('pt-BR')}`
      : `Modo local — ${esc(res.mode_reason || '')}. Mesmas regras, dados de demonstração.`;
    sh.innerHTML = `<style>
      *{box-sizing:border-box} .back{position:fixed;inset:0;background:rgba(16,24,40,.35)}
      aside{position:fixed;top:0;right:0;height:100%;width:min(440px,100%);background:#fff;color:#101828;font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;box-shadow:-8px 0 24px rgba(16,24,40,.18);overflow:auto;padding:20px}
      header{display:flex;justify-content:space-between;align-items:start;gap:12px} h2{font-size:17px;margin:0 0 2px} h3{font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#475467;margin:20px 0 8px}
      .close{border:0;background:#f2f4f7;border-radius:8px;padding:6px 10px;cursor:pointer;font:inherit}
      .lvl{border-radius:10px;padding:12px;margin:14px 0;border:1px solid} .lvl b{font-size:15px}
      ul{margin:0;padding-left:18px} li{margin:0 0 10px} .muted{color:#667085;margin:0} .ev{display:block;background:#f9fafb;border-left:3px solid #d0d5dd;padding:4px 8px;margin:4px 0;font-size:13px;color:#344054}
      .basis{font-size:12px;color:#475467} a{color:#175cd3} .sev{font-size:11px;font-weight:700;text-transform:uppercase;margin-left:6px}
      .card{border:1px solid #eaecf0;border-radius:10px;padding:10px;margin-bottom:8px} .card small{color:#667085}
      form{display:grid;gap:8px} select,textarea{font:inherit;padding:8px;border:1px solid #d0d5dd;border-radius:8px;width:100%} textarea{min-height:80px}
      .send{background:#101828;color:#fff;border:0;border-radius:8px;padding:9px;font:600 14px system-ui;cursor:pointer} .src{font-size:12px;color:#667085;border-top:1px solid #eaecf0;margin-top:20px;padding-top:10px}
      code{font-size:12px}
    </style>
    <div class="back"></div>
    <aside role="dialog" aria-label="Análise ELO">
      <header><div><h2>${esc(job.title)}</h2><div class="muted">${esc(job.company || 'Empresa não informada')}${job.location ? ' · ' + esc(job.location) : ''}</div></div><button class="close" type="button">Fechar</button></header>
      <div class="lvl" style="border-color:${L.color};background:${L.bg}"><b style="color:${L.color}">${L.icon} ${L.label}${res.preliminary ? ' — análise preliminar' : ''}</b><div>${esc(res.justification)}</div></div>
 
      <h3>Alertas identificados (${res.indicators.length})</h3>
      ${list(res.indicators, (a) => `<li><b>${esc(a.title)}</b><span class="sev" style="color:${a.severity === 'critico' ? '#b42318' : a.severity === 'alto' ? '#b54708' : '#475467'}">${esc(a.severity)}</span><div>${esc(a.description)}</div>${a.evidence.map((e) => `<span class="ev">“${esc(e)}”</span>`).join('')}<div class="basis">Fundamento: ${basis(a.basis)}</div></li>`, 'Nenhum sinal de risco encontrado no texto disponível.')}
 
      <h3>Informações verificadas</h3>
      ${list(res.verified, (v) => `<li><b>${esc(v.item)}:</b> ${esc(v.value)} <span class="basis">— ${esc(v.source)}</span></li>`, 'Nada pôde ser verificado em fonte externa.')}
 
      <h3>Informações insuficientes</h3>
      ${list(res.insufficient, (v) => `<li>${esc(v)}</li>`, 'Nenhuma lacuna importante.')}
 
      ${res.alternatives && res.alternatives.length ? `<h3>Vagas parecidas verificadas</h3>${res.alternatives.map((o) => `<div class="card"><b>${esc(o.title)}</b><br><small>${esc(o.institution)} · ${esc(o.location || '')} ${o.salary ? '· ' + esc(o.salary) : ''}${o.is_demo ? ' · parceira fictícia (demo)' : ''}</small><br>${o.url ? `<a href="${esc(o.url)}" target="_blank" rel="noopener">Ver oportunidade</a>` : ''}</div>`).join('')}<p class="muted" style="font-size:12px">Vindas da base ELO de parceiros verificados — não de toda a internet.</p>` : ''}
      ${res.level !== 'sem_alertas' ? themeLinks(res) : ''}
 
      ${res.level === 'alto_risco' || res.level === 'atencao' ? `<h3>Onde pedir ajuda (canais oficiais)</h3>${(res.support || []).filter((s) => !['reintegracao', 'portal_emprego'].includes(s.support_type)).slice(0, 6).map((s) => `<div class="card"><b>${esc(s.institution)}</b>${s.phone ? ` · <b>${esc(s.phone)}</b>` : ''}<br><small>${esc(s.description || '')}</small><br><a href="${esc(s.official_url)}" target="_blank" rel="noopener">Site oficial</a></div>`).join('')}<p class="muted" style="font-size:12px">O ELO não envia denúncias às autoridades. Em perigo imediato no Brasil, ligue 190.</p>` : ''}
 
      ${res.level !== 'sem_alertas' ? (() => { const portals = (res.support || []).filter((s) => s.support_type === 'portal_emprego' && (res.abroad ? s.country !== 'BR' : s.country === 'BR')); return portals.length ? `<h3>Onde procurar vagas reais com segurança</h3>${portals.map((s) => `<div class="card"><b>${esc(s.institution)}</b><br><small>${esc(s.description || '')}</small><br><a href="${esc(s.official_url)}" target="_blank" rel="noopener">Abrir portal oficial</a></div>`).join('')}` : ''; })() : ''}
 
      <h3>Relatar inconsistência</h3>
      <form>
        <select name="category"><option value="inconsistencia">Informação inconsistente</option><option value="cobranca">Pediram dinheiro</option><option value="documentos">Pediram/retiveram documentos</option><option value="pressao">Pressão para aceitar</option><option value="outro">Outro</option></select>
        <textarea name="body" placeholder="O que você percebeu? Não inclua seus dados pessoais." maxlength="2000" required minlength="10"></textarea>
        <button class="send" type="submit">Enviar para moderação</button>
        <div class="muted msg" role="status"></div>
      </form>
      <div class="src">${source}<br>Regras v${esc(res.rules_version)} · sem IA treinada: regras escritas a partir das fontes citadas.</div>
    </aside>`;
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