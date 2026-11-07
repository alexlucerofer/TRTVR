#!/usr/bin/env node
// Ponte entre a API Python e o motor de regras JS (shared/rules.js + shared/analyze_core.js).
// Processo persistente: lê UMA requisição JSON por linha no stdin e responde UMA linha JSON no stdout.
//   {"id":1,"action":"analyze","job":{...},"profile":{...}}  -> {"id":1,"ok":true,"result":{...}}
//   {"id":2,"action":"indicators"}                             -> {"id":2,"ok":true,"result":{indicators,legal,rules_version}}
// Assim a API usa exatamente as mesmas regras, fundamentos e alternativas da extensão e do Supabase.
'use strict';
const path = require('path');
const readline = require('readline');
const root = path.join(__dirname, '..', '..');
require(path.join(root, 'shared/rules.js'));
require(path.join(root, 'shared/analyze_core.js'));
const R = globalThis.ELORules, Core = globalThis.ELOCore;
const seed = require(path.join(root, 'extension/data/seed.json'));
const db = Core.memoryDb(seed); // memória do processo: detecta anúncios replicados entre requisições
const external = process.env.ELO_EXTERNAL !== '0'; // consultas públicas (RDAP, BrasilAPI, GLEIF)

async function http(url) {
  const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'ELO-api/0.3' } });
  return r.ok ? r.json() : null;
}

async function handle(msg) {
  if (msg.action === 'indicators') {
    return { rules_version: R.RULES_VERSION, legal: R.LEGAL,
      indicators: R.INDICATORS.map(({ id, title, description, severity, basis }) => ({ id, title, description, severity, basis })) };
  }
  // base de anúncios reportados (a API envia a lista ao iniciar e cada relato novo)
  if (msg.action === 'reported_set') { db._reported = (msg.items || []).slice(-5000); return { count: db._reported.length }; }
  if (msg.action === 'reported_add') { db._reported.push(msg.item); if (db._reported.length > 5000) db._reported.shift(); return { count: db._reported.length }; }
  if (msg.action === 'contacts') return { keys: Core.contactKeys(msg.text || '') };
  if (msg.action === 'analyze') {
    const r = await Core.runAnalysis({ job: msg.job, profile: msg.profile || null }, { db, http, external, now: () => new Date() });
    delete r.legal; // a API devolve a base legal em /v1/indicadores
    return r;
  }
  throw new Error('ação desconhecida');
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', async (line) => {
  let msg = {};
  try {
    msg = JSON.parse(line);
    const result = await handle(msg);
    process.stdout.write(JSON.stringify({ id: msg.id, ok: true, result }) + '\n');
  } catch (e) {
    process.stdout.write(JSON.stringify({ id: msg.id, ok: false, error: String((e && e.message) || e) }) + '\n');
  }
});
