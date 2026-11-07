# Registro de testes — 07/11/2026 (v0.3.0)

## Testado e passando

| O quê | Como | Resultado |
|---|---|---|
| Migração SQL + seed | PostgreSQL 16 local, papéis `anon`/`authenticated` criados à mão | ✅ roda sem erro; contagens corretas |
| RLS | `set role anon` e tentativas de escrita/leitura | ✅ SELECT público funciona; INSERT em `reports`/`jobs` e UPDATE em `companies` → *permission denied*; `select from reports` → negado; `public_reports` mostra só o aprovado |
| Motor de regras | `npm test` (12 testes) | ✅ 11 vagas demo (a v11, com o golpe só na imagem, fica "dados insuficientes" pelo texto); panfletos de scam center → alto risco com visto de turista e transferência para a fronteira; cartaz CLT → sem alertas; perfil gera nota sem mudar o nível; 10 vagas demo = 4 consistentes, 1 insuficiente, 5 de risco; inglês e espanhol detectados; país sozinho e salário sozinho não alertam; relatos não elevam risco; negação ("sem nenhuma taxa") respeitada; todo alerta tem trecho e fundamento válidos; lista suja (fictícia) detectada; entradas inválidas rejeitadas |
| Internet simulada | `npm run test:e2e` | ✅ buscador: 8 resultados de vaga marcados como preliminares, resultados de governo ignorados; feed: 6 posts (comum, legítimos ocultos, 3 de risco incluindo um carregado depois); página da vaga via JSON-LD com análise completa; vaga no exterior mostra EURES/IEFP/Job Bank e vaga no Brasil mostra SINE |
| Análise no meio da vaga + idiomas | `npm run test:e2e` | ✅ cartão entre a descrição e o botão Candidatar-se; resumo, botão de detalhes abre o painel, vagas mais seguras e portais oficiais abaixo; vaga em inglês → alto risco; vaga em espanhol legítima → sem alertas. Tradução depende da Translator API do Chrome (não verificada a tradução em si) |
| Extensão (modo local) | `npm run test:e2e`: Chromium real com a extensão carregada | ✅ 5 selos corretos em `vagas.html`; painel com alertas, fundamentos, verificadas/insuficientes, vagas parecidas, canal da Embaixada em Bangkok, "anúncio replicado"; relato enviado; no `feed.html`, post comum sem selo, posts de risco marcados (incluindo o carregado depois), vaga legítima com selo oculto; sem erros de JS |
| API ELO | `npm run test:api` (12 testes, 1 pulado) | ✅ texto com o mesmo nível das regras JS; imagem com visão simulada e leitura "demo"; imagem inválida/grande/BMP rejeitada (415/413); 503 quando não há leitor; gestão exige chave; PATCH reanalisa e guarda histórico; CSV; inscrição da LP (só consentimento obrigatório, lat arredondada, telefone normalizado); demo e LP servidas |
| Imagens na extensão + Mural/RedePro + painel + LP | `npm run test:e2e` (API real em 8787) | ✅ botão aparece no canto inferior esquerdo da imagem ao passar o mouse; Mural: panfleto do grupo → alto risco e selo do post atualizado; cartaz CLT → sem alertas; RedePro: post e vaga (análise no meio da página muda de "atenção" para "alto risco"); painel: chave admin, perfil, histórico, revisão; aviso de perfil chega ao alerta; LP: geolocalização simulada, prévia, consentimento obrigatório, inscrição gravada |

## NÃO testado (sem acesso daqui)

- **Claude Vision com chave real**: o código segue o SDK `anthropic` 2.6 (`beta.messages.create` com `output_config` JSON Schema e `fallbacks: "default"`), mas não havia `ANTHROPIC_API_KEY` neste ambiente. Teste com `curl -F arquivo=@demo/img/scam-bangkok.png localhost:8787/v1/analisar/imagem`.
- **Tesseract real**: não instalado aqui (o teste é pulado automaticamente). `sudo apt install tesseract-ocr tesseract-ocr-por`.
- **ngrok**: as rotas `/demo` e `/lp` foram testadas em localhost; o túnel em si e a página de aviso do ngrok (contornada pelo header `ngrok-skip-browser-warning` nas chamadas da extensão e da LP) não.
- **Botão de imagem no Facebook/LinkedIn reais**: o seletor usa as mesmas estruturas (`[aria-posinset]`, `[data-urn*=activity]`), testado só nas imitações.
- **Edge Functions no Supabase real** (`analyze`, `report`, `moderate`): o código de fluxo (`analyze_core.js`) é o mesmo testado no modo local, mas o adaptador PostgREST (`_shared/db.ts`) e o deploy em Deno não foram executados. Primeiro teste: Painel → Configurações → **Salvar e testar conexão** (Supabase).
- **Consultas externas** RDAP, BrasilAPI e GLEIF: o ambiente de desenvolvimento não tem internet.
- **Facebook, Google e portais reais**: a detecção usa `[role="article"]`, resultados `#search a h3` e JSON-LD, mas só foi testada nas páginas que imitam essas estruturas. O Facebook muda o HTML com frequência.
- **Links dos canais oficiais** (`support_resources`): reunidos por pesquisa em 07/11/2026; abra cada um antes da apresentação. Telefones 100, 180 e 190 são os números oficiais.

## Limitações conhecidas

- Regras por palavras e combinações: podem errar com textos muito diferentes dos exemplos (falso positivo e falso negativo). Por isso cada alerta mostra o trecho que o disparou.
- Lista suja de demonstração é fictícia. Importar a oficial antes de usar.
- O ELO não enxerga apps fora do Chrome (WhatsApp de celular/desktop).
