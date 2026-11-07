// POST /functions/v1/report  { job_url?, category, body }
// Registra relato de inconsistência como PENDENTE de moderação. Não é enviado a nenhuma autoridade.
import '../_shared/rules.js';
import '../_shared/analyze_core.js';
import { db, json, cors, getUser, sha256 } from '../_shared/db.ts';

const core = (globalThis as any).ELOCore;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'use POST' }, 405);
  try {
    const input = core.validateReport(await req.json());
    const user = await getUser(req); // opcional: relato anônimo é permitido
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'desconhecido';
    const reporter_hash = await sha256(ip + new Date().toISOString().slice(0, 10) + (Deno.env.get('REPORT_SALT') || 'elo'));

    // limite simples: 5 relatos por origem por dia
    const today = new Date().toISOString().slice(0, 10);
    const count = (await db.rest(`reports?select=id&reporter_hash=eq.${reporter_hash}&created_at=gte.${today}`)).length;
    if (count >= 5) return json({ error: 'limite diário de relatos atingido' }, 429);

    const job = input.job_url ? await db.findJobByUrl(input.job_url) : null;
    const row = await db.insertReport({
      user_id: user?.id ?? null, reporter_hash, job_id: job?.id ?? null, company_id: job?.company_id ?? null,
      job_url: input.job_url, category: input.category, body: input.body, moderation_status: 'pendente',
    });
    return json({ ok: true, id: row.id, moderation_status: row.moderation_status,
      message: 'Relato registrado para moderação. Ele NÃO é enviado a autoridades. Para denunciar, use os canais oficiais (Disque 100, Sistema Ipê, Polícia Federal).' });
  } catch (e) {
    const msg = String((e as Error).message || e);
    return json({ error: msg }, /curto|inválid/.test(msg) ? 400 : 500);
  }
});
