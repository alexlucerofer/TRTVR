/* ELO — service worker.
 * Recebe pedidos de análise do content script. Se o Supabase estiver configurado, chama a Edge Function
 * `analyze` (que consulta e GRAVA no banco). Se não estiver, ou se falhar, usa o MODO LOCAL com o mesmo
 * motor de regras e os dados de demonstração — e informa isso na tela.
 */
importScripts('lib/rules.js', 'lib/analyze_core.js', 'config.js');

let seedPromise = null;
const seed = () => (seedPromise ||= fetch(chrome.runtime.getURL('data/seed.json')).then((r) => r.json()));
let localDb = null;
const cache = new Map(); // url+hash -> {at, result} (evita reanalisar ao rolar a página)

const DEFAULT_API = 'http://localhost:8787';
async function getSettings() {
  const s = await chrome.storage.local.get(['apiUrl', 'adminKey', 'autoImage', 'profile']);
  return { apiUrl: (s.apiUrl || DEFAULT_API).replace(/\/$/, ''), adminKey: s.adminKey || '', autoImage: !!s.autoImage, profile: s.profile || null };
}

async function getConfig() {
  const s = await chrome.storage.local.get(['supabaseUrl', 'anonKey']);
  const d = self.ELO_DEFAULT_CONFIG || {};
  return { url: (s.supabaseUrl || d.supabaseUrl || '').replace(/\/$/, ''), key: s.anonKey || d.anonKey || '' };
}

// ---------- histórico local (fica só neste navegador; nunca vai para o servidor inteiro)
async function historySignals(job) {
  const R = self.ELORules;
  const { history = [] } = await chrome.storage.local.get('history');
  const text = [job.title, job.description].join(' ');
  const { phones } = R.extractContacts(text);
  const signals = [], notes = [];
  for (const h of history) {
    if (h.url === job.url) continue;
    const shared = phones.filter((p) => (h.phones || []).includes(p));
    if (shared.length && h.company && job.company && R.norm(h.company) !== R.norm(job.company)) {
      signals.push({ kind: 'mesmo_contato_outra_empresa', text: 'O mesmo telefone apareceu em ' + h.seen_at.slice(0, 10) + ' em anúncio de "' + h.company + '".' });
    }
    if (h.text && R.similarity(text, h.text) >= 0.7) {
      notes.push('Você viu um anúncio quase igual em ' + h.seen_at.slice(0, 10) + (h.company ? ' ("' + h.company + '")' : '') + (h.salary && h.salary !== job.salary ? '; salário era ' + h.salary : '') + '.');
    }
  }
  return { signals: signals.slice(0, 3), notes: [...new Set(notes)].slice(0, 2), phones };
}
async function remember(job, phones) {
  const { history = [] } = await chrome.storage.local.get('history');
  const entry = { url: job.url, company: job.company || null, salary: job.salary || null, phones, text: [job.title, job.description].join(' ').slice(0, 1500), seen_at: new Date().toISOString() };
  const next = [entry, ...history.filter((h) => h.url !== job.url)].slice(0, 300);
  await chrome.storage.local.set({ history: next });
}

async function analyzeJob(job, opts = {}) {
  const key = job.url + '|' + self.ELORules.contentHash([job.title, job.description].join(' '));
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60e3 && !(opts.forceServer && hit.result.mode !== 'supabase')) return hit.result;

  const hist = await historySignals(job);
  const cfg = await getConfig();
  const { profile } = await getSettings();
  // Feed social e Google: análise local primeiro; só vai ao servidor se houver sinal de risco ou clique.
  const localFirst = ['facebook', 'feed', 'google'].includes(job.source) && !opts.forceServer;
  let result = null, reason = null;

  if (localFirst) {
    const pre = self.ELORules.analyze(job, { local_history: hist.signals });
    if (pre.level === 'sem_alertas' || pre.level === 'dados_insuficientes' || !cfg.url) {
      result = await runLocal(job, hist, cfg.url ? 'análise local (sem sinais de risco; nada enviado ao servidor)' : 'Supabase não configurado', profile);
    }
  }
  if (!result && cfg.url && cfg.key) {
    try {
      const r = await fetch(cfg.url + '/functions/v1/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: cfg.key, Authorization: 'Bearer ' + cfg.key },
        body: JSON.stringify({ job, local_history: hist.signals, profile }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'HTTP ' + r.status);
      result = data;
    } catch (e) { reason = 'falha ao consultar o Supabase: ' + e.message; }
  }
  if (!result) result = await runLocal(job, hist, reason || 'Supabase não configurado', profile);

  for (const n of hist.notes) result.verified.push({ item: 'Seu histórico (só neste navegador)', value: n, source: 'ELO local' });
  await remember(job, hist.phones);
  cache.set(key, { at: Date.now(), result });
  return result;
}

async function runLocal(job, hist, reason, profile) {
  const s = await seed();
  localDb ||= self.ELOCore.memoryDb(s);
  const r = await self.ELOCore.runAnalysis({ job, local_history: hist.signals, profile }, { db: localDb, external: false, now: () => new Date() });
  return { mode: 'local', mode_reason: reason, ...r };
}

// Relato: vai para a API ELO (base de comparação: anúncios parecidos ou com o mesmo contato passam a mostrar o relato)
// e, se configurado, também para o Supabase (moderação). O texto do anúncio é público; o relato não leva dados de quem relata.
async function sendReport(payload, job, result) {
  const cfg = await getConfig();
  const v = self.ELOCore.validateReport(payload);
  const out = [];
  let apiOk = false;
  if (job && job.title) {
    const { apiUrl } = await getSettings();
    try {
      const r = await fetch(apiUrl + '/v1/relatos', { method: 'POST', headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' }, body: JSON.stringify({
        categoria: v.category, texto: v.body,
        job: { title: String(job.title).slice(0, 300), description: (job.description || '').slice(0, 8000) || null, company: job.company || null, location: job.location || null, salary: job.salary || null, url: /^https?:/.test(job.url || '') ? job.url : null },
        nivel: result && result.level || null, indicadores: (result && result.indicators || []).map((i) => i.id).slice(0, 30), imagem_sha256: result && result.image_sha256 || null }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof d.detail === 'string' ? d.detail : 'HTTP ' + r.status);
      apiOk = true;
      out.push(d.message + (d.parecidos_ja_reportados && d.parecidos_ja_reportados.length ? ' Já havia ' + d.parecidos_ja_reportados.length + ' relato(s) parecido(s).' : ''));
    } catch (e) { out.push('API ELO indisponível (' + e.message + ').'); }
  }
  if (cfg.url) {
    try {
      const r = await fetch(cfg.url + '/functions/v1/report', {
        method: 'POST', headers: { 'Content-Type': 'application/json', apikey: cfg.key, Authorization: 'Bearer ' + cfg.key }, body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'HTTP ' + r.status);
      out.push(data.message || 'Relato registrado no Supabase como pendente de moderação.');
    } catch (e) { if (!apiOk) throw e; out.push('Supabase: ' + e.message); }
  } else if (!apiOk) {
    out.push('Modo local: relato guardado só neste navegador.');
  }
  return { ok: true, message: out.join(' ') };
}

// ---------- leitura de imagem pela API ELO (Claude Vision / Tesseract)
// A imagem é baixada aqui no service worker (tem permissão de host) e enviada à API configurada no painel.
const imageCache = new Map(); // src -> {at, result}
async function imageBlob({ src, dataUrl }) {
  const url = dataUrl || src;
  if (!url || !/^(https?:|data:image\/)/.test(url)) throw new Error('endereço de imagem inválido');
  // o ngrok gratuito mostra uma página de aviso sem este cabeçalho (demo online)
  const r = await fetch(url, { credentials: 'omit', headers: url.startsWith('data:') ? {} : { 'ngrok-skip-browser-warning': '1' } });
  if (!r.ok) throw new Error('não consegui baixar a imagem (HTTP ' + r.status + ')');
  const b = await r.blob();
  if (!/^image\//.test(b.type)) throw new Error('o endereço não devolveu uma imagem (' + (b.type || 'tipo desconhecido') + ')');
  if (b.size > 5 * 1024 * 1024) throw new Error('imagem maior que 5 MB');
  return b;
}
async function analyzeImage(msg) {
  const key = msg.src && !msg.dataUrl ? msg.src + '|' + (msg.caption || '').length : null;
  const hit = key && imageCache.get(key);
  if (hit && Date.now() - hit.at < 30 * 60e3) return hit.result;
  const { apiUrl, profile } = await getSettings();
  const blob = await imageBlob(msg);
  const fd = new FormData();
  fd.append('arquivo', blob, 'anuncio.' + ((blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg')));
  if (msg.caption) fd.append('texto', String(msg.caption).slice(0, 3000));
  if (msg.url && /^https?:/.test(msg.url)) fd.append('url', msg.url.slice(0, 2000));
  if (profile) fd.append('perfil', JSON.stringify(profile));
  let r;
  try { r = await fetch(apiUrl + '/v1/analisar/imagem', { method: 'POST', body: fd, headers: { 'ngrok-skip-browser-warning': '1' } }); }
  catch {
    // sem API: os panfletos da demo ainda são reconhecidos aqui mesmo (flyers.json ao lado da imagem)
    const offline = await demoFlyerOffline(blob, msg, profile).catch(() => null);
    if (offline) { if (key) imageCache.set(key, { at: Date.now(), result: offline }); return offline; }
    throw new Error('API ELO fora do ar em ' + apiUrl + '. Rode "npm run api" nesta máquina ou coloque o endereço do ngrok no Painel → Configurações.');
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.detail ? (typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail)) : 'HTTP ' + r.status);
  const result = { ...data.analise, image_extraction: data.extraido, image_job: data.job, image_sha256: data.imagem_sha256 };
  for (const n of (await historySignals(data.job)).notes) result.verified.push({ item: 'Seu histórico (só neste navegador)', value: n, source: 'ELO local' });
  await remember(data.job, self.ELORules.extractContacts(data.job.description || '').phones);
  if (key) imageCache.set(key, { at: Date.now(), result });
  return result;
}

// Reserva sem servidor, só para as imagens da DEMO: compara o SHA-256 com demo/img/flyers.json
// (publicado ao lado dos panfletos, inclusive no GitHub Pages) e roda as mesmas regras no modo local.
async function demoFlyerOffline(blob, msg, profile) {
  if (!msg.src || !/^https?:/.test(msg.src)) return null;
  const sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const idx = await (await fetch(new URL('flyers.json', msg.src), { headers: { 'ngrok-skip-browser-warning': '1' } })).json();
  const f = Array.isArray(idx) && idx.find((x) => x.sha256 === sha);
  if (!f) return null;
  const job = { title: f.title || 'Anúncio em imagem', company: f.company ? f.company.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\B\w/g, (c) => c.toLowerCase()) : null,
    description: f.text + (msg.caption ? '\nLegenda: ' + String(msg.caption).slice(0, 1500) : ''), url: /^https?:/.test(msg.url || '') ? msg.url : msg.src, source: 'imagem' };
  const hist = await historySignals(job);
  const r = await runLocal(job, hist, 'API ELO fora do ar: panfleto da demonstração lido na própria extensão', profile);
  return { ...r, image_extraction: { engine: 'demo', model: null, campos: { texto_completo: f.text, titulo: f.title, empresa: job.company }, avisos: ['API ELO fora do ar: leitura de demonstração feita na própria extensão (só funciona com os panfletos da demo).'] }, image_job: job, image_sha256: sha };
}

// menu de contexto: clique direito em qualquer imagem
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'elo-image', title: 'Verificar esta imagem com o ELO', contexts: ['image'] });
});
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'elo-image' || !tab || tab.id == null) return;
  const tell = (m) => chrome.tabs.sendMessage(tab.id, m).catch(() => {});
  tell({ type: 'imageProgress', src: info.srcUrl });
  try { tell({ type: 'imageResult', src: info.srcUrl, result: await analyzeImage({ src: info.srcUrl, url: info.pageUrl }) }); }
  catch (e) { tell({ type: 'imageError', src: info.srcUrl, error: String(e.message || e) }); }
});

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    try {
      if (msg.type === 'analyze') return reply({ ok: true, result: await analyzeJob(msg.job, msg.opts) });
      if (msg.type === 'analyzeImage') return reply({ ok: true, result: await analyzeImage(msg) });
      if (msg.type === 'settings') { const s = await getSettings(); return reply({ ok: true, autoImage: s.autoImage, apiUrl: s.apiUrl }); }
      if (msg.type === 'report') return reply({ ok: true, result: await sendReport(msg.payload, msg.job, msg.result) });
      if (msg.type === 'status') { const c = await getConfig(); return reply({ ok: true, configured: !!(c.url && c.key), url: c.url }); }
      if (msg.type === 'clearHistory') { await chrome.storage.local.remove('history'); cache.clear(); return reply({ ok: true }); }
      reply({ ok: false, error: 'mensagem desconhecida' });
    } catch (e) { reply({ ok: false, error: String(e.message || e) }); }
  })();
  return true;
});
