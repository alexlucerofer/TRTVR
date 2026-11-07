// node --test tests/  — testes do motor de regras (sem rede)
const test = require('node:test'), assert = require('node:assert');
const R = require('../shared/rules.js'), Core = require('../shared/analyze_core.js');
const D = require('../data/demo-data.js');
const an = (j, f) => R.analyze({ title: j.title, company: j.company_name, description: j.description, location: j.location, salary: j.salary, url: j.url }, f);

test('11 vagas de demonstração: 4 consistentes (2 no exterior), 2 insuficientes (v11 só tem o golpe na imagem), 5 de risco', () => {
  assert.deepStrictEqual(D.demoJobs.map((j) => an(j).level), ['sem_alertas', 'sem_alertas', 'dados_insuficientes', 'alto_risco', 'alto_risco', 'sem_alertas', 'alto_risco', 'alto_risco', 'alto_risco', 'sem_alertas', 'dados_insuficientes']);
});
test('panfletos: texto lido da imagem dispara o padrão de scam center; o cartaz CLT não', () => {
  const lvl = (k) => R.analyze({ title: 'panfleto', description: D.flyers.find((f) => f.key === k).text });
  for (const k of ['scam-bangkok', 'typing-sihanoukville']) {
    const a = lvl(k); assert.strictEqual(a.level, 'alto_risco', k);
    const sea = a.indicators.find((i) => i.id === 'PADRAO_SUDESTE_ASIATICO'); assert.ok(sea, k);
    assert.ok(/visto de TURISTA/.test(sea.evidence.join(' ')), k + ': visto de turista');
  }
  assert.ok(/transferência por terra/.test(lvl('scam-bangkok').indicators.find((i) => i.id === 'PADRAO_SUDESTE_ASIATICO').evidence.join(' ')));
  assert.strictEqual(lvl('clt-campinas').level, 'sem_alertas');
});
test('perfil gera nota (nunca alerta) e não muda o nível', () => {
  const j = { title: 'panfleto', description: D.flyers[0].text };
  const sem = R.analyze(j), com = R.analyze(j, { profile: { areas: ['atendimento'], regioes: ['sudeste_asiatico'], origem_uf: 'SP' } });
  assert.strictEqual(sem.level, com.level); assert.strictEqual(sem.score, com.score);
  assert.deepStrictEqual(sem.profile_notes, []);
  assert.ok(com.profile_notes.some((n) => /MAIS procurado/.test(n)));
  assert.ok(com.profile_notes.some((n) => /Sudeste Asiático/.test(n)));
  assert.deepStrictEqual(Core.sanitizeProfile({ areas: ['ti', '<script>'], regioes: ['europa', 'x'], origem_uf: 'rj1' }), { areas: ['ti'], regioes: ['europa'], origem_uf: null });
});
test('país sozinho não gera alerta', () => {
  const a = R.analyze({ title: 'Engenheiro de software', company: 'Empresa X', description: 'Vaga em Bangkok, Tailândia. Contrato de trabalho e visto de trabalho providenciados pela empresa. Salário compatível. Entrevistas em 3 etapas pelo site da empresa.', url: 'https://x.test/1' });
  assert.ok(!a.indicators.some((i) => i.id === 'PADRAO_SUDESTE_ASIATICO'));
});
test('salário alto sozinho não gera alerta', () => {
  const a = R.analyze({ title: 'Médico intensivista', company: 'Hospital X', description: 'Contratação CLT, salário R$ 25.000. Exige CRM ativo e residência em medicina intensiva. Jornada de 40h semanais. Benefícios completos.', url: 'https://x.test/2' });
  assert.strictEqual(a.level, 'sem_alertas');
});
test('relatos aprovados não elevam o risco sozinhos', () => {
  const a = an(D.demoJobs[0], { approved_reports: 5 });
  assert.strictEqual(a.level, 'sem_alertas');
});
test('negação: "sem nenhuma taxa" não dispara cobrança', () => {
  const a = R.analyze({ title: 'Vaga', company: 'X', description: 'Processo seletivo sem nenhuma taxa. Contrato CLT, salário R$ 2.000 e benefícios. Não será descontado transporte.', url: 'https://x.test/3' });
  assert.ok(!a.indicators.some((i) => i.id === 'COBRANCA_TAXA' || i.id === 'SERVIDAO_DIVIDA'));
});
test('cada alerta tem trecho e fundamento existentes', () => {
  for (const j of D.demoJobs) for (const i of an(j).indicators) { assert.ok(i.evidence.length); for (const b of i.basis) assert.ok(R.LEGAL[b], b); }
});
test('lista suja (registro fictício) aparece como alerta com aviso de homônimo', async () => {
  const db = Core.memoryDb(require('../extension/data/seed.json'));
  const r = await Core.runAnalysis({ job: { ...D.demoJobs[4], company: D.demoJobs[4].company_name } }, { db, external: false });
  assert.ok(r.indicators.some((i) => i.id === 'CADASTRO_EMPREGADORES'));
  assert.ok(r.analysis_id && r.job_id);
});
test('validação rejeita entrada inválida', () => {
  assert.throws(() => Core.validateJob({ title: 'x', url: 'javascript:alert(1)' }));
  assert.throws(() => Core.validateReport({ body: 'curto' }));
});
test('salário em moeda estrangeira convertido', () => { assert.ok(R.parseSalaryBRL('US$ 2.500 por mês').brl >= 13000); });
test('idiomas: inglês e espanhol detectados e analisados', () => {
  assert.strictEqual(an(D.demoJobs[8]).lang, 'en'); assert.strictEqual(an(D.demoJobs[9]).lang, 'es'); assert.strictEqual(an(D.demoJobs[0]).lang, 'pt');
  const ids = an(D.demoJobs[8]).indicators.map((i) => i.id);
  for (const id of ['COBRANCA_TAXA', 'PASSAPORTE_ANTECIPADO', 'SERVIDAO_DIVIDA', 'PADRAO_SUDESTE_ASIATICO']) assert.ok(ids.includes(id), id);
});
