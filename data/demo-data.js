// Fonte ÚNICA dos dados iniciais. `node scripts/build-seed.js` gera supabase/seed.sql e extension/data/seed.json.
// EMPRESAS, VAGAS, OPORTUNIDADES E REGISTROS MARCADOS is_demo SÃO FICTÍCIOS (domínios .example, reservados pela IANA).
// Canais de apoio (support_resources) são REAIS — conferir links antes da apresentação (ver README).
const CHECKED = '2026-11-07';

const companies = [
  { key: 'horizonte', name: 'Horizonte Serviços de Atendimento Ltda (fictícia)', domain: 'horizonte-atendimento.example', country: 'BR', registry_id: null, verification_status: 'demonstracao', source: 'Dado fictício de demonstração ELO', domain_created_on: '2015-03-10', is_demo: true },
  { key: 'valeverde', name: 'Cooperativa Agrícola Vale Verde (fictícia)', domain: 'coopvaleverde.example', country: 'BR', registry_id: null, verification_status: 'demonstracao', source: 'Dado fictício de demonstração ELO', domain_created_on: '2011-08-01', is_demo: true },
  { key: 'goldenbridge', name: 'Golden Bridge International Group (fictícia)', domain: 'goldenbridge-jobs.example', country: 'TH', registry_id: null, verification_status: 'nao_verificada', source: 'Dado fictício de demonstração ELO', domain_created_on: '2026-10-20', is_demo: true },
  { key: 'siamstar', name: 'Siam Star Recruitment (fictícia)', domain: null, country: 'TH', registry_id: null, verification_status: 'inconsistente', source: 'Dado fictício de demonstração ELO — mesmo anúncio com outro nome', domain_created_on: null, is_demo: true },
  { key: 'boasafra', name: 'Agropecuária Boa Safra (fictícia)', domain: null, country: 'BR', registry_id: null, verification_status: 'nao_verificada', source: 'Dado fictício de demonstração ELO', domain_created_on: null, is_demo: true },
  { key: 'atlantico', name: 'Hotel Atlântico Lda (fictício)', domain: 'hotelatlantico.example', country: 'PT', registry_id: null, verification_status: 'demonstracao', source: 'Dado fictício de demonstração ELO', domain_created_on: '2012-04-20', is_demo: true },
  { key: 'desertstar', name: 'Desert Star Talents (fictícia)', domain: null, country: 'AE', registry_id: null, verification_status: 'nao_verificada', source: 'Dado fictício de demonstração ELO', domain_created_on: null, is_demo: true },
  { key: 'mekong', name: 'Mekong Digital Marketing (fictícia)', domain: null, country: 'KH', registry_id: null, verification_status: 'nao_verificada', source: 'Dado fictício de demonstração ELO', domain_created_on: null, is_demo: true },
  { key: 'pacificbridge', name: 'Pacific Bridge Staffing (fictícia)', domain: null, country: 'TH', registry_id: null, verification_status: 'nao_verificada', source: 'Dado fictício de demonstração ELO', domain_created_on: null, is_demo: true },
  { key: 'iberia', name: 'Hostelería Costa Brava S.L. (fictícia)', domain: 'costabrava-hosteleria.example', country: 'ES', registry_id: null, verification_status: 'demonstracao', source: 'Dado fictício de demonstração ELO', domain_created_on: '2014-06-11', is_demo: true },
  { key: 'recomeco1', name: 'Rede Parceira Recomeço — Logística Aurora (fictícia)', domain: 'logistica-aurora.example', country: 'BR', registry_id: null, verification_status: 'demonstracao', source: 'Parceira fictícia', domain_created_on: '2009-01-15', is_demo: true },
  { key: 'recomeco2', name: 'Instituto Tecer Futuro (fictício)', domain: 'tecerfuturo.example', country: 'BR', registry_id: null, verification_status: 'demonstracao', source: 'Parceira fictícia', domain_created_on: '2018-05-02', is_demo: true }
];

// Vagas que aparecem na página de demonstração (demo/vagas.html) — mesmos textos.
const demoJobs = [
  { key: 'v1', company: 'horizonte', company_name: 'Horizonte Serviços de Atendimento Ltda (fictícia)', title: 'Analista de Atendimento ao Cliente', location: 'São Paulo/SP — presencial', salary: 'R$ 2.800 + VR + VT',
    description: 'Contratação CLT com carteira assinada. Jornada de 44h semanais (seg a sex, 8h às 17h48). Benefícios: vale-refeição, vale-transporte, plano de saúde após 90 dias. Requisitos: ensino médio completo, experiência de 6 meses com atendimento. Processo seletivo: entrevista online e presencial, sem nenhuma taxa. Candidaturas pelo site horizonte-atendimento.example/carreiras ou rh@horizonte-atendimento.example.',
    url: 'https://elo-demo.local/vagas/analista-atendimento' },
  { key: 'v2', company: 'valeverde', company_name: 'Cooperativa Agrícola Vale Verde (fictícia)', title: 'Operador de Colheita Mecanizada (safra)', location: 'Rio Verde/GO', salary: 'R$ 3.400 + horas extras',
    description: 'Contrato de safra por prazo determinado (6 meses), registro em carteira. Alojamento no local com quartos, banheiros e refeitório, sem nenhum desconto. Jornada de 8 horas com 1 folga semanal. Requisitos: CNH categoria C e curso de operador. Transporte de ida e volta pago pela cooperativa, sem desconto. Inscrições: coopvaleverde.example/vagas ou rh@coopvaleverde.example.',
    url: 'https://elo-demo.local/vagas/operador-colheita' },
  { key: 'v3', company: null, company_name: null, title: 'Auxiliar de serviços gerais — vaga urgente', location: null, salary: null,
    description: 'Estamos contratando auxiliar de serviços gerais para início imediato em empresa parceira. Interessados mandem currículo e aguardem retorno. Mais informações serão passadas após a seleção dos candidatos.',
    url: 'https://elo-demo.local/vagas/auxiliar-servicos' },
  { key: 'v4', company: 'goldenbridge', company_name: 'Golden Bridge International Group (fictícia)', title: 'Atendente Bilíngue em Bangkok — US$ 2.500/mês', location: 'Bangkok, Tailândia', salary: 'US$ 2.500 por mês',
    description: 'Vaga de atendimento ao cliente para empresa de investimentos em cripto. Não precisa experiência, treinamento do zero. Passagem aérea paga pela empresa e descontada do salário nos primeiros meses. Para garantir sua vaga é preciso pagar a taxa de visto de R$ 450 via Pix. Envie foto do passaporte pelo WhatsApp +855 12 345 678. Embarque imediato, vagas limitadas, responda hoje! Contato: goldenbridge.rh@gmail.com',
    url: 'https://elo-demo.local/vagas/atendente-bangkok' },
  { key: 'v5', company: 'boasafra', company_name: 'Agropecuária Boa Safra (fictícia)', title: 'Trabalhadores para roçado e cerca — Pará', location: 'Interior do Pará', salary: 'R$ 200 por dia',
    description: 'Precisamos de 20 homens para roçado e construção de cerca em fazenda no Pará. Levamos de ônibus até a fazenda, alojamento na fazenda. Passagem e comida descontadas no pagamento. Trabalho de domingo a domingo até terminar a empreita. Documentos ficam com o encarregado durante o serviço. Sem contrato, pagamento no final. Chama no zap.',
    url: 'https://elo-demo.local/vagas/rocado-para' },
  { key: 'v6', company: 'atlantico', company_name: 'Hotel Atlântico Lda (fictício)', title: 'Cozinheiro(a) em Portugal — contrato e visto de trabalho', location: 'Porto, Portugal', salary: '€ 1.150 por mês (14 salários/ano)',
    description: 'Contrato de trabalho escrito de 12 meses, renovável, enviado antes da viagem para análise. A empresa apoia o pedido de visto de trabalho no Consulado de Portugal; você mantém seu passaporte e documentos. Jornada de 40 horas semanais com 2 folgas. Requisitos: 2 anos de experiência comprovada em cozinha. Processo seletivo sem nenhuma taxa: entrevista por vídeo e prova prática. Candidaturas pelo site hotelatlantico.example/carreiras ou rh@hotelatlantico.example.',
    url: 'https://elo-demo.local/vagas/cozinheiro-portugal' },
  { key: 'v7', company: 'desertstar', company_name: 'Desert Star Talents (fictícia)', title: 'Recepcionista e modelo para eventos em Dubai', location: 'Dubai, Emirados Árabes', salary: 'US$ 4.000 por mês',
    description: 'Procuramos mulheres de 18 a 25 anos, bonitas e comunicativas, para recepcionista e modelo em eventos de luxo em Dubai. Não precisa experiência nem inglês. Envie fotos de corpo inteiro e de biquíni pelo direct. Passagem e hospedagem pagas, depois descontadas do salário. Não comente com a família até a viagem estar confirmada. Vagas limitadas!',
    url: 'https://elo-demo.local/vagas/recepcionista-dubai' },
  { key: 'v8', company: 'mekong', company_name: 'Mekong Digital Marketing (fictícia)', title: 'Operador de marketing digital — Camboja (salário em dólar)', location: 'Sihanoukville, Camboja', salary: 'US$ 1.800 + comissão',
    description: 'Trabalho com marketing online e chat com clientes. Só precisa saber digitar e ter noções de inglês. Viagem paga pela empresa. Ao chegar, os documentos ficam com a empresa para fazer o visto e o celular fica guardado durante o expediente. Jornada de 12 horas por dia. Contato só pelo Telegram t.me/mekongrh_demo. Responda hoje para garantir a vaga.',
    url: 'https://elo-demo.local/vagas/marketing-camboja' },
  { key: 'v9', company: 'pacificbridge', company_name: 'Pacific Bridge Staffing (fictícia)', title: 'Customer Service Representative — Bangkok (Portuguese speakers)', location: 'Bangkok, Thailand', salary: 'USD 2,200 per month',
    description: 'We are hiring Portuguese speakers for customer support in an online investment company. No experience needed, we train you. Free flight ticket, deducted from your salary later. You must pay a visa processing fee of USD 150 before departure. Send a photo of your passport on Telegram. Limited slots, apply today!',
    url: 'https://elo-demo.local/vagas/customer-service-bangkok' },
  { key: 'v10', company: 'iberia', company_name: 'Hostelería Costa Brava S.L. (fictícia)', title: 'Camarero/a de sala — temporada de verano', location: 'Girona, España', salary: '1.400 € brutos al mes',
    description: 'Ofrecemos contrato de trabajo de temporada (mayo a octubre) con alta en la seguridad social y alojamiento compartido sin coste. Gestionamos el visado de trabajo con el consulado; tus documentos quedan siempre contigo. Jornada de 40 horas semanales con dos días de descanso. Requisitos: experiencia mínima de 1 año en restauración. El proceso de selección es gratuito, con entrevista por videollamada. Envía tu currículum a empleo@costabrava-hosteleria.example.',
    url: 'https://elo-demo.local/vagas/camarero-espana' }
];
// padrões reais em que cada anúncio fictício se baseia (mostrado na página da vaga)
const patterns = {
  v1: 'Anúncio consistente: empresa identificável, contrato CLT, salário, jornada e processo seletivo sem taxa.',
  v2: 'Anúncio consistente: alojamento e transporte SEM desconto, registro em carteira, jornada legal (CP, art. 149 — o contrário disso).',
  v3: 'Anúncio sem dados mínimos: sem empresa, salário, local ou contrato.',
  v4: 'Padrão descrito pela ONU/ACNUDH (2023), Itamaraty e PF (2026): atendimento/cripto no Sudeste Asiático, sem experiência, viagem paga e descontada, taxa e passaporte por WhatsApp.',
  v5: 'Padrão de aliciamento ("gato") em resgates de trabalho escravo no Brasil: transporte para fazenda, dívida com passagem e comida, documentos retidos (CP, arts. 149 e 207).',
  v6: 'Anúncio consistente no exterior: contrato escrito antes da viagem, visto de trabalho, documentos com o trabalhador (Lei 7.064/1982; OIT, recrutamento equitativo).',
  v7: 'Padrão de aliciamento para exploração sexual (OIT/UNODC): mulheres jovens, fotos de corpo, viagem paga e descontada, pedido de sigilo à família.',
  v9: 'Anúncio em INGLÊS para falantes de português (padrão citado pela ONU/ACNUDH 2023 e PF 2026): atendimento em Bangkok, taxa de visto, passagem descontada, passaporte por Telegram.',
  v10: 'Anúncio em ESPANHOL consistente: contrato de temporada, seguridade social, visto de trabalho, documentos com o trabalhador, seleção gratuita.',
  v8: 'Padrão de centros de golpes no Camboja (ONU/ACNUDH 2023): "marketing digital", retenção de documentos e celular, jornada exaustiva, contato só por Telegram.'
};
demoJobs.forEach((j) => { j.slug = j.url.split('/').pop(); j.pattern = patterns[j.key]; });

// Anúncio já "visto" pelo sistema: mesmo texto da v4 com outro nome (demonstra ANUNCIO_REPLICADO)
const seenJobs = [
  { company: 'siamstar', company_name: 'Siam Star Recruitment (fictícia)', title: 'Atendente bilíngue Tailândia — salário em dólar', location: 'Bangkok, Tailândia', salary: 'US$ 2.300',
    description: 'Vaga de atendimento ao cliente para empresa de investimentos em cripto. Não precisa experiência, treinamento do zero. Passagem aérea paga pela empresa e descontada do salário nos primeiros meses. Envie foto do passaporte pelo WhatsApp. Embarque imediato, vagas limitadas, responda hoje!',
    url: 'https://elo-demo.local/historico/siam-star-2026-10', first_seen_at: '2026-10-05T12:00:00Z' }
];

const employerRegistry = [
  { employer_name: 'Agropecuária Boa Safra (fictícia)', document: null, uf: 'PA', establishment: 'Fazenda fictícia', workers: 12, inclusion_date: '2025-10-01', source: 'REGISTRO FICTÍCIO DE DEMONSTRAÇÃO — importe a lista oficial do MTE', source_url: null, is_demo: true }
];

const opportunities = [
  { company: 'horizonte', institution: 'Horizonte Serviços de Atendimento Ltda (fictícia)', title: 'Atendente de SAC bilíngue (inglês) — remoto, CLT', kind: 'emprego', category: 'atendimento', location: 'Remoto (Brasil)', country: 'BR', requirements: 'Inglês intermediário; ensino médio', salary: 'R$ 3.600', url: 'https://horizonte-atendimento.example/carreiras', for_survivors: true, blind_referral: true },
  { company: 'recomeco1', institution: 'Logística Aurora (fictícia)', title: 'Auxiliar de logística — CLT', kind: 'emprego', category: 'logistica', location: 'Campinas/SP', country: 'BR', requirements: 'Ensino fundamental', salary: 'R$ 2.300 + benefícios', url: 'https://logistica-aurora.example/vagas', for_survivors: true, blind_referral: true },
  { company: 'valeverde', institution: 'Cooperativa Agrícola Vale Verde (fictícia)', title: 'Auxiliar agrícola com registro — safra', kind: 'emprego', category: 'agro', location: 'Rio Verde/GO', country: 'BR', requirements: 'Nenhum; treinamento pago', salary: 'R$ 2.600', url: 'https://coopvaleverde.example/vagas', for_survivors: true, blind_referral: true },
  { company: 'horizonte', institution: 'Horizonte Serviços de Atendimento Ltda (fictícia)', title: 'Suporte técnico júnior — atendimento em espanhol', kind: 'emprego', category: 'atendimento', location: 'São Paulo/SP', country: 'BR', requirements: 'Espanhol básico', salary: 'R$ 3.100', url: 'https://horizonte-atendimento.example/carreiras', for_survivors: false, blind_referral: false },
  { company: 'recomeco2', institution: 'Instituto Tecer Futuro (fictício)', title: 'Curso gratuito de atendimento e informática + encaminhamento', kind: 'capacitacao', category: 'atendimento', location: 'Online', country: 'BR', requirements: 'Nenhum', salary: 'Bolsa-auxílio', url: 'https://tecerfuturo.example', for_survivors: true, blind_referral: true },
  { company: 'recomeco2', institution: 'Instituto Tecer Futuro (fictício)', title: 'Programa Recomeço: acompanhamento psicossocial e plano de carreira', kind: 'reintegracao', category: 'reintegracao', location: 'Online e presencial', country: 'BR', requirements: 'Encaminhamento por rede de assistência', salary: null, url: 'https://tecerfuturo.example/recomeco', for_survivors: true, blind_referral: true }
].map((o) => ({ ...o, is_demo: true }));

const supportResources = [
  { institution: 'Disque 100 — Ministério dos Direitos Humanos e da Cidadania', support_type: 'denuncia', country: 'BR', phone: '100', official_url: 'https://www.gov.br/mdh/pt-br/ondh', description: 'Denúncias de violações de direitos humanos, inclusive tráfico de pessoas e trabalho escravo. Gratuito, 24h.' },
  { institution: 'Ligue 180 — Central de Atendimento à Mulher', support_type: 'denuncia', country: 'BR', phone: '180', official_url: 'https://www.gov.br/mulheres/pt-br/ligue180', description: 'Atendimento a mulheres em situação de violência, inclusive tráfico e exploração sexual.' },
  { institution: 'Sistema Ipê — Ministério do Trabalho e Emprego', support_type: 'denuncia', country: 'BR', phone: null, official_url: 'https://ipe.sit.trabalho.gov.br', description: 'Canal oficial para denunciar trabalho análogo ao de escravo; pode ser anônimo.' },
  { institution: 'Ministério Público do Trabalho', support_type: 'denuncia', country: 'BR', phone: null, official_url: 'https://mpt.mp.br', description: 'Denúncias trabalhistas, incluindo trabalho escravo e aliciamento.' },
  { institution: 'Polícia Federal', support_type: 'denuncia', country: 'BR', phone: null, official_url: 'https://www.gov.br/pf/pt-br', description: 'Investiga tráfico internacional de pessoas. Em emergência no Brasil: 190.' },
  { institution: 'Itamaraty — Portal Consular (brasileiros no exterior)', support_type: 'emergencia_exterior', country: 'INT', phone: null, official_url: 'https://www.gov.br/mre/pt-br/assuntos/portal-consular', description: 'Assistência consular e contatos de plantão das embaixadas e consulados.' },
  { institution: 'Embaixada do Brasil em Bangkok', support_type: 'emergencia_exterior', country: 'TH', phone: null, official_url: 'https://www.gov.br/mre/pt-br/embaixada-bangkok', description: 'Atende brasileiros na Tailândia (verifique na página o plantão consular).' },
  { institution: 'Ministério da Justiça — Enfrentamento ao Tráfico de Pessoas', support_type: 'orientacao', country: 'BR', phone: null, official_url: 'https://www.gov.br/mj/pt-br/assuntos/sua-protecao/trafico-de-pessoas', description: 'Política nacional, Núcleos de Enfrentamento e Postos Avançados de atendimento humanizado ao migrante.' },
  { institution: 'OIM — Organização Internacional para as Migrações (Brasil)', support_type: 'assistencia', country: 'INT', phone: null, official_url: 'https://brazil.iom.int', description: 'Apoio a migrantes e vítimas de tráfico, incluindo retorno voluntário e reintegração.' },
  { institution: 'Seguro-desemprego do trabalhador resgatado (Lei 10.608/2002)', support_type: 'reintegracao', country: 'BR', phone: null, official_url: 'https://www.planalto.gov.br/ccivil_03/leis/2002/l10608.htm', description: 'Trabalhadores resgatados de condição análoga à de escravo têm direito a três parcelas de seguro-desemprego.' },
  { institution: 'Assistência social — CRAS/CREAS (MDS)', support_type: 'reintegracao', country: 'BR', phone: null, official_url: 'https://www.gov.br/mds/pt-br', description: 'Rede pública de assistência social para acolhimento e encaminhamento.' },
  { institution: 'SINE / Portal Emprega Brasil (governo federal)', support_type: 'portal_emprego', country: 'BR', phone: null, official_url: 'https://www.gov.br/pt-br/servicos/buscar-emprego-no-sistema-nacional-de-emprego-sine', description: 'Vagas do Sistema Nacional de Emprego, gratuito. Também nos postos do SINE da sua cidade.' },
  { institution: 'EURES — Portal Europeu da Mobilidade Profissional (União Europeia)', support_type: 'portal_emprego', country: 'INT', phone: null, official_url: 'https://eures.europa.eu', description: 'Portal oficial de vagas nos países da União Europeia. Verifique sempre as regras de visto do país.' },
  { institution: 'IEFP — Instituto do Emprego e Formação Profissional (Portugal)', support_type: 'portal_emprego', country: 'INT', phone: null, official_url: 'https://iefponline.iefp.pt', description: 'Serviço público de emprego de Portugal.' },
  { institution: 'Job Bank — Governo do Canadá', support_type: 'portal_emprego', country: 'INT', phone: null, official_url: 'https://www.jobbank.gc.ca', description: 'Portal oficial de vagas do Canadá, com indicação de vagas abertas a estrangeiros.' }
].map((r) => ({ ...r, checked_at: CHECKED }));

// Posts da página que imita um feed social (demo/feed.html)
const feedPosts = [
  { author: 'Maria (perfil fictício)', text: 'Que dia lindo hoje no parque com as crianças! ☀️' },
  { author: 'Oportunidades Ásia (página fictícia)', text: '🔥 VAGAS NA TAILÂNDIA 🔥 Contratamos atendentes para empresa de cripto em Bangkok. Salário de US$ 2.800 por mês, não precisa experiência! Passagem paga pela empresa. Vagas limitadas, chama no WhatsApp +855 98 765 432 e envie foto do passaporte. Embarque esta semana!' },
  { author: 'Logística Aurora (fictícia)', text: 'Estamos contratando auxiliar de logística em Campinas/SP. Contrato CLT, salário R$ 2.300 + vale-transporte e vale-refeição. Jornada de 44h semanais. Candidate-se pelo site logistica-aurora.example/vagas. Processo seletivo sem nenhuma taxa.' },
  { author: 'Empreiteiro (perfil fictício)', text: 'Preciso de 15 homens pra trabalhar em fazenda no Mato Grosso, levamos de ônibus, alojamento na fazenda. Passagem e comida descontadas no pagamento, trabalho de domingo a domingo. Salário R$ 180 por dia. Chama no zap.' }
];

const data = { companies, demoJobs, seenJobs, employerRegistry, opportunities, supportResources, feedPosts };
if (typeof module !== 'undefined') module.exports = data;
