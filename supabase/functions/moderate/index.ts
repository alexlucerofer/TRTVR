// POST /functions/v1/moderate  (exige login Supabase Auth de um usuário presente na tabela admins)
// { action: 'list' }  ou  { action: 'set', id, status: 'aprovado'|'rejeitado' }
import { db, json, cors, getUser } from '../_shared/db.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const user = await getUser(req);
  if (!user) return json({ error: 'faça login' }, 401);
  const admin = await db.rest(`admins?select=user_id&user_id=eq.${user.id}`);
  if (!admin.length) return json({ error: 'sem permissão de moderação' }, 403);
  const b = await req.json().catch(() => ({}));
  if (b.action === 'list') return json(await db.rest('reports?select=id,category,body,job_url,created_at&moderation_status=eq.pendente&order=created_at.asc&limit=50'));
  if (b.action === 'set' && ['aprovado', 'rejeitado'].includes(b.status) && /^[0-9a-f-]{36}$/.test(b.id || '')) {
    const r = await db.rest(`reports?id=eq.${b.id}`, { method: 'PATCH', body: JSON.stringify({ moderation_status: b.status, moderated_by: user.id, moderated_at: new Date().toISOString() }) });
    return json({ ok: true, updated: r.length });
  }
  return json({ error: 'ação inválida' }, 400);
});
