#!/usr/bin/env node
// Gera supabase/seed.sql e extension/data/seed.json a partir de data/demo-data.js + shared/rules.js,
// e copia shared/rules.js para a extensão e para as Edge Functions (uma fonte, três usos).
const fs = require('fs');
const path = require('path');
const R = require('../shared/rules.js');
const D = require('../data/demo-data.js');
const root = path.join(__dirname, '..');

const q = (v) => v === null || v === undefined ? 'null' : typeof v === 'boolean' || typeof v === 'number' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'";
const arr = (a) => "array[" + a.map(q).join(',') + "]::text[]";
const js = (o) => q(JSON.stringify(o)) + '::jsonb';
const cid = (key) => key ? `(select id from public.companies where name = ${q(D.companies.find((c) => c.key === key).name)})` : 'null';

let sql = `-- GERADO por scripts/build-seed.js — não edite à mão.\n-- Empresas/vagas/oportunidades is_demo=true são FICTÍCIAS. Canais de apoio são reais.\nbegin;\n`;
sql += `delete from public.analyses; delete from public.jobs; delete from public.opportunities; delete from public.support_resources;\n`;
sql += `delete from public.employer_registry where is_demo; delete from public.companies where is_demo; delete from public.risk_indicators; delete from public.legal_references;\n\n`;

for (const [id, l] of Object.entries(R.LEGAL)) sql += `insert into public.legal_references (id, short_name, citation, summary, url) values (${q(id)}, ${q(l.short)}, ${q(l.citation)}, ${q(l.summary)}, ${q(l.url)});\n`;
for (const i of R.INDICATORS) sql += `insert into public.risk_indicators (id, title, description, severity, basis, rules_version) values (${q(i.id)}, ${q(i.title)}, ${q(i.description)}, ${q(i.severity)}, ${arr(i.basis)}, ${q(R.RULES_VERSION)});\n`;
sql += '\n';
for (const c of D.companies) sql += `insert into public.companies (name, domain, country, registry_id, verification_status, source, is_demo, domain_created_on) values (${q(c.name)}, ${q(c.domain)}, ${q(c.country)}, ${q(c.registry_id)}, ${q(c.verification_status)}, ${q(c.source)}, ${q(c.is_demo)}, ${q(c.domain_created_on)});\n`;
sql += '\n';
for (const e of D.employerRegistry) sql += `insert into public.employer_registry (employer_name, document, uf, establishment, workers, inclusion_date, source, source_url, is_demo) values (${q(e.employer_name)}, ${q(e.document)}, ${q(e.uf)}, ${q(e.establishment)}, ${q(e.workers)}, ${q(e.inclusion_date)}, ${q(e.source)}, ${q(e.source_url)}, ${q(e.is_demo)});\n`;
sql += '\n';
for (const j of D.seenJobs) {
  const a = R.analyze({ title: j.title, company: j.company_name, description: j.description, location: j.location, salary: j.salary, url: j.url }, {});
  sql += `with j as (insert into public.jobs (company_id, company_name, title, description, location, salary, url, source, content_hash, is_demo, first_seen_at, last_seen_at) values (${cid(j.company)}, ${q(j.company_name)}, ${q(j.title)}, ${q(j.description)}, ${q(j.location)}, ${q(j.salary)}, ${q(j.url)}, 'demo', ${q(a.content_hash)}, true, ${q(j.first_seen_at)}, ${q(j.first_seen_at)}) returning id)\n`;
  sql += `insert into public.analyses (job_id, level, preliminary, score, indicators, verified, insufficient, justification, rules_version, created_at) select id, ${q(a.level)}, ${q(a.preliminary)}, ${a.score}, ${js(a.indicators)}, ${js(a.verified)}, ${js(a.insufficient)}, ${q(a.justification)}, ${q(a.rules_version)}, ${q(j.first_seen_at)} from j;\n`;
}
sql += '\n';
for (const o of D.opportunities) sql += `insert into public.opportunities (company_id, institution, title, kind, category, location, country, requirements, salary, url, for_survivors, blind_referral, is_demo) values (${cid(o.company)}, ${q(o.institution)}, ${q(o.title)}, ${q(o.kind)}, ${q(o.category)}, ${q(o.location)}, ${q(o.country)}, ${q(o.requirements)}, ${q(o.salary)}, ${q(o.url)}, ${q(o.for_survivors)}, ${q(o.blind_referral)}, ${q(o.is_demo)});\n`;
sql += '\n';
for (const s of D.supportResources) sql += `insert into public.support_resources (institution, support_type, country, phone, official_url, description, checked_at) values (${q(s.institution)}, ${q(s.support_type)}, ${q(s.country)}, ${q(s.phone)}, ${q(s.official_url)}, ${q(s.description)}, ${q(s.checked_at)});\n`;
sql += 'commit;\n';

fs.writeFileSync(path.join(root, 'supabase/seed.sql'), sql);

// Dados para o MODO LOCAL da extensão (fallback se o Supabase não estiver configurado/acessível)
fs.mkdirSync(path.join(root, 'extension/data'), { recursive: true });
fs.writeFileSync(path.join(root, 'extension/data/seed.json'), JSON.stringify({
  generated_from: 'data/demo-data.js', rules_version: R.RULES_VERSION,
  companies: D.companies, seenJobs: D.seenJobs, employerRegistry: D.employerRegistry, opportunities: D.opportunities, supportResources: D.supportResources
}, null, 1));

// Copia o motor de regras
fs.mkdirSync(path.join(root, 'extension/lib'), { recursive: true });
fs.mkdirSync(path.join(root, 'supabase/functions/_shared'), { recursive: true });
fs.copyFileSync(path.join(root, 'shared/rules.js'), path.join(root, 'extension/lib/rules.js'));
fs.copyFileSync(path.join(root, 'shared/rules.js'), path.join(root, 'supabase/functions/_shared/rules.js'));
for (const f of ['analyze_core.js']) { fs.copyFileSync(path.join(root, 'shared', f), path.join(root, 'extension/lib', f)); fs.copyFileSync(path.join(root, 'shared', f), path.join(root, 'supabase/functions/_shared', f)); }
console.log('ok: seed.sql, extension/data/seed.json, rules.js copiado');
