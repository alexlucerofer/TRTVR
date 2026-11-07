/* ELO — fluxo de análise (validar → verificar fatos → regras → gravar → alternativas).
 * Usado pela Edge Function (db = PostgREST com service role) e pelo modo local da extensão
 * (db = memória, a partir de seed.json). Expõe globalThis.ELOCore. Requer ELORules carregado.
 */
(function (root) {
  'use strict';
  const BOARDS = /(^|\.)(linkedin|indeed|catho|gupy|infojobs|vagas|glassdoor|facebook|instagram|google|bing|jooble|trabalhabrasil|empregos|olx|elo-demo|t\.me|wa\.me|whatsapp)\./;
  const FREE_MAIL = /^(gmail|hotmail|outlook|yahoo|live|icloud|bol|uol|proton|protonmail|yandex|mail)\./;

  function clip(s, n) { return s == null ? null : String(s).replace(/\u0000/g, '').trim().slice(0, n) || null; }

  function validateJob(j) {
    if (!j || typeof j !== 'object') throw new Error('job ausente');
    const job = {
      title: clip(j.title, 300), company: clip(j.company, 200), description: clip(j.description, 8000),
      location: clip(j.location, 200), salary: clip(j.salary, 200), url: clip(j.url, 2000),
      source: ['pagina', 'jsonld', 'google', 'facebook', 'demo', 'selecao', 'feed', 'imagem'].includes(j.source) ? j.source : 'pagina',
      preliminary: !!j.preliminary, company_url: clip(j.company_url, 300)
    };
    if (!job.title || job.title.length < 2) throw new Error('título inválido');
    if (!job.url || !/^https?:\/\//i.test(job.url)) throw new Error('url inválida');
    return job;
  }

  function companyDomain(job) {
    const R = root.ELORules;
    const text = [job.description, job.company_url].join(' ');
    const emails = R.extractContacts(text).emails.map((e) => e.split('@')[1]).filter((d) => d && !FREE_MAIL.test(d));
    if (emails[0]) return emails[0];
    if (job.company_url) { const d = R.domainOf(/^https?:/.test(job.company_url) ? job.company_url : 'https://' + job.company_url); if (d && !BOARDS.test('.' + d)) return d; }
    const site = (job.description || '').toLowerCase().match(/\b([a-z0-9-]+\.(?:com\.br|com|net|org|example|io|co)(?:\.[a-z]{2})?)\//);
    if (site && !BOARDS.test('.' + site[1])) return site[1];
    const u = R.domainOf(job.url); if (u && !BOARDS.test('.' + u)) return u;
    return null;
  }

  async function withTimeout(p, ms) { let t; try { return await Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('timeout')), ms); })]); } finally { clearTimeout(t); } }

  /** deps: { db, http(url) -> json|null, now() -> Date, external: bool } */
  async function runAnalysis(input, deps) {
    const R = root.ELORules;
    const job = validateJob(input.job);
    const facts = { registry_checked: true };
    const now = deps.now ? deps.now() : new Date();

    // 1) empresa na base ELO (por domínio, depois por nome)
    const domain = companyDomain(job);
    if (domain) facts.domain = domain;
    let company = null;
    if (domain) company = await deps.db.findCompanyByDomain(domain);
    if (!company && job.company) company = await deps.db.findCompanyByName(job.company);
    if (company) facts.company_record = company;

    // 2) verificações públicas externas (com tempo-limite; falha => "insuficiente", nunca inventa)
    const tasks = [];
    if (domain && deps.external) {
      facts.domain_checked = true;
      tasks.push(withTimeout(deps.http('https://rdap.org/domain/' + encodeURIComponent(domain)), 5000).then((r) => {
        const ev = r && (r.events || []).find((e) => e.eventAction === 'registration');
        if (ev) facts.domain_age_days = Math.floor((now - new Date(ev.eventDate)) / 864e5);
      }).catch(() => {}));
    }
    if (company && company.is_demo && company.domain_created_on && facts.domain_age_days == null) {
      facts.domain_age_days = Math.floor((now - new Date(company.domain_created_on)) / 864e5);
      facts.domain = company.domain + ' [fictício]';
    }
    const cnpj = R.extractCNPJ(job.description);
    if (cnpj && deps.external) {
      tasks.push(withTimeout(deps.http('https://brasilapi.com.br/api/cnpj/v1/' + cnpj), 5000).then((r) => {
        if (r && r.cnpj) facts.cnpj = { razao_social: r.razao_social, situacao: r.descricao_situacao_cadastral, abertura: r.data_inicio_atividade };
      }).catch(() => {}));
    }
    if (job.company && !company && !cnpj && deps.external) {
      tasks.push(withTimeout(deps.http('https://api.gleif.org/api/v1/fuzzycompletions?field=entity.legalName&q=' + encodeURIComponent(job.company.replace(/\(.*?\)/g, ''))), 4000).then((r) => {
        const hit = r && r.data && r.data[0] && r.data[0].attributes && r.data[0].attributes.value;
        if (hit && R.similarity(hit + ' a b', job.company + ' a b') > 0.5) facts.gleif_match = hit;
      }).catch(() => {}));
    }
    await Promise.all(tasks);

    // 3) cadastro de empregadores (lista suja), relatos aprovados, anúncios parecidos
    facts.registry_matches = job.company || cnpj ? await deps.db.findRegistry(job.company, cnpj) : [];
    if (company) facts.approved_reports = await deps.db.approvedReports(company.id);
    const text = [job.title, job.description].join(' ');
    const recent = await deps.db.recentJobs(300);
    facts.similar_jobs = recent.filter((r) => r.url !== job.url && r.description)
      .map((r) => ({ company: r.company_name, url: r.url, seen_at: r.first_seen_at, similarity: R.similarity(text, [r.title, r.description].join(' ')) }))
      .filter((s) => s.similarity >= 0.6).sort((a, b) => b.similarity - a.similarity).slice(0, 5);
    if (input.local_history) facts.local_history = input.local_history;
    // base de anúncios REPORTADOS por usuários (API ELO): texto parecido ou mesmo contato → nota (não muda o nível sozinho)
    if (deps.db.reportedJobs) {
      const mine = contactKeys(job.description + ' ' + (job.title || ''));
      facts.reported_similar = (await deps.db.reportedJobs()).filter((r) => r.url !== job.url).map((r) => {
        const theirs = contactKeys([r.title, r.description].join(' '));
        return { id: r.id, title: r.title, company: r.company, seen_at: r.created_at, status: r.status, category: r.category,
          similarity: R.similarity(text, [r.title, r.description].join(' ')), shared: mine.filter((k) => theirs.includes(k)) };
      }).filter((r) => r.similarity >= 0.55 || r.shared.length).sort((a, b) => b.shared.length - a.shared.length || b.similarity - a.similarity).slice(0, 3);
    }
    if (input.profile && typeof input.profile === 'object') facts.profile = sanitizeProfile(input.profile);

    // 4) regras
    const a = R.analyze(job, facts);

    // 5) grava vaga + análise
    const saved = await deps.db.saveJobAndAnalysis({
      company_id: company ? company.id : null, company_name: job.company, title: job.title, description: job.description,
      location: job.location, salary: job.salary, url: job.url, source: job.source, content_hash: a.content_hash
    }, {
      level: a.level, preliminary: a.preliminary, score: a.score, indicators: a.indicators, verified: a.verified,
      insufficient: a.insufficient, justification: a.justification, rules_version: a.rules_version
    });

    // 6) alternativas e canais de apoio
    const opps = await deps.db.listOpportunities();
    const alternatives = a.level === 'sem_alertas' ? [] : R.rankAlternatives(job, opps, 3, facts.profile);
    // ordem: país de destino → internacional → Brasil (para vaga no Brasil: Brasil primeiro)
    const dest = /tailandia|thailand|bangkok|mae sot|camboja|cambodia|mianmar|myanmar|laos/.test(R.norm(text + ' ' + (job.location || ''))) ? 'TH' : null;
    const countries = dest ? [dest, 'INT', 'BR'] : ['BR', 'INT'];
    const support = (await deps.db.listSupport()).filter((s) => countries.includes(s.country))
      .sort((a, b) => countries.indexOf(a.country) - countries.indexOf(b.country));

    return { ...a, job_id: saved.job_id, analysis_id: saved.analysis_id, stored_at: saved.created_at, facts_used: Object.keys(facts), alternatives, support, legal: R.LEGAL };
  }

  // contatos comparáveis entre anúncios: telefones, e-mails e @usuário de Telegram
  function contactKeys(text) {
    const R = root.ELORules;
    const c = R.extractContacts(text || '');
    const tg = (String(text || '').toLowerCase().match(/@[a-z0-9_]{4,32}/g) || []).filter((h) => !/@(gmail|hotmail|outlook|yahoo)/.test(h));
    return [...new Set([...c.phones.map((p) => 'tel:' + p), ...c.emails.map((e) => 'mail:' + e.toLowerCase()), ...tg.map((h) => 'tg:' + h)])];
  }

  // perfil vindo do painel: só listas curtas de códigos conhecidos (nada de texto livre)
  function sanitizeProfile(p) {
    const A = ['atendimento', 'ti', 'marketing_digital', 'agro', 'construcao', 'hotelaria', 'domestico', 'beleza_entretenimento', 'outra'];
    const RG = ['brasil', 'america_do_sul', 'europa', 'america_do_norte', 'oriente_medio', 'sudeste_asiatico', 'asia_leste'];
    const uf = typeof p.origem_uf === 'string' && /^[A-Za-z]{2}$/.test(p.origem_uf) ? p.origem_uf.toUpperCase() : null;
    return { areas: (Array.isArray(p.areas) ? p.areas : []).filter((a) => A.includes(a)).slice(0, 9), regioes: (Array.isArray(p.regioes) ? p.regioes : []).filter((r) => RG.includes(r)).slice(0, 7), origem_uf: uf };
  }

  function validateReport(b) {
    const body = clip(b && b.body, 2000);
    if (!body || body.length < 10) throw new Error('relato muito curto (mínimo 10 caracteres)');
    const category = ['inconsistencia', 'cobranca', 'documentos', 'pressao', 'outro'].includes(b.category) ? b.category : 'inconsistencia';
    const job_url = clip(b.job_url, 2000);
    if (job_url && !/^https?:\/\//i.test(job_url)) throw new Error('url inválida');
    return { body, category, job_url };
  }

  // Banco em memória (modo local da extensão e testes)
  function memoryDb(seed) {
    let n = 0; const id = () => 'local-' + (++n);
    const companies = (seed.companies || []).map((c) => ({ ...c, id: c.key || id() }));
    const jobs = (seed.seenJobs || []).map((j) => ({ ...j, id: id() }));
    const analyses = []; const reports = [];
    const R = root.ELORules;
    return {
      _jobs: jobs, _analyses: analyses, _reports: reports, _reported: [],
      async reportedJobs() { return this._reported; },
      async findCompanyByDomain(d) { return companies.find((c) => c.domain && c.domain.toLowerCase() === d.toLowerCase()) || null; },
      async findCompanyByName(nm) { return companies.find((c) => R.norm(c.name) === R.norm(nm)) || null; },
      async findRegistry(nm, doc) { return (seed.employerRegistry || []).filter((e) => (nm && R.norm(e.employer_name) === R.norm(nm)) || (doc && e.document && e.document.replace(/\D/g, '') === doc)); },
      async approvedReports() { return 0; },
      async recentJobs() { return jobs; },
      async saveJobAndAnalysis(job, an) {
        let j = jobs.find((x) => x.url === job.url);
        if (!j) { j = { ...job, id: id(), first_seen_at: new Date().toISOString() }; jobs.push(j); }
        const row = { ...an, id: id(), job_id: j.id, created_at: new Date().toISOString() }; analyses.push(row);
        return { job_id: j.id, analysis_id: row.id, created_at: row.created_at };
      },
      async listOpportunities() { return seed.opportunities || []; },
      async listSupport() { return seed.supportResources || []; },
      async insertReport(r) { const row = { ...r, id: id(), moderation_status: 'pendente', created_at: new Date().toISOString() }; reports.push(row); return row; }
    };
  }

  const api = { runAnalysis, contactKeys, sanitizeProfile, validateJob, validateReport, companyDomain, memoryDb };
  root.ELOCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
