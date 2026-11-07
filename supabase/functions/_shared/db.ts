// Acesso ao banco via PostgREST com a SERVICE ROLE — só existe no servidor (variável de ambiente
// injetada pelo Supabase nas Edge Functions). Nunca vai para a extensão.
const URL_ = Deno.env.get('SUPABASE_URL')!;
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers || {}) },
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`db ${r.status}: ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}
const enc = encodeURIComponent;
const ilikeSafe = (s: string) => s.replace(/[%_*,()]/g, ' ').trim();
const COMPANY_COLS = 'id,name,domain,country,verification_status,source,is_demo,domain_created_on';

export const db = {
  rest,
  async findCompanyByDomain(d: string) { return (await rest(`companies?select=${COMPANY_COLS}&domain=ilike.${enc(ilikeSafe(d))}&limit=1`))[0] || null; },
  async findCompanyByName(n: string) { return (await rest(`companies?select=${COMPANY_COLS}&name=ilike.${enc(ilikeSafe(n))}&limit=1`))[0] || null; },
  async findRegistry(name: string | null, doc: string | null) {
    const out: any[] = [];
    if (name) out.push(...await rest(`employer_registry?select=employer_name,uf,source,is_demo,document&employer_name=ilike.${enc(ilikeSafe(name))}&limit=5`));
    if (doc) out.push(...(await rest(`employer_registry?select=employer_name,uf,source,is_demo,document&document=not.is.null&limit=5000`)).filter((e: any) => String(e.document).replace(/\D/g, '') === doc));
    return out;
  },
  async approvedReports(companyId: string) { return (await rest(`public_reports?select=id&company_id=eq.${companyId}`)).length; },
  async recentJobs(limit: number) { return rest(`jobs?select=id,company_name,title,description,url,first_seen_at&order=last_seen_at.desc&limit=${limit}`); },
  async saveJobAndAnalysis(job: any, an: any) {
    const [j] = await rest('jobs?on_conflict=url_hash', {
      method: 'POST', headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
      body: JSON.stringify({ ...job, last_seen_at: new Date().toISOString() }),
    });
    const [a] = await rest('analyses', { method: 'POST', body: JSON.stringify({ ...an, job_id: j.id }) });
    return { job_id: j.id, analysis_id: a.id, created_at: a.created_at };
  },
  async listOpportunities() { return rest('opportunities?select=*'); },
  async listSupport() { return rest('support_resources?select=*'); },
  async findJobByUrl(url: string) { return (await rest(`jobs?select=id,company_id&url=eq.${enc(url)}&limit=1`))[0] || null; },
  async insertReport(r: any) { return (await rest('reports', { method: 'POST', body: JSON.stringify(r) }))[0]; },
};

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Usuário autenticado (Supabase Auth) a partir do JWT, se houver
export async function getUser(req: Request) {
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const r = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: Deno.env.get('SUPABASE_ANON_KEY') || KEY, Authorization: auth } });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.id ? u : null;
}

export async function sha256(s: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
