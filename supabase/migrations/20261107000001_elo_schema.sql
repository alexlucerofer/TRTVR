-- ELO — esquema inicial
-- Prevenção ao tráfico de pessoas e ao trabalho análogo à escravidão
-- por meio de ofertas de emprego falsas ou enganosas.
--
-- Princípios aplicados no banco:
--  * Leitura pública só do que é informação pública (vagas analisadas, recursos, oportunidades).
--  * NENHUMA política de INSERT/UPDATE/DELETE para anon/authenticated:
--    toda gravação passa pelas Edge Functions, que validam a entrada e usam a
--    service role APENAS no servidor.
--  * Relatos (reports) nunca são legíveis diretamente. Somente relatos
--    aprovados pela moderação aparecem, sem identificação, pela view public_reports.

-- sem extensões: gen_random_uuid() e md5() são nativos do Postgres 13+

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
do $$ begin
  create type verification_status as enum ('verificada', 'nao_verificada', 'inconsistente', 'demonstracao');
exception when duplicate_object then null; end $$;

do $$ begin
  create type analysis_level as enum ('sem_alertas', 'dados_insuficientes', 'atencao', 'alto_risco');
exception when duplicate_object then null; end $$;

do $$ begin
  create type moderation_status as enum ('pendente', 'aprovado', 'rejeitado');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- companies
-- ---------------------------------------------------------------------------
create table if not exists public.companies (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null check (char_length(name) between 2 and 200),
  domain              text check (domain is null or domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'),
  country             text,                       -- ISO 3166-1 alfa-2 (BR, TH, ES...)
  registry_id         text,                       -- CNPJ, LEI, nº de registro local
  verification_status verification_status not null default 'nao_verificada',
  source              text not null,              -- de onde veio a informação
  source_url          text,
  is_demo             boolean not null default false, -- dado fictício de demonstração
  domain_created_on   date,                       -- só para empresas fictícias (.example não tem RDAP)
  created_at          timestamptz not null default now()
);
create unique index if not exists companies_domain_uq on public.companies (lower(domain)) where domain is not null;
create index if not exists companies_name_idx on public.companies (lower(name));

-- ---------------------------------------------------------------------------
-- jobs
-- ---------------------------------------------------------------------------
create table if not exists public.jobs (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid references public.companies(id) on delete set null,
  company_name  text,                              -- nome como aparece no anúncio
  title         text not null check (char_length(title) between 2 and 300),
  description   text check (description is null or char_length(description) <= 8000),
  location      text,
  salary        text,
  url           text not null check (char_length(url) <= 2000),
  url_hash      text generated always as (md5(url)) stored,
  source        text not null default 'pagina',     -- pagina | jsonld | google | facebook | demo
  content_hash  text,                               -- impressão digital do texto (para repostagens)
  is_demo       boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);
create unique index if not exists jobs_url_hash_uq on public.jobs (url_hash);
create index if not exists jobs_company_idx on public.jobs (company_id);
create index if not exists jobs_last_seen_idx on public.jobs (last_seen_at desc);

-- ---------------------------------------------------------------------------
-- analyses
-- ---------------------------------------------------------------------------
create table if not exists public.analyses (
  id             uuid primary key default gen_random_uuid(),
  job_id         uuid not null references public.jobs(id) on delete cascade,
  level          analysis_level not null,
  preliminary    boolean not null default false,   -- só título/resumo disponíveis
  score          integer not null default 0,
  indicators     jsonb not null default '[]'::jsonb,  -- alertas: [{id, title, evidence, basis[]}]
  verified       jsonb not null default '[]'::jsonb,  -- informações verificadas
  insufficient   jsonb not null default '[]'::jsonb,  -- o que não foi possível verificar
  justification  text not null,
  rules_version  text not null,
  created_at     timestamptz not null default now()
);
create index if not exists analyses_job_idx on public.analyses (job_id, created_at desc);

-- ---------------------------------------------------------------------------
-- reports (relatos) — nunca públicos sem moderação
-- ---------------------------------------------------------------------------
create table if not exists public.reports (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid,                          -- auth.users.id quando autenticado; nulo se anônimo
  reporter_hash     text,                          -- hash do IP+dia, só para limitar abuso
  job_id            uuid references public.jobs(id) on delete set null,
  company_id        uuid references public.companies(id) on delete set null,
  job_url           text,
  category          text not null default 'inconsistencia'
                     check (category in ('inconsistencia','cobranca','documentos','pressao','outro')),
  body              text not null check (char_length(body) between 10 and 2000),
  moderation_status moderation_status not null default 'pendente',
  moderated_by      uuid,
  moderated_at      timestamptz,
  created_at        timestamptz not null default now()
);
create index if not exists reports_status_idx on public.reports (moderation_status, created_at desc);

-- ---------------------------------------------------------------------------
-- opportunities (vagas verificadas e de reintegração)
-- ---------------------------------------------------------------------------
create table if not exists public.opportunities (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid references public.companies(id) on delete set null,
  institution           text not null,
  title                 text not null,
  kind                  text not null check (kind in ('emprego','capacitacao','reintegracao')),
  category              text,                       -- atendimento, construcao, agro, tecnologia...
  location              text,
  country               text,
  requirements          text,
  salary                text,
  url                   text,
  for_survivors         boolean not null default false,  -- aceita encaminhamento do programa Recomeço
  blind_referral        boolean not null default false,  -- candidatura sem revelar histórico
  is_demo               boolean not null default false,
  created_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- support_resources (canais oficiais reais)
-- ---------------------------------------------------------------------------
create table if not exists public.support_resources (
  id            uuid primary key default gen_random_uuid(),
  institution   text not null,
  support_type  text not null,     -- denuncia | emergencia_exterior | assistencia | reintegracao | orientacao
  country       text,              -- BR, TH, ... ou 'INT'
  phone         text,
  official_url  text not null,
  description   text,
  checked_at    date not null,     -- quando o link foi conferido
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- employer_registry — Cadastro de Empregadores (lista suja) e afins
-- ---------------------------------------------------------------------------
create table if not exists public.employer_registry (
  id            uuid primary key default gen_random_uuid(),
  employer_name text not null,
  document      text,            -- CNPJ/CPF como publicado
  uf            text,
  establishment text,
  workers       integer,
  inclusion_date date,
  source        text not null,   -- ex.: 'MTE - Cadastro de Empregadores (atualização 04/2026)'
  source_url    text,
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists employer_registry_name_idx on public.employer_registry (lower(employer_name));
create index if not exists employer_registry_doc_idx on public.employer_registry (regexp_replace(coalesce(document,''), '\D', '', 'g'));

-- ---------------------------------------------------------------------------
-- legal_references e risk_indicators — fundamentos exibidos ao usuário
-- ---------------------------------------------------------------------------
create table if not exists public.legal_references (
  id          text primary key,      -- ex.: 'CP_149'
  short_name  text not null,
  citation    text not null,
  summary     text not null,
  url         text not null
);

create table if not exists public.risk_indicators (
  id           text primary key,      -- ex.: 'COBRANCA_TAXA'
  title        text not null,
  description  text not null,
  severity     text not null check (severity in ('critico','alto','medio','info')),
  basis        text[] not null default '{}',   -- ids de legal_references
  rules_version text not null
);

-- ---------------------------------------------------------------------------
-- View pública de relatos aprovados (sem identificação)
-- ---------------------------------------------------------------------------
create or replace view public.public_reports as
  select id, job_id, company_id, category, body, created_at
  from public.reports
  where moderation_status = 'aprovado';

-- Última análise de cada vaga
create or replace view public.job_latest_analysis
with (security_invoker = true) as
  select distinct on (a.job_id)
    j.id as job_id, j.title, j.company_name, j.location, j.salary, j.url, j.source, j.is_demo,
    j.first_seen_at, j.last_seen_at,
    a.id as analysis_id, a.level, a.preliminary, a.score, a.indicators, a.verified, a.insufficient,
    a.justification, a.rules_version, a.created_at as analyzed_at
  from public.jobs j
  join public.analyses a on a.job_id = j.id
  order by a.job_id, a.created_at desc;

-- Administradores (moderação) — vinculados ao Supabase Auth
create table if not exists public.admins (
  user_id    uuid primary key,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.companies          enable row level security;
alter table public.jobs               enable row level security;
alter table public.analyses           enable row level security;
alter table public.reports            enable row level security;
alter table public.opportunities      enable row level security;
alter table public.support_resources  enable row level security;
alter table public.employer_registry  enable row level security;
alter table public.legal_references   enable row level security;
alter table public.risk_indicators    enable row level security;
alter table public.admins             enable row level security;

-- Leitura pública (somente SELECT)
drop policy if exists "leitura publica" on public.companies;
create policy "leitura publica" on public.companies         for select to anon, authenticated using (true);
drop policy if exists "leitura publica" on public.jobs;
create policy "leitura publica" on public.jobs              for select to anon, authenticated using (true);
drop policy if exists "leitura publica" on public.analyses;
create policy "leitura publica" on public.analyses          for select to anon, authenticated using (true);
drop policy if exists "leitura publica" on public.opportunities;
create policy "leitura publica" on public.opportunities     for select to anon, authenticated using (true);
drop policy if exists "leitura publica" on public.support_resources;
create policy "leitura publica" on public.support_resources for select to anon, authenticated using (true);
drop policy if exists "leitura publica" on public.employer_registry;
create policy "leitura publica" on public.employer_registry for select to anon, authenticated using (true);
drop policy if exists "leitura publica" on public.legal_references;
create policy "leitura publica" on public.legal_references  for select to anon, authenticated using (true);
drop policy if exists "leitura publica" on public.risk_indicators;
create policy "leitura publica" on public.risk_indicators   for select to anon, authenticated using (true);

-- reports e admins: NENHUMA política para anon/authenticated => acesso negado.
-- Gravações e moderação só via Edge Functions (service role no servidor).

-- Privilégios explícitos: retira qualquer escrita do cliente
revoke insert, update, delete on all tables in schema public from anon, authenticated;
revoke all on public.reports, public.admins from anon, authenticated;
grant select on public.companies, public.jobs, public.analyses, public.opportunities,
               public.support_resources, public.employer_registry, public.legal_references,
               public.risk_indicators, public.job_latest_analysis, public.public_reports
  to anon, authenticated;
