// POST /functions/v1/analyze  { job: {title, company, description, location, salary, url, source, preliminary}, local_history? }
// Valida, consulta fontes públicas (RDAP, BrasilAPI/CNPJ, GLEIF), aplica as regras, GRAVA vaga + análise e devolve o resultado.
import '../_shared/rules.js';
import '../_shared/analyze_core.js';
import { db, json, cors } from '../_shared/db.ts';

const core = (globalThis as any).ELOCore;

async function http(url: string) {
  const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'ELO-hackathon/1.0' } });
  if (!r.ok) return null;
  return r.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'use POST' }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
  if (JSON.stringify(body).length > 20000) return json({ error: 'conteúdo grande demais' }, 413);
  try {
    const result = await core.runAnalysis(body, { db, http, now: () => new Date(), external: true });
    return json({ mode: 'supabase', ...result });
  } catch (e) {
    const msg = String((e as Error).message || e);
    const status = /inválid|ausente/.test(msg) ? 400 : 500;
    console.error('analyze', msg);
    return json({ error: msg }, status);
  }
});
