# Para quem vai construir a plataforma (Prevenção · Denúncia · Recomeço)

A plataforma é uma página HTML/JS simples que **só lê** do Supabase com a chave anon (pública). Gravações (relatos) vão pela Edge Function `report`.

## Ler dados (REST do Supabase)

```js
const URL = 'https://SEU-PROJETO.supabase.co', KEY = 'SUA_ANON_KEY';
const get = (path) => fetch(`${URL}/rest/v1/${path}`, { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } }).then(r => r.json());

// Prevenção: vagas analisadas (última análise de cada uma)
get('job_latest_analysis?select=title,company_name,location,salary,url,level,preliminary,indicators,justification,analyzed_at&order=analyzed_at.desc&limit=50');
// Oportunidades alternativas (busca por texto)
get('opportunities?select=*&kind=eq.emprego&title=ilike.*atendimento*');
// Denúncia: canais oficiais
get('support_resources?select=*&support_type=in.(denuncia,emergencia_exterior,orientacao)');
// Recomeço: vagas para sobreviventes, sem revelar histórico
get('opportunities?select=*&for_survivors=eq.true');
get('support_resources?select=*&support_type=in.(reintegracao,assistencia)');
// Fundamentos e indicadores (para uma página "Como o ELO decide")
get('risk_indicators?select=*'); get('legal_references?select=*');
// Relatos aprovados (sem identificação)
get('public_reports?select=*');
```

## Enviar relato

```js
fetch(`${URL}/functions/v1/report`, { method: 'POST',
  headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ job_url: 'https://...', category: 'cobranca', body: 'texto com no mínimo 10 caracteres' }) });
// categorias: inconsistencia | cobranca | documentos | pressao | outro → entra como "pendente"
```

## Campos úteis
- `level`: `sem_alertas` | `dados_insuficientes` | `atencao` | `alto_risco`
- `indicators[]`: `{ id, title, severity, description, evidence[], basis[] }` (basis = ids de `legal_references`)
- `opportunities.blind_referral = true`: a empresa aceita candidatura encaminhada pelo programa **sem** saber o histórico da pessoa. O encaminhamento mostra só competências e disponibilidade.
- `is_demo = true`: dado fictício. Mostre essa marcação na tela.

## Regras para a página
- Não dizer que relatos são enviados às autoridades. Apontar Disque 100, Sistema Ipê, PF e Itamaraty.
- Não exibir nenhum dado que identifique sobreviventes.
- Botões só se fizerem algo de verdade.
