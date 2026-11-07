// node --test tests/  — testes do motor de regras (sem rede)
const test = require('node:test'), assert = require('node:assert');
const R = require('../shared/rules.js'), Core = require('../shared/analyze_core.js');
const D = require('../data/demo-data.js');
const an = (j, f) => R.analyze({ title: j.title, company: j.company_name, description: j.description, location: j.location, salary: j.salary, url: j.url }, f);

test('10 vagas de demonstração: 4 consistentes (2 no exterior), 1 insuficiente, 5 de risco', () => {
  assert.deepStrictEqual(D.demoJobs.map((j) => an(j).level), ['sem_alertas', 'sem_alertas', 'dados_insuficientes', 'alto_risco', 'alto_risco', 'sem_alertas', 'alto_risco', 'alto_risco', 'alto_risco', 'sem_alertas']);
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
