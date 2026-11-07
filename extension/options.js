(async () => {
  const $ = (id) => document.getElementById(id);
  const s = await chrome.storage.local.get(['supabaseUrl', 'anonKey']);
  $('url').value = s.supabaseUrl || ''; $('key').value = s.anonKey || '';
  $('save').onclick = async () => {
    const url = $('url').value.trim().replace(/\/$/, ''), key = $('key').value.trim();
    const out = $('out');
    if (/service_role|sb_secret_/.test(key) || (key.startsWith('eyJ') && (() => { try { return JSON.parse(atob(key.split('.')[1])).role === 'service_role'; } catch { return false; } })())) {
      out.textContent = '✗ Esta é a chave SERVICE ROLE/secret. Não use no navegador. Use a anon/publishable.'; return;
    }
    await chrome.storage.local.set({ supabaseUrl: url, anonKey: key });
    out.textContent = 'Testando…';
    try {
      const h = { apikey: key, Authorization: 'Bearer ' + key };
      const r1 = await fetch(url + '/rest/v1/support_resources?select=institution&limit=3', { headers: h });
      const d1 = await r1.json();
      if (!r1.ok) throw new Error('leitura: ' + JSON.stringify(d1));
      const r2 = await fetch(url + '/functions/v1/analyze', { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({ job: { title: 'Teste de conexão ELO', description: 'Teste automático da página de opções.', url: 'https://elo-demo.local/teste-conexao', source: 'demo' } }) });
      const d2 = await r2.json();
      if (!r2.ok) throw new Error('Edge Function analyze: ' + (d2.error || r2.status));
      out.textContent = `✓ Banco: ${d1.length} canais de apoio lidos (ex.: ${d1[0]?.institution}).\n✓ Edge Function: análise gravada com id ${d2.analysis_id}.`;
    } catch (e) { out.textContent = '✗ ' + e.message + '\nA extensão continuará em modo local até a conexão funcionar.'; }
  };
})();
