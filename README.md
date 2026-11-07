# ELO — vagas seguras

Extensão para Chrome que identifica ofertas de emprego nas páginas que a pessoa abre e mostra, ao lado de cada anúncio, **sinais de recrutamento enganoso, tráfico de pessoas e trabalho análogo à escravidão**, sempre com:

- o **trecho do anúncio** que gerou o alerta;
- o **fundamento** (indicadores da OIT, Código Penal arts. 149, 149-A, 206 e 207, Lei 13.344/2016, Protocolo de Palermo, alertas da ONU/PF sobre o Sudeste Asiático);
- a separação entre **informações verificadas**, **alertas** e **informações insuficientes**;
- **vagas parecidas verificadas** (Brasil e exterior) e **canais oficiais de ajuda**.

O ELO **não afirma que uma empresa comete crime**. Ele aponta sinais que precisam ser verificados. País, salário ou relatos, sozinhos, nunca geram alerta. Não há IA treinada: são regras escritas a partir das fontes em [docs/REFERENCIAS.md](docs/REFERENCIAS.md).

## Estrutura

```
shared/rules.js            motor de regras (fonte única; copiado para extensão e Edge Functions)
shared/analyze_core.js     fluxo: validar → verificar fatos → regras → gravar → alternativas
data/demo-data.js          dados iniciais (fictícios marcados + canais de apoio reais)
supabase/migrations/       esquema + RLS
supabase/seed.sql          GERADO por scripts/build-seed.js
supabase/functions/        analyze, report, moderate (Deno)
extension/                 extensão Chrome MV3 (carregar esta pasta); painel.html = perfil, imagens, histórico, revisão
api/                       API ELO em Python (FastAPI): leitura de imagens + verificação pública + gestão
api/bridge/elo_bridge.js   ponte Node: a API usa as MESMAS regras de shared/ (sem reescrever em Python)
demo/vagas.html            portal de vagas fictício (11 vagas; a v11 tem o golpe só no panfleto)
demo/feed.html             feed social fictício (posts role="article", carrega mais ao rolar)
demo/social/               Mural (estilo feed com grupos) e RedePro (rede profissional), com panfletos
demo/img/                  panfletos PNG (scripts/build-flyers.js) + flyers.json (índice SHA-256)
tests/                     testes unitários e E2E
docs/                      referências, dados para a plataforma
```

## 1. Banco (Supabase) — ~10 min

1. Crie um projeto grátis em https://supabase.com.
2. **SQL Editor** → cole e rode `supabase/migrations/20261107000001_elo_schema.sql`.
3. **SQL Editor** → cole e rode `supabase/seed.sql`.
4. Confira em **Table Editor**: `companies` (7), `opportunities` (6), `support_resources` (11), `risk_indicators` (17), `legal_references` (16), `jobs` (1 anúncio "já visto").

## 2. Edge Functions — ~10 min

Com a [Supabase CLI](https://supabase.com/docs/guides/cli) instalada, na raiz do projeto:

```bash
supabase login
supabase link --project-ref SEU_PROJECT_REF
supabase functions deploy analyze --no-verify-jwt
supabase functions deploy report  --no-verify-jwt
supabase functions deploy moderate --no-verify-jwt
supabase secrets set REPORT_SALT=um-valor-aleatorio
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são injetadas automaticamente pelo Supabase nas funções. A service role **só existe no servidor**. `--no-verify-jwt` é necessário porque as chaves novas `sb_publishable_…` não são JWT. As funções validam a entrada por conta própria.

Teste rápido:

```bash
curl -X POST https://SEU-PROJETO.supabase.co/functions/v1/analyze \
  -H "apikey: SUA_ANON_KEY" -H "Authorization: Bearer SUA_ANON_KEY" -H "Content-Type: application/json" \
  -d '{"job":{"title":"Atendente em Bangkok","description":"Não precisa experiência. Pague a taxa de visto via Pix. Chama no WhatsApp.","url":"https://exemplo.test/1"}}'
```

A resposta deve ter `"mode":"supabase"` e um `analysis_id`. A linha aparece em `analyses`.

## 3. Extensão — ~2 min

1. Chrome → `chrome://extensions` → ligue **Modo do desenvolvedor**.
2. **Carregar sem compactação** → escolha a pasta `extension/`.
3. Clique no ícone do ELO → **Abrir painel**:
   - **Meu perfil**: área de interesse e região (opcional). Gera avisos personalizados, nunca muda o nível de risco.
   - **Configurações**: endereço da API ELO (`http://localhost:8787` ou o do ngrok), chave de administrador e, opcionalmente, Supabase (URL + chave **anon/publishable**).

Sem configuração, a extensão funciona em **modo local**: mesmas regras, dados de demonstração, nada gravado. O painel sempre diz em qual modo está.

## 4. Demonstração — internet simulada

```bash
python3 -m http.server 8080 --directory demo
```

Abra http://localhost:8080. Daí saem quatro páginas, todas geradas de `data/demo-data.js`:

- **Buscador** (`busca.html`): resultados com link para cada vaga. O ELO marca cada resultado com **análise preliminar**, porque só tem título e resumo. Resultados de sites de governo são ignorados.
- **Rede social** (`feed.html`): posts comuns misturados com ofertas. Mais posts carregam depois, como num feed real. O ELO só mostra o selo nas ofertas com sinais de risco.
- **Portal de vagas** (`vagas.html`): 10 vagas, sendo 4 consistentes (SP, GO, Portugal e Espanha em espanhol), 1 sem dados e 5 de risco (Pará, Tailândia, Tailândia em inglês, Dubai e Camboja).
- **Na página de cada vaga, a análise aparece no meio do anúncio**: resumo, os 3 principais motivos com o trecho, o botão "Ver em detalhes por que parece falsa" e, logo abaixo, **vagas que parecem mais seguras** e **portais oficiais**.
- **Idiomas:** anúncios em inglês e espanhol são detectados e analisados com regras nesses idiomas. Se o Chrome tiver o tradutor embutido (Translator API, Chrome 138+), aparece o botão "Traduzir anúncio para português", que traduz no próprio navegador.
- **Página de cada vaga** (`vaga/*.html`): tem dados estruturados JSON-LD `JobPosting`, como portais reais, e análise completa. O botão "Candidatar-se" abre uma explicação do que aconteceria naquele tipo de anúncio, sem enviar nada.

Os textos de risco seguem padrões documentados (ONU/ACNUDH 2023, Itamaraty, PF 2026, OIT, art. 149 do CP). Cada página da vaga diz em qual padrão se baseia. Em vagas de risco, o painel mostra **vagas parecidas** de parceiros fictícios e **portais oficiais reais**: SINE para vagas no Brasil; EURES, IEFP e Job Bank Canada para vagas no exterior.

**Prova de persistência:** depois de clicar num selo, abra o Supabase → `analyses`. Lá está a linha com o mesmo id mostrado no rodapé do painel. Relatos aparecem em `reports` como `pendente`.

Roteiro sugerido: **buscador → resultado com "Atenção (preliminar)" → abrir a vaga → selo "Alto risco" → painel com trechos, leis, vagas parecidas e portais oficiais → id da análise → mostrar a linha no Supabase → enviar relato → `reports` pendente.**

## Como funciona em sites reais

| Onde | O que o ELO lê | Tipo de análise |
|---|---|---|
| Página com `data-elo-job` (demo) | título, empresa, local, salário, descrição | completa |
| Sites com JSON-LD `JobPosting` (muitos portais: LinkedIn, Indeed, Gupy etc.) | dados estruturados da vaga | completa |
| Google (`/search`) | título + resumo dos resultados com cara de vaga | **preliminar** |
| Facebook e outros feeds (`[role="article"]`) | texto visível de cada post; reanalisa ao clicar em "Ver mais" | completa se o texto for longo |
| Página genérica de vaga | `h1` + texto principal | completa |

Não cobrimos "todas as vagas da internet". Só o que está na página aberta.

**Privacidade (LGPD):** a leitura é feita no navegador. Em feeds e no Google, o ELO só envia algo ao servidor quando encontra sinal de risco ou quando a pessoa clica no selo. O nome de quem postou nunca é enviado. O histórico ("você viu anúncio igual há 30 dias", "mesmo telefone com outra empresa") fica só no navegador e pode ser apagado no popup. Dá para pausar por site.

## Verificações externas (feitas na Edge Function, com tempo-limite)

- **RDAP** (`rdap.org`): idade do domínio do site/e-mail da empresa. Funciona para .com, .net, .es e outros. Alguns ccTLDs não têm RDAP e caem em "insuficiente".
- **BrasilAPI** (`/api/cnpj/v1`): situação e data de abertura do CNPJ citado no anúncio.
- **GLEIF**: nome de empresa estrangeira no registro LEI (só cobre empresas maiores).
- **Cadastro de Empregadores (lista suja)**: tabela `employer_registry`. O registro incluído é FICTÍCIO. Para usar a lista oficial, baixe a planilha no site do MTE, salve como CSV e importe pelo Table Editor (colunas: `employer_name, document, uf, establishment, workers, inclusion_date, source`).

Falha de uma verificação **nunca vira alerta**. Ela aparece em "informações insuficientes".

Câmbio de referência fixo, só para ordem de grandeza do salário: USD 5,5; EUR 6; GBP 7; THB 0,16; AED 1,5.

## Segurança

- RLS ligado em todas as tabelas. `anon` só tem SELECT nas tabelas públicas. Nenhum INSERT/UPDATE/DELETE no cliente.
- `reports` não é legível nem gravável pelo cliente. Relatos entram como `pendente` via Edge Function `report` (limite de 5 por origem por dia). Só os aprovados aparecem, sem identificação, na view `public_reports`.
- Moderação: crie um usuário em Authentication, rode `insert into admins(user_id) values ('<uuid>')` e use a função `moderate` com o token desse usuário. Também dá para moderar direto no Table Editor.
- Relatos **não** são enviados a autoridades. O painel diz isso e aponta os canais oficiais.

## 5. API ELO — imagens, verificação pública e gestão

Anúncios de scam center chegam muitas vezes como **panfleto em imagem**, com quase nada em texto. A API lê a imagem e passa o texto pelas mesmas regras da extensão.

```bash
cp .env.example .env        # defina ELO_ADMIN_KEY e, para leitura com IA, ANTHROPIC_API_KEY
npm run api:setup           # cria api/.venv e instala as dependências
npm run api                 # http://localhost:8787  (documentação em /docs)
```

Leitura da imagem, nesta ordem:
1. **Claude Vision** (`ANTHROPIC_API_KEY`; modelo em `ELO_VISION_MODEL`, padrão `claude-opus-5-5`): transcreve o texto e extrai empresa, salário, contatos, visto e rota.
2. **Tesseract** (OCR local, grátis): `sudo apt install tesseract-ocr tesseract-ocr-por`.
3. **Demonstração**: sem os dois, os panfletos de `demo/img/` são reconhecidos pelo SHA-256, então a demo funciona offline.

| Rota | Acesso | Para quê |
|---|---|---|
| `POST /v1/analisar/texto` | público, com limite por IP | texto de uma vaga → nível, sinais, trechos, fundamentos |
| `POST /v1/analisar/imagem` (multipart) e `/imagem/base64` | público | imagem (+ legenda) → campos extraídos + análise |
| `GET /v1/indicadores` | público | regras, severidade e base legal |
| `POST /v1/alertas/inscricao` | público | formulário de alertas da landing page (tudo opcional, só exige consentimento) |
| `GET /` | público | página "Verificar uma vaga" para qualquer pessoa |
| `POST /v1/relatos` | público | botão **Reportar**: o anúncio entra na base de comparação |
| `/v1/gestao/*` | header `X-Elo-Admin-Key` | histórico, detalhe, correção (`PATCH`), CSV, inscrições, relatos (moderação) |

**Privacidade:** a imagem não é guardada (só o SHA-256, os campos e o resultado). Na inscrição, a localização é arredondada para cerca de 100 m e o telefone é opcional.

**Na extensão:** passe o mouse sobre a imagem de um post ou de uma vaga. Aparece o botão **"ELO · Verificar imagem"** no canto inferior esquerdo. Também dá para clicar com o botão direito → **Verificar esta imagem com o ELO**, ou usar o Painel → **Analisar imagem**. O resultado repinta o selo do post e abre o painel com "Aviso lido da IMAGEM do anúncio".

**Reportar anúncio:** o botão **⚑ Reportar** fica no painel e na análise no meio da página da vaga. O relato (categoria, comentário, texto do anúncio, nível e sinais) vai para `POST /v1/relatos`. A partir daí, anúncios com texto parecido ou com o **mesmo contato** (telefone, e-mail, @Telegram) mostram "Já reportado por usuários". Isso é uma nota: relatos sozinhos não mudam o nível de risco. Relatos rejeitados em `PATCH /v1/gestao/relatos/{id}` saem da base de comparação.

**Atualizar a extensão:** depois de baixar a versão nova (ou de um `git pull`), abra `chrome://extensions` e clique no ícone de recarregar (↻) no cartão do ELO. Em seguida, recarregue as abas que já estavam abertas. Se você instalou pelo zip, substitua o conteúdo da pasta antes de recarregar. Se o Chrome pedir uma permissão nova (a v0.3 adicionou o menu de contexto), aceite.

## 6. Versão online (ngrok)

A API serve tudo no mesmo endereço: `/demo/` (vagas fake, Mural, RedePro), `/lp/` (landing page) e a própria API.

```bash
npm run api
ngrok http 8787
```

- Abra `https://SEU-ENDERECO.ngrok-free.app/demo/social/mural.html` e `/demo/social/redepro.html`.
- No Painel da extensão → Configurações, use `https://SEU-ENDERECO.ngrok-free.app` como endereço da API.
- A landing page em `/lp/` envia as inscrições para a mesma API automaticamente.
- O GitHub Pages também publica a demo em `/demo` (sem a API: a leitura de imagens usa o endereço configurado no Painel).
- Com o ngrok, `/v1/gestao/*` fica na internet: use uma `ELO_ADMIN_KEY` longa.

## Landing page

`site/index.html` é a página pública de divulgação (sem build). O workflow `.github/workflows/pages.yml` publica a pasta (e a demo em `/demo`) no GitHub Pages a cada push em `site/` ou `demo/`: https://alexlucerofer.github.io/TRTVR/ (em Settings → Pages, escolha **Source: GitHub Actions**).

- O QR code aponta para a própria página (endereço onde ela estiver publicada). O botão "Baixar QR (PNG)" gera a versão para cartaz.
- O botão de download aponta para o zip do último release: `npm run zip && gh release create vX.Y.Z elo-extensao.zip`.
- Para ver localmente: `python3 -m http.server 8090 --directory site`, ou `npm run api` e abrir http://localhost:8787/lp/.
- **Alertas por região** (`#alertas`): botão "Usar minha localização" (o navegador pede permissão), áreas e regiões de interesse, telefone/WhatsApp e e-mail opcionais. Idioma e fuso horário vêm do navegador. A página mostra a prévia exata do que será enviado e só envia com o consentimento marcado. A resposta traz a região estimada e os canais de ajuda dela. Fora da API, o servidor é definido por `?api=https://...` ou pelo campo "Servidor da API".

## Desenvolvimento

```bash
npm run build      # regenera seed.sql, seed.json, demo/*.html e copia rules.js/analyze_core.js
npm run flyers     # regenera os panfletos PNG (Chrome headless) e demo/img/flyers.json
npm test           # testes unitários das regras
npm run test:api   # testes da API (pytest)
npm run test:e2e   # Chromium + extensão + API real: demo, Mural, RedePro, painel e LP (npm i; npm run api:setup)
npm run zip        # gera elo-extensao.zip
```

Edite as regras **só** em `shared/` e os dados **só** em `data/demo-data.js`, e rode `npm run build`.

Veja [TESTES.md](TESTES.md) para o que foi realmente testado e o que falta.
