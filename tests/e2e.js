// E2E: carrega a extensão no Chromium, abre as páginas de demo e verifica selos e painel (modo local).
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');
const root = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.json': 'application/json' };
const srv = http.createServer((q, r) => { const f = path.join(root, 'demo', q.url.split('?')[0].replace(/^\/+/, '') || 'index.html'); fs.existsSync(f) && fs.statSync(f).isFile() ? (r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }), r.end(fs.readFileSync(f))) : (r.writeHead(404), r.end()); });
// API ELO real (uvicorn) na porta 8787 — serve também /demo e /lp, como na versão online via ngrok.
// Sem chave da Anthropic e sem Tesseract, os panfletos da demo são reconhecidos pelo SHA-256 (leitura "demo").
const API = 'http://localhost:8787', ADMIN = 'e2e-admin';
function startApi() {
  const py = path.join(root, 'api/.venv/bin/uvicorn');
  const env = { ...process.env, ELO_EXTERNAL: '0', ELO_ADMIN_KEY: ADMIN, ELO_RATE_LIMIT: '1000', ELO_DB: path.join(os.tmpdir(), 'elo-e2e-' + Date.now() + '.db'), ANTHROPIC_API_KEY: '', TESSERACT_CMD: '/nonexistent' };
  const p = spawn(py, ['app.main:app', '--port', '8787'], { cwd: path.join(root, 'api'), env, stdio: 'ignore' });
  return p;
}
// páginas da extensão têm CSP sem 'unsafe-eval' (waitForFunction não funciona): espera consultando o DOM
async function waitFor(page, fn, arg, ms = 8000) { const t = Date.now(); while (Date.now() - t < ms) { if (await page.evaluate(fn, arg)) return; await page.waitForTimeout(150); } throw new Error('tempo esgotado esperando ' + fn + ' | out-rev=' + (await page.evaluate(() => (document.getElementById('out-rev') || {}).textContent))); }
async function waitApi() { for (let i = 0; i < 60; i++) { try { const r = await fetch(API + '/health'); if (r.ok) return true; } catch {} await new Promise((ok) => setTimeout(ok, 250)); } throw new Error('API não subiu'); }
(async () => {
  await new Promise((ok) => srv.listen(8765, ok));
  const api = startApi(); await waitApi();
  const ext = path.join(root, 'extension');
  const ctx = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true, args: ['--headless=new', `--disable-extensions-except=${ext}`, `--load-extension=${ext}`] });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  let fail = 0; const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };

  await page.goto('http://localhost:8765/vagas.html');
  await page.waitForFunction(() => [...document.querySelectorAll('elo-badge')].filter((b) => /ELO: /.test(b.shadowRoot.textContent)).length >= 11, null, { timeout: 15000 });
  const labels = await page.$$eval('elo-badge', (bs) => bs.map((b) => b.shadowRoot.querySelector('.lbl').textContent));
  console.log(labels);
  const exp = ['Sem alertas', 'Sem alertas', 'Dados insuficientes', 'Alto risco', 'Alto risco', 'Sem alertas', 'Alto risco', 'Alto risco', 'Alto risco', 'Sem alertas', 'Atenção'];
  exp.forEach((e, i) => check(labels[i] && labels[i].includes(e), `vaga ${i + 1}: ${e}`));

  await page.evaluate(() => document.querySelectorAll('elo-badge')[3].shadowRoot.querySelector('button').click());
  await page.waitForSelector('elo-panel');
  const panel = await page.$eval('elo-panel', (p) => p.shadowRoot.textContent);
  check(/Cobrança para conseguir a vaga/.test(panel), 'painel mostra alerta de cobrança');
  check(/Mesmo anúncio publicado por empresas diferentes/.test(panel), 'painel detecta anúncio replicado (Siam Star)');
  check(/OIT — Recrutamento equitativo/.test(panel), 'painel mostra fundamento (OIT)');
  check(/Informações verificadas/.test(panel) && /Informações insuficientes/.test(panel), 'painel separa verificadas/insuficientes');
  check(/Vagas parecidas verificadas/.test(panel), 'painel mostra vagas parecidas');
  check(/Embaixada do Brasil em Bangkok/.test(panel), 'painel mostra canal oficial na Tailândia');
  check(/Modo local/.test(panel), 'painel informa modo local (sem Supabase configurado)');
  await page.evaluate(() => { const s = document.querySelector('elo-panel').shadowRoot; s.querySelector('textarea').value = 'Pediram taxa por Pix para o visto.'; s.querySelector('.send').click(); });
  await page.waitForFunction(() => /Modo local|registrado|base ELO/.test(document.querySelector('elo-panel').shadowRoot.querySelector('.msg').textContent));
  check(true, 'relato enviado (modo local)');
  await page.screenshot({ path: path.join(root, 'tests/screens/vagas-painel.png') });

  await page.goto('http://localhost:8765/feed.html');
  await page.waitForTimeout(4000);
  const feed = await page.$$eval('[role=article]', (as) => as.map((a) => { const b = a.querySelector('elo-badge'); return b && getComputedStyle(b).display !== 'none' ? b.shadowRoot.querySelector('.lbl').textContent : '-'; }));
  console.log(feed);
  const fx = ['-', 'Alto risco', '-', '-', 'Alto risco', 'Alto risco', 'Alto risco', '-'];
  const names = ['post comum', 'Tailândia', 'Portugal legítima', 'notícia real', 'fazenda', 'Dubai (carregado depois)', 'inglês Bangkok (carregado depois)', 'logística legítima'];
  fx.forEach((e, i) => check(e === '-' ? feed[i] === '-' : new RegExp(e).test(feed[i] || ''), 'feed: ' + names[i] + ' → ' + (feed[i] || 'ausente')));
  await page.screenshot({ path: path.join(root, 'tests/screens/feed.png') });

  await page.goto('http://localhost:8765/busca.html');
  await page.waitForFunction(() => [...document.querySelectorAll('elo-badge')].filter((b) => /ELO: /.test(b.shadowRoot.textContent)).length >= 10, null, { timeout: 15000 });
  await page.waitForTimeout(500);
  const serp = await page.$$eval('elo-badge', (bs) => bs.map((b) => b.shadowRoot.querySelector('.lbl').textContent));
  console.log(serp);
  check(serp.length === 10, 'buscador: 10 resultados de vaga marcados; notícias e gov.br sem selo (' + serp.length + ')');
  check(serp.every((t) => /preliminar/.test(t)), 'buscador: todos marcados como "preliminar"');
  check(serp.filter((t) => /Alto risco|Atenção/.test(t)).length >= 4, 'buscador: resultados de risco identificados só com título+resumo');
  await page.screenshot({ path: path.join(root, 'tests/screens/busca.png') });

  await page.click('a[href="vaga/marketing-camboja.html"]');
  await page.waitForFunction(() => { const b = document.querySelector('elo-badge'); return b && /ELO: /.test(b.shadowRoot.textContent); }, null, { timeout: 15000 });
  const det = await page.$eval('elo-badge', (b) => b.shadowRoot.querySelector('.lbl').textContent);
  check(/Alto risco/.test(det) && !/preliminar/.test(det), 'página da vaga (JSON-LD): análise completa → ' + det);
  await page.evaluate(() => document.querySelector('elo-badge').shadowRoot.querySelector('button').click());
  await page.waitForSelector('elo-panel');
  const p2 = await page.$eval('elo-panel', (p) => p.shadowRoot.textContent);
  check(/Retenção de passaporte ou documentos/.test(p2) && /Restrição de saída/.test(p2), 'vaga Camboja: retenção de documentos e restrição de comunicação');
  check(/Onde procurar vagas reais com segurança/.test(p2) && /EURES/.test(p2), 'vaga no exterior: mostra portais oficiais internacionais');
  await page.evaluate(() => document.querySelector('elo-panel').remove());
  const inl = await page.$eval('elo-inline', (e) => e.shadowRoot.textContent);
  const inlPos = await page.evaluate(() => { const i = document.querySelector('elo-inline'), b = document.querySelector('.btn'), p = document.querySelector('main p'); return !!(p.compareDocumentPosition(i) & 4) && !!(i.compareDocumentPosition(b) & 4); });
  check(inlPos, 'análise aparece no meio da página (depois da descrição, antes de Candidatar-se)');
  check(/Por que parece falsa ou perigosa/.test(inl) && /Ver em detalhes por que parece falsa/.test(inl), 'análise no meio: resumo + botão de detalhes');
  check(/Vagas que parecem mais seguras/.test(inl) && /Procure em portais oficiais/.test(inl), 'análise no meio: vagas mais seguras logo abaixo');
  await page.evaluate(() => document.querySelector('elo-inline').shadowRoot.querySelector('[data-a=details]').click());
  check(!!(await page.$('elo-panel')), 'botão de detalhes abre o painel completo');
  await page.screenshot({ path: path.join(root, 'tests/screens/vaga-camboja.png') });
  await page.evaluate(() => document.querySelector('elo-panel').remove());
  await page.goto('http://localhost:8765/vaga/rocado-para.html');
  await page.waitForFunction(() => { const b = document.querySelector('elo-badge'); return b && /ELO: /.test(b.shadowRoot.textContent); }, null, { timeout: 15000 });
  await page.evaluate(() => document.querySelector('elo-badge').shadowRoot.querySelector('button').click());
  await page.waitForSelector('elo-panel');
  const p3 = await page.$eval('elo-panel', (p) => p.shadowRoot.textContent);
  check(/SINE/.test(p3) && !/EURES/.test(p3), 'vaga no Brasil: mostra SINE (e não portais estrangeiros)');
  check(/lista suja/.test(p3), 'vaga Pará: consta no Cadastro de Empregadores (registro fictício)');
  await page.goto('http://localhost:8765/vaga/customer-service-bangkok.html');
  await page.waitForSelector('elo-inline', { timeout: 15000 });
  const en = await page.$eval('elo-inline', (e) => e.shadowRoot.textContent);
  check(/Alto risco/.test(en) && /Anúncio em inglês/.test(en), 'vaga em inglês: detectada e analisada como alto risco');
  await page.screenshot({ path: path.join(root, 'tests/screens/vaga-ingles.png'), fullPage: true });
  await page.goto('http://localhost:8765/vaga/camarero-espana.html');
  await page.waitForSelector('elo-inline', { timeout: 15000 });
  const es = await page.$eval('elo-inline', (e) => e.shadowRoot.textContent);
  check(/Sem alertas/.test(es) && /espanhol/.test(es), 'vaga em espanhol legítima: sem alertas');
  // ================= imagens: botão ao passar o mouse + API ELO (Mural, RedePro, vaga v11)
  const hoverAndCheck = async (sel, name) => {
    await page.waitForSelector(sel);
    await page.locator(sel).first().scrollIntoViewIfNeeded();
    await page.hover(sel);
    await page.waitForFunction(() => { const h = document.querySelector('elo-imgbtn'); return h && h.style.display === 'block'; }, null, { timeout: 5000 });
    const pos = await page.evaluate((s) => { const i = document.querySelector(s).getBoundingClientRect(), b = document.querySelector('elo-imgbtn').getBoundingClientRect(); return { left: b.left - i.left, bottom: i.bottom - b.bottom, inside: b.top >= i.top && b.bottom <= i.bottom }; }, sel);
    check(pos.left >= 0 && pos.left < 40 && pos.bottom >= 0 && pos.bottom < 40 && pos.inside, name + ': botão aparece no canto inferior esquerdo da imagem ao passar o mouse ' + JSON.stringify(pos));
    await page.evaluate(() => document.querySelector('elo-imgbtn').shadowRoot.querySelector('button').click());
    await page.waitForSelector('elo-panel', { timeout: 20000 });
    return page.$eval('elo-panel', (p) => p.shadowRoot.textContent);
  };
  await page.goto(API + '/demo/social/mural.html');
  await page.waitForTimeout(2500);
  const mural = await page.$$eval('[aria-posinset]', (ps) => ps.map((a) => { const b = a.querySelector('elo-badge'); return b && getComputedStyle(b).display !== 'none' ? b.shadowRoot.querySelector('.lbl').textContent : '-'; }));
  console.log('mural', mural);
  check(mural.length === 5, 'Mural: 5 posts no feed ([role=feed] > [aria-posinset])');
  const pm = await hoverAndCheck('[aria-posinset="2"] img[data-elo-flyer]', 'Mural (grupo)');
  check(/Lido da imagem/.test(pm) && /centros de golpes/.test(pm) && /visto de TURISTA/.test(pm), 'Mural: imagem lida pela API → padrão de scam center (visto de turista)');
  const after = await page.$eval('[aria-posinset="2"] elo-badge', (b) => b.shadowRoot.querySelector('.lbl').textContent);
  check(/Alto risco/.test(after), 'Mural: selo do post atualizado com o resultado da imagem → ' + after);
  await page.screenshot({ path: path.join(root, 'tests/screens/mural-imagem.png') });
  await page.evaluate(() => document.querySelector('elo-panel').remove());
  const pc = await hoverAndCheck('[aria-posinset="5"] img[data-elo-flyer]', 'Mural (cartaz CLT)');
  check(/Sem alertas|Nenhum sinal/.test(pc), 'Mural: cartaz legítimo (CLT) → sem alertas');
  await page.evaluate(() => document.querySelector('elo-panel').remove());

  await page.goto(API + '/demo/social/redepro.html');
  await page.waitForTimeout(1500);
  const pr = await hoverAndCheck('[data-urn*="7391200000000000001"] img[data-elo-flyer]', 'RedePro (post)');
  check(/Alto risco/.test(pr) && /Lido da imagem/.test(pr), 'RedePro: panfleto do recrutador → alto risco');
  await page.screenshot({ path: path.join(root, 'tests/screens/redepro-imagem.png') });

  await page.goto(API + '/demo/social/redepro-vaga.html');
  await page.waitForSelector('elo-inline', { timeout: 15000 });
  const before = await page.$eval('elo-inline', (e) => e.shadowRoot.textContent);
  check(/Dados insuficientes|Atenção/.test(before) && !/Alto risco/.test(before), 'RedePro vaga: só pelo texto → sem alto risco (o golpe está na imagem)');
  await hoverAndCheck('img[data-elo-flyer]', 'RedePro (vaga)');
  await page.evaluate(() => document.querySelector('elo-panel').remove());
  const inl2 = await page.$eval('elo-inline', (e) => e.shadowRoot.textContent);
  check(/Alto risco/.test(inl2), 'RedePro vaga: depois de ler a imagem, a análise no meio da página vira alto risco');

  // ================= painel da extensão: perfil + histórico (gestão)
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
  const extId = sw.url().split('/')[2];
  await page.goto(`chrome-extension://${extId}/painel.html`);
  await page.click('#t-cfg'); await page.fill('#admin', ADMIN); await page.click('#save-api');
  await waitFor(page, () => /Chave de administrador aceita/.test(document.getElementById('out-api').textContent));
  check(true, 'painel: API e chave de administrador testadas');
  await page.click('#t-perfil'); await page.check('input[name=areas][value=atendimento]'); await page.check('input[name=regioes][value=sudeste_asiatico]'); await page.selectOption('#uf', 'SP'); await page.click('#save-perfil');
  await waitFor(page, () => /MAIS procurado/.test(document.getElementById('out-perfil').textContent));
  check(true, 'painel: perfil salvo com aviso de exemplo');
  await page.click('#t-hist');
  await waitFor(page, () => document.querySelectorAll('#hist tr[data-id]').length >= 3);
  const hist = await page.$$eval('#hist tr[data-id]', (rs) => rs.map((r) => r.textContent));
  check(hist.some((t) => /imagem/.test(t) && /Alto risco/.test(t)), 'painel: histórico lista as análises de imagem (' + hist.length + ')');
  await page.click('#hist [data-open]');
  await waitFor(page, () => document.getElementById('r-desc').value.length > 50);
  await page.fill('#r-desc', 'Auxiliar de logística em Campinas/SP. Contrato CLT, R$ 2.300 + vale-transporte. Jornada de 44h semanais. Processo seletivo sem nenhuma taxa. Inscrições pelo site logistica-aurora.example/vagas.');
  await page.click('#go-rev');
  await waitFor(page, () => /Reanalisado/.test(document.getElementById('out-rev').textContent));
  check(/→ Sem alertas/.test(await page.$eval('#out-rev', (e) => e.textContent)), 'painel: revisão corrige a extração e reanalisa');
  await page.screenshot({ path: path.join(root, 'tests/screens/painel.png'), fullPage: true });
  // perfil vai junto: nota aparece no painel de uma nova leitura
  await page.goto(API + '/demo/social/mural.html'); await page.waitForTimeout(1500);
  const pn = await hoverAndCheck('[aria-posinset="3"] img[data-elo-flyer]', 'Mural (patrocinado)');
  check(/MAIS procurado/.test(pn), 'perfil do painel enviado à API: aviso personalizado no alerta');

  // ================= landing page servida pela API (/lp/): inscrição em alertas
  await ctx.grantPermissions(['geolocation'], { origin: API }); await ctx.setGeolocation({ latitude: -23.5505, longitude: -46.6333, accuracy: 25 });
  await page.goto(API + '/lp/#alertas');
  await page.click('#geo-btn'); await page.waitForFunction(() => /obtida/.test(document.getElementById('geo-st').textContent));
  await page.fill('#lp-tel', '+55 11 98888-7777'); await page.check('input[name=lp-areas][value=ti]');
  await page.click('#lp-send');
  check(/consentimento/.test(await page.$eval('#lp-res', (e) => e.textContent)), 'LP: sem consentimento não envia');
  const reqP = page.waitForRequest((r) => r.url().endsWith('/v1/alertas/inscricao'));
  await page.check('#lp-ok'); await page.click('#lp-send');
  const sent = JSON.parse((await reqP).postData());
  check(sent.localizacao && sent.fuso_horario && sent.idioma && sent.telefone && sent.consentimento === true, 'LP: envia localização, fuso, idioma e telefone (com consentimento)');
  await page.waitForFunction(() => /Inscrição nº/.test(document.getElementById('lp-res').textContent), null, { timeout: 8000 });
  check(/Brasil/.test(await page.$eval('#lp-res', (e) => e.textContent)), 'LP: inscrição registrada com região estimada e canais de ajuda');
  const subs = await (await fetch(API + '/v1/gestao/inscricoes', { headers: { 'X-Elo-Admin-Key': ADMIN } })).json();
  check(Math.abs(subs.itens[0].lat + 23.5505) < 0.001 && String(subs.itens[0].lat).split('.')[1].length <= 3 && subs.itens[0].telefone === '+5511988887777', 'API: inscrição gravada (lat arredondada, telefone normalizado)');
  await page.screenshot({ path: path.join(root, 'tests/screens/lp-alertas.png') });

  check(!errors.length, 'sem erros de JS na página ' + errors.join(';'));
  await ctx.close(); srv.close(); api.kill();
  console.log(fail ? `\n${fail} FALHA(S)` : '\nTODOS OS TESTES E2E PASSARAM'); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
