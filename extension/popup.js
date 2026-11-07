(async () => {
  const st = await chrome.runtime.sendMessage({ type: 'status' });
  const mode = document.getElementById('mode');
  mode.textContent = st.configured ? 'Supabase' : 'Modo local (demo)';
  mode.style.background = st.configured ? '#ecfdf3' : '#fffaeb';
  mode.style.color = st.configured ? '#067647' : '#b54708';

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let host = ''; try { host = new URL(tab.url).hostname.replace(/^www\./, ''); } catch {}
  const btn = document.getElementById('pause');
  const render = async () => {
    const { pausedHosts = [] } = await chrome.storage.local.get('pausedHosts');
    const p = pausedHosts.includes(host);
    document.getElementById('host').textContent = host ? `Site: ${host} — ${p ? 'pausado' : 'ativo'}` : '';
    btn.textContent = p ? 'Reativar neste site' : 'Pausar neste site';
    btn.onclick = async () => {
      const next = p ? pausedHosts.filter((h) => h !== host) : [...pausedHosts, host];
      await chrome.storage.local.set({ pausedHosts: next });
      chrome.tabs.reload(tab.id); render();
    };
  };
  if (host) render(); else btn.style.display = 'none';
  document.getElementById('clear').onclick = async () => { await chrome.runtime.sendMessage({ type: 'clearHistory' }); document.getElementById('clear').textContent = 'Histórico apagado'; };
})();
