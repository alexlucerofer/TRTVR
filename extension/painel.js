/* ELO — Painel: perfil (área/região), leitura de imagens, histórico e revisão (API ELO), configurações. */
(async () => {
  const $ = (id) => document.getElementById(id);
  const R = globalThis.ELORules;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LBL = { alto_risco: 'Alto risco', atencao: 'Atenção', sem_alertas: 'Sem alertas', dados_insuficientes: 'Dados insuficientes' };
  const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');

  // ---------------- abas
  const tabs = [...document.querySelectorAll('[role=tab]')];
  const select = (t) => { for (const x of tabs) { const on = x === t; x.setAttribute('aria-selected', on); x.tabIndex = on ? 0 : -1; $(x.getAttribute('aria-controls')).hidden = !on; } t.focus(); if (t.id === 't-hist') loadHist(); };
  tabs.forEach((t, i) => { t.onclick = () => select(t); t.onkeydown = (e) => { const k = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; if (k) select(tabs[(i + k + tabs.length) % tabs.length]); }; });
  if (location.hash === '#imagem') select($('t-img'));

  const st = await chrome.storage.local.get(['profile', 'apiUrl', 'adminKey', 'autoImage', 'supabaseUrl', 'anonKey', 'history']);
  const api = () => ($('api').value.trim() || 'http://localhost:8787').replace(/\/$/, '');
  const adminHeaders = () => ({ 'ngrok-skip-browser-warning': '1', 'X-Elo-Admin-Key': $('admin').value.trim() });

  // ---------------- perfil
  const chips = (el, map, name, sel) => { el.innerHTML = Object.entries(map).map(([k, v]) => `<label><input type="checkbox" name="${name}" value="${k}"${sel.includes(k) ? ' checked' : ''}><span>${esc(v)}</span></label>`).join(''); };
  const p = st.profile || { areas: [], regioes: [], origem_uf: null };
  chips($('areas'), R.AREA_NAME, 'areas', p.areas || []);
  chips($('regioes'), R.REGION_NAME, 'regioes', p.regioes || []);
  $('uf').insertAdjacentHTML('beforeend', UFS.map((u) => `<option${p.origem_uf === u ? ' selected' : ''}>${u}</option>`).join(''));
  for (const [k, v] of Object.entries(R.REGION_NAME)) $('f-regiao').insertAdjacentHTML('beforeend', `<option value="${k}">${esc(v)}</option>`);
  $('save-perfil').onclick = async () => {
    const vals = (n) => [...document.querySelectorAll(`input[name=${n}]:checked`)].map((i) => i.value);
    const profile = { areas: vals('areas'), regioes: vals('regioes'), origem_uf: $('uf').value || null };
    await chrome.storage.local.set({ profile });
    const sample = R.analyze({ title: 'Atendimento em Bangkok', description: 'Vaga de atendimento em Bangkok, Tailândia, sem experiência, salário US$ 1.800, passagem grátis, visto de turista, Telegram.' }, { profile });
    $('out-perfil').innerHTML = 'Perfil salvo. ' + (sample.profile_notes.length ? 'Exemplo de aviso numa vaga de atendimento na Tailândia:<br><i>' + sample.profile_notes.map(esc).join('<br>') + '</i>' : 'Com este perfil, avisos aparecem quando a vaga combina com a sua área/região.');
  };
  $('clear-perfil').onclick = async () => { await chrome.storage.local.remove('profile'); document.querySelectorAll('#p-perfil input').forEach((i) => (i.checked = false)); $('uf').value = ''; $('out-perfil').textContent = 'Perfil apagado.'; };

  // ---------------- resultado (compartilhado por imagem e revisão)
  function resultHTML(a, ex) {
    const f = (ex && ex.campos) || {}, c = f.contatos || {}, v = f.viagem || {};
    const rows = [['Empresa', f.empresa], ['Cargo', f.titulo], ['Local', [f.local, f.pais].filter(Boolean).join(', ')], ['Salário', f.salario],
      ['Contatos', [].concat(c.telegram || [], c.whatsapp || [], c.telefones || [], c.emails || [], c.sites || []).join(' · ')], ['Visto', v.visto], ['Rota', v.rota]].filter((r) => r[1]);
    return `<div class="lvl ${a.level}">${LBL[a.level] || a.level} · ${a.indicators.length} sinal(is)</div><p>${esc(a.justification)}</p>
      ${(a.profile_notes || []).map((n) => `<p><b>${esc(n)}</b></p>`).join('')}
      ${a.indicators.map((i) => `<div class="ind"><b>${esc(i.title)}</b><div class="muted">${i.evidence.map(esc).join(' · ')}</div></div>`).join('')}
      ${ex ? `<h2 style="margin-top:14px">Lido da imagem · ${ex.engine === 'claude' ? 'Claude Vision' + (ex.model ? ' (' + esc(ex.model) + ')' : '') : 'OCR local (Tesseract)'}</h2>
        ${rows.length ? `<dl>${rows.map((r) => `<dt>${esc(r[0])}</dt><dd>${esc(r[1])}</dd>`).join('')}</dl>` : ''}${(ex.avisos || []).map((w) => `<p class="muted">${esc(w)}</p>`).join('')}
        <details><summary>Texto transcrito</summary><pre>${esc(f.texto_completo || '')}</pre></details>` : ''}`;
  }

  // ---------------- analisar imagem
  let file = null;
  const setFile = (f) => { if (!f || !f.type.startsWith('image/')) return; file = f; $('prev').innerHTML = `<img alt="Imagem escolhida" src="${URL.createObjectURL(f)}">`; };
  $('drop').onclick = () => $('file').click();
  $('drop').onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file').click(); } };
  $('file').onchange = (e) => setFile(e.target.files[0]);
  $('drop').ondragover = (e) => { e.preventDefault(); $('drop').classList.add('on'); };
  $('drop').ondragleave = () => $('drop').classList.remove('on');
  $('drop').ondrop = (e) => { e.preventDefault(); $('drop').classList.remove('on'); setFile(e.dataTransfer.files[0]); };
  document.addEventListener('paste', (e) => { const it = [...e.clipboardData.items].find((i) => i.type.startsWith('image/')); if (it) setFile(it.getAsFile()); });
  $('go-img').onclick = async () => {
    if (!file) { $('out-img-err').innerHTML = '<span class="err">Escolha uma imagem.</span>'; return; }
    $('go-img').disabled = true; $('out-img-err').textContent = 'Lendo a imagem…'; $('res-img').innerHTML = '<p class="muted">Analisando…</p>';
    const dataUrl = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(file); });
    const r = await chrome.runtime.sendMessage({ type: 'analyzeImage', dataUrl, caption: $('cap').value });
    $('go-img').disabled = false;
    if (!r.ok) { $('out-img-err').innerHTML = `<span class="err">${esc(r.error)}</span>`; $('res-img').innerHTML = ''; return; }
    $('out-img-err').innerHTML = `<span class="okc">Análise nº ${esc(r.result.api_analysis_id)} registrada.</span> <a href="#" id="to-rev">Revisar extração</a>`;
    $('to-rev').onclick = (e) => { e.preventDefault(); openReview(r.result.api_analysis_id); };
    $('res-img').innerHTML = resultHTML(r.result, r.result.image_extraction);
  };

  // ---------------- histórico (API) + local
  async function loadHist() {
    const qs = new URLSearchParams(Object.entries({ nivel: $('f-nivel').value, regiao: $('f-regiao').value, q: $('f-q').value.trim() }).filter(([, v]) => v));
    const local = (await chrome.storage.local.get('history')).history || [];
    $('hist-local').textContent = `Histórico local deste navegador: ${local.length} anúncio(s) vistos (usado para detectar anúncios repetidos; apague pelo ícone da extensão).`;
    try {
      const r = await fetch(api() + '/v1/gestao/analises?' + qs, { headers: adminHeaders() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || 'HTTP ' + r.status);
      $('resumo').textContent = 'Total por nível: ' + (Object.entries(d.resumo).map(([k, n]) => `${LBL[k] || k}: ${n}`).join(' · ') || 'nenhuma análise ainda');
      $('hist').innerHTML = d.itens.map((i) => `<tr data-id="${i.id}"><td><a data-open="${i.id}" title="Revisar">#${i.id}</a></td><td>${esc(new Date(i.criado_em).toLocaleString('pt-BR'))}</td><td>${esc(i.origem)}${i.engine ? ' · ' + esc(i.engine) : ''}</td>
        <td class="lvl ${i.nivel}">${LBL[i.nivel] || i.nivel}</td><td>${esc(i.titulo || '')}<div class="muted">${esc(i.empresa || '')}</div></td><td class="muted">${i.indicadores.map(esc).join(', ')}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Nada encontrado.</td></tr>';
      for (const a of document.querySelectorAll('[data-open]')) a.onclick = () => openReview(+a.dataset.open);
    } catch (e) {
      $('resumo').innerHTML = `<span class="err">Não foi possível ler o histórico da API (${esc(e.message)}). Confira o endereço e a chave em Configurações.</span>`;
      $('hist').innerHTML = '';
    }
  }
  $('go-hist').onclick = loadHist;
  $('f-q').onkeydown = (e) => { if (e.key === 'Enter') loadHist(); };
  $('csv').onclick = async () => {
    const qs = new URLSearchParams(Object.entries({ nivel: $('f-nivel').value, regiao: $('f-regiao').value }).filter(([, v]) => v));
    const r = await fetch(api() + '/v1/gestao/analises.csv?' + qs, { headers: adminHeaders() });
    if (!r.ok) { $('resumo').innerHTML = '<span class="err">Falha ao exportar (confira a chave).</span>'; return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = 'elo-analises.csv'; a.click();
  };

  // ---------------- revisar
  let current = null;
  async function openReview(id) {
    select($('t-rev'));
    $('rev-empty').hidden = true; $('rev').hidden = false; $('out-rev').textContent = 'Carregando…';
    try {
      const r = await fetch(api() + '/v1/gestao/analises/' + id, { headers: adminHeaders() });
      const d = await r.json(); if (!r.ok) throw new Error(d.detail || 'HTTP ' + r.status);
      current = d; $('rev-id').textContent = '#' + d.id;
      $('r-title').value = d.job.title || ''; $('r-company').value = d.job.company || ''; $('r-location').value = d.job.location || ''; $('r-salary').value = d.job.salary || ''; $('r-desc').value = d.job.description || '';
      $('rev-cmp').innerHTML = `<p>Atual: <span class="lvl ${d.nivel}">${LBL[d.nivel]}</span>${d.correcoes.length ? ` · ${d.correcoes.length} correção(ões): ` + d.correcoes.map((c) => `${LBL[c.nivel_antes]} → ${LBL[c.nivel_depois]}`).join(', ') : ''}</p>` + resultHTML(d.resultado, null);
      $('rev-ex').innerHTML = d.extraido ? resultHTML({ level: d.nivel, indicators: [], justification: '' }, d.extraido).replace(/^<div class="lvl[^]*?<\/p>/, '') : '<p class="muted">Análise de texto (sem imagem).</p>';
      $('out-rev').textContent = '';
    } catch (e) { $('out-rev').innerHTML = `<span class="err">${esc(e.message)}</span>`; }
  }
  $('go-rev').onclick = async () => {
    if (!current) return;
    const body = {}; const map = { title: 'r-title', company: 'r-company', location: 'r-location', salary: 'r-salary', description: 'r-desc' };
    for (const [k, id] of Object.entries(map)) { const v = $(id).value; if (v !== (current.job[k] || '')) body[k] = v; }
    if (!Object.keys(body).length) { $('out-rev').textContent = 'Nenhuma mudança.'; return; }
    $('go-rev').disabled = true;
    try {
      const r = await fetch(api() + '/v1/gestao/analises/' + current.id, { method: 'PATCH', headers: { ...adminHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json(); if (!r.ok) throw new Error(typeof d.detail === 'string' ? d.detail : JSON.stringify(d.detail));
      await openReview(current.id);
      $('out-rev').innerHTML = `<span class="okc">Reanalisado: ${LBL[d.nivel_antes]} → ${LBL[d.analise.level]}</span>`;
    } catch (e) { $('out-rev').innerHTML = `<span class="err">${esc(e.message)}</span>`; }
    $('go-rev').disabled = false;
  };

  // ---------------- configurações: API
  $('api').value = st.apiUrl || 'http://localhost:8787'; $('admin').value = st.adminKey || ''; $('auto').checked = !!st.autoImage;
  $('save-api').onclick = async () => {
    await chrome.storage.local.set({ apiUrl: api(), adminKey: $('admin').value.trim(), autoImage: $('auto').checked });
    $('out-api').textContent = 'Testando…';
    try {
      const h = await (await fetch(api() + '/health', { headers: { 'ngrok-skip-browser-warning': '1' } })).json();
      const lines = [`API ${h.version} no ar.`, `Leitura de imagem: ${h.leitores.claude ? 'Claude Vision' : '—'}${h.leitores.tesseract ? (h.leitores.claude ? ' + ' : '') + 'Tesseract' : ''}${!h.leitores.claude && !h.leitores.tesseract ? ' NENHUM (defina ANTHROPIC_API_KEY ou instale o Tesseract)' : ''}.`];
      if ($('admin').value.trim()) { const g = await fetch(api() + '/v1/gestao/analises?limit=1', { headers: adminHeaders() }); lines.push(g.ok ? 'Chave de administrador aceita.' : 'Chave de administrador recusada (' + g.status + ').'); }
      $('out-api').textContent = lines.join('\n') + '\nRecarregue as abas abertas para aplicar o envio automático.';
    } catch (e) { $('out-api').textContent = 'API fora do ar em ' + api() + ' (' + e.message + '). Rode "npm run api".'; }
  };

  // ---------------- configurações: Supabase (antiga página de opções)
  $('url').value = st.supabaseUrl || ''; $('key').value = st.anonKey || '';
  $('save').onclick = async () => {
    const url = $('url').value.trim().replace(/\/$/, ''), key = $('key').value.trim();
    const out = $('out');
    if (/service_role|sb_secret_/.test(key) || (key.startsWith('eyJ') && (() => { try { return JSON.parse(atob(key.split('.')[1])).role === 'service_role'; } catch { return false; } })())) {
      out.textContent = 'Esta é a chave SERVICE ROLE/secret. Não use no navegador. Use a anon/publishable.'; return;
    }
    await chrome.storage.local.set({ supabaseUrl: url, anonKey: key });
    if (!url) { out.textContent = 'Supabase desligado: a extensão usa o modo local.'; return; }
    out.textContent = 'Testando…';
    try {
      const h = { apikey: key, Authorization: 'Bearer ' + key };
      const r1 = await fetch(url + '/rest/v1/support_resources?select=institution&limit=3', { headers: h });
      const d1 = await r1.json();
      if (!r1.ok) throw new Error('leitura: ' + JSON.stringify(d1));
      const r2 = await fetch(url + '/functions/v1/analyze', { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({ job: { title: 'Teste de conexão ELO', description: 'Teste automático do painel.', url: 'https://elo-demo.local/teste-conexao', source: 'demo' } }) });
      const d2 = await r2.json();
      if (!r2.ok) throw new Error('Edge Function analyze: ' + (d2.error || r2.status));
      out.textContent = `Banco: ${d1.length} canais de apoio lidos (ex.: ${d1[0]?.institution}).\nEdge Function: análise gravada com id ${d2.analysis_id}.`;
    } catch (e) { out.textContent = 'Erro: ' + e.message + '\nA extensão continuará em modo local até a conexão funcionar.'; }
  };
})();
