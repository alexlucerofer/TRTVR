/* ELO — motor de regras explicável.
 * Arquivo ÚNICO usado pela extensão (script clássico) e pela Edge Function (Deno),
 * e pelos testes (Node). Expõe globalThis.ELORules.
 *
 * Princípios:
 *  - Cada alerta mostra o TRECHO que o disparou e o FUNDAMENTO (lei/indicador).
 *  - País, salário ou relatos, SOZINHOS, nunca geram alerta.
 *  - O sistema nunca afirma que houve crime: aponta sinais para verificar.
 *  - Não há IA treinada aqui: são regras escritas a partir das fontes citadas.
 */
(function (root) {
  'use strict';
 
  const RULES_VERSION = '2026.11.07-2';
 
  // ------------------------------------------------------------------ fundamentos
  const LEGAL = {
    CF_1_III: { short: 'Constituição, art. 1º, III', citation: 'Constituição Federal de 1988, art. 1º, III (dignidade da pessoa humana) e art. 5º, III', summary: 'A dignidade da pessoa humana é fundamento da República; ninguém será submetido a tratamento desumano ou degradante.', url: 'https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm' },
    CP_149: { short: 'Código Penal, art. 149', citation: 'Decreto-Lei 2.848/1940, art. 149 (redação da Lei 10.803/2003)', summary: 'Redução a condição análoga à de escravo: trabalho forçado, jornada exaustiva, condições degradantes, restrição de locomoção por dívida; retenção de documentos e cerceamento de transporte (§1º).', url: 'https://www.planalto.gov.br/ccivil_03/decreto-lei/del2848compilado.htm' },
    CP_149A: { short: 'Código Penal, art. 149-A', citation: 'Decreto-Lei 2.848/1940, art. 149-A (incluído pela Lei 13.344/2016)', summary: 'Tráfico de pessoas: agenciar, recrutar, transportar ou alojar pessoa mediante grave ameaça, violência, coação, fraude ou abuso, para trabalho escravo, servidão, exploração sexual, entre outros.', url: 'https://www.planalto.gov.br/ccivil_03/decreto-lei/del2848compilado.htm' },
    CP_206: { short: 'Código Penal, art. 206', citation: 'Decreto-Lei 2.848/1940, art. 206', summary: 'Recrutar trabalhadores, mediante fraude, com o fim de levá-los para território estrangeiro.', url: 'https://www.planalto.gov.br/ccivil_03/decreto-lei/del2848compilado.htm' },
    CP_207: { short: 'Código Penal, art. 207', citation: 'Decreto-Lei 2.848/1940, art. 207, §1º', summary: 'Aliciar trabalhadores para outra localidade do país; inclui recrutar mediante fraude ou cobrança de qualquer quantia do trabalhador.', url: 'https://www.planalto.gov.br/ccivil_03/decreto-lei/del2848compilado.htm' },
    LEI_13344: { short: 'Lei 13.344/2016', citation: 'Lei 13.344, de 6 de outubro de 2016', summary: 'Dispõe sobre prevenção e repressão ao tráfico de pessoas e medidas de atenção às vítimas.', url: 'https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2016/lei/l13344.htm' },
    LEI_7064: { short: 'Lei 7.064/1982', citation: 'Lei 7.064/1982 (trabalhadores contratados no Brasil para trabalhar no exterior)', summary: 'Exige contrato escrito com salário, condições e garantias para quem é contratado no Brasil para trabalhar no exterior.', url: 'https://www.planalto.gov.br/ccivil_03/leis/l7064.htm' },
    PALERMO: { short: 'Protocolo de Palermo', citation: 'Protocolo Adicional à Convenção da ONU contra o Crime Organizado Transnacional (Decreto 5.017/2004), art. 3º, b', summary: 'O consentimento da vítima é irrelevante quando obtido por engano, fraude, coação ou abuso de vulnerabilidade.', url: 'https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/decreto/d5017.htm' },
    OIT_INDICADORES: { short: 'OIT — Indicadores de trabalho forçado', citation: 'OIT. ILO Indicators of Forced Labour. Genebra, 2012', summary: '11 indicadores: abuso de vulnerabilidade, engano, restrição de movimento, isolamento, violência, ameaças, retenção de documentos, retenção de salários, servidão por dívida, condições abusivas, horas extras excessivas.', url: 'https://www.ilo.org/publications/ilo-indicators-forced-labour' },
    OIT_OPERACIONAIS: { short: 'OIT/Comissão Europeia — indicadores operacionais', citation: 'OIT; Comissão Europeia. Operational indicators of trafficking in human beings. 2009', summary: 'Indicadores de recrutamento enganoso (natureza do trabalho, local, empregador, salário, condições, documentos) e coercitivo.', url: 'https://www.ilo.org/publications/operational-indicators-trafficking-human-beings' },
    OIT_RECRUTAMENTO: { short: 'OIT — Recrutamento equitativo', citation: 'OIT. General principles and operational guidelines for fair recruitment and definition of recruitment fees and related costs. 2019', summary: 'Nenhuma taxa de recrutamento ou custo relacionado deve ser cobrado do trabalhador; contrato claro e transparente antes da partida.', url: 'https://www.ilo.org/publications/general-principles-and-operational-guidelines-fair-recruitment-and-definition' },
    OIT_C181: { short: 'OIT — Convenção 181, art. 7', citation: 'OIT. Convenção 181 sobre Agências de Emprego Privadas, 1997, art. 7', summary: 'Agências privadas não devem cobrar, direta ou indiretamente, honorários ou custos dos trabalhadores.', url: 'https://normlex.ilo.org/dyn/nrmlx_en/f?p=NORMLEXPUB:12100:0::NO::P12100_ILO_CODE:C181' },
    ONU_SEA_2023: { short: 'ONU/ACNUDH 2023 — centros de golpes', citation: 'ACNUDH. Online scam operations and trafficking into forced criminality in Southeast Asia: recommendations for a human rights response. Bangkok, ago. 2023', summary: 'Recrutamento por ofertas falsas de emprego (atendimento, TI, cripto, marketing) com salário alto e viagem paga; vítimas levadas a centros de golpes em Mianmar, Camboja, Laos.', url: 'https://digitallibrary.un.org/record/4020504' },
    PF_SEA_2026: { short: 'Polícia Federal 2026 — tráfico para centros de golpes', citation: 'Polícia Federal. PF combate tráfico internacional de brasileiros para centros de golpes no Sudeste Asiático. jul. 2026', summary: 'Operação contra aliciamento de brasileiros por falsas vagas no Sudeste Asiático.', url: 'https://www.gov.br/pf/pt-br/assuntos/noticias/2026/07/pf-combate-trafico-internacional-de-brasileiros-para-centros-de-golpes-no-sudeste-asiatico' },
    MTE_CADASTRO: { short: 'MTE — Cadastro de Empregadores', citation: 'Cadastro de Empregadores que tenham submetido trabalhadores a condições análogas à de escravo (Portaria Interministerial MTPS/MMIRDH 4/2016 e atualizações)', summary: 'Lista pública de empregadores autuados, após decisão administrativa final.', url: 'https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/areas-de-atuacao/combate-ao-trabalho-escravo-e-analogo-ao-de-escravo' },
    LGPD: { short: 'LGPD', citation: 'Lei 13.709/2018', summary: 'Proteção de dados pessoais; o ELO só envia indicadores e link, nunca o perfil de quem publicou.', url: 'https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm' }
  };
 
  // ------------------------------------------------------------------ utilidades
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
 
  function snippet(original, idx, len) {
    const start = Math.max(0, idx - 40), end = Math.min(original.length, idx + len + 40);
    return (start > 0 ? '…' : '') + original.slice(start, end).replace(/\s+/g, ' ').trim() + (end < original.length ? '…' : '');
  }
 
  // procura padrões no texto normalizado; devolve trechos do texto original
  // (norm() preserva o comprimento quando só há acentos/espaços simples; usamos índice aproximado)
  // negações próximas anulam o trecho ("sem nenhum desconto", "não será descontado", "sem taxa")
  const NEG = /(\bsem (nenhum[a]? |qualquer )?(desconto|custo|taxa|cobranca)|nao (sera|e|ha|havera|tem) (descontad\w+|cobrad\w+|desconto|taxa|cobranca)|nenhum[a]? (desconto|taxa|cobranca)|gratuit\w+)/;
  function findAll(text, patterns) {
    const n = norm(text), orig = String(text || '').replace(/\s+/g, ' ').trim();
    const hits = [];
    for (const p of patterns) {
      const re = new RegExp(p.source, 'gi');
      let m; let guard = 0;
      while ((m = re.exec(n)) && guard++ < 5) {
        const win = n.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30);
        if (NEG.test(win)) continue;
        hits.push(snippet(orig, m.index, m[0].length));
        if (!re.global) break;
      }
    }
    return [...new Set(hits)].slice(0, 3);
  }
  const has = (text, patterns) => findAll(text, patterns).length > 0;
 
  // --------------------------------------------------------------- vocabulário
  const P = {
    taxa: [/(pagar|pague|pagamento|deposit\w*|transferir|pix|boleto)[^.]{0,60}(taxa|inscri\w+|processo seletivo|visto|treinamento|curso|uniforme|exame|reserva da vaga|garantir (a|sua) vaga|documenta\w+)/, /(taxa|valor|custo) (de|da|do) (inscri\w+|cadastro|seletiv\w+|agenciamento|intermedia\w+|visto|reserva)/, /(caucao|investimento inicial)/, /(r\$|us\$|usd)\s?\d[^.]{0,30}(para|pra) (garantir|reservar|liberar) (a|sua)? ?vaga/],
    passaporte_retencao: [/passaporte[^.]{0,50}(fica|ficara|ficarao|sera|serao|deve ficar)[^.]{0,30}(com|sob|guardad\w+|retid\w+)/, /(entregar|deixar|recolh\w+)[^.]{0,30}(o |seu |os )?(passaporte|documentos|carteira de trabalho|rg)/, /documentos (ficam|ficarao) (com|na|retidos)/],
    passaporte_envio: [/(envi\w+|mand\w+)[^.]{0,30}(foto|copia|scan)[^.]{0,20}(do |de )?passaporte/, /passaporte (valido|em maos)[^.]{0,40}(whatsapp|telegram|direct|inbox)/],
    divida: [/(passagem|viagem|transporte|alojamento|moradia|alimentacao|comida|visto)[^.]{0,60}(descontad\w+|desconto|devolv\w+|reembols\w+|pago com (o|seu) (primeiro )?salario|abatid\w+)/, /(adiantamento|divida)[^.]{0,40}(salario|trabalho)/, /(compra\w*|comprar)[^.]{0,30}(na|no) (cantina|barracao|mercado da (fazenda|empresa))/],
    restricao: [/(nao (pode|podera|e permitido) sair)/, /(celular|telefone)[^.]{0,30}(recolhid\w+|guardad\w+|proibid\w+)/, /(folga|sair) (somente|so|apenas) (apos|depois|com autorizacao)/, /(vigilancia|seguranca) (24|armad)/],
    jornada: [/(1[2-8]|doze|quatorze) ?(h|horas)[^.]{0,20}(por dia|diarias|de trabalho)/, /domingo a domingo/, /sem folga/, /(7|sete) dias por semana/],
    alojamento_isolado: [/alojamento[^.]{0,40}(fazenda|obra|mata|garimpo|carvoaria|frente de trabalho|no local)/, /(levamos|buscamos|transporte gratis)[^.]{0,40}(fazenda|obra|outro estado|garimpo)/],
    pressao: [/(vagas? limitad\w+|ultimas vagas|poucas vagas)/, /(responda|confirme|decida|garanta)[^.]{0,20}(hoje|agora|ate amanha|em 24 ?h|rapido)/, /(embarque|viagem|partida) (imediat\w+|essa semana|esta semana|amanha)/, /(sem|nao (ha|tem|precisa de)) entrevista/, /(nao conte|nao comente|sigilo)[^.]{0,30}(familia|ninguem|parentes)/, /contratacao (imediata|rapida|na hora)/],
    sem_experiencia: [/(sem|nao (precisa|exige|e necessari\w)( de)?) experiencia/, /(qualquer pessoa|nao precisa (de )?(estudo|formacao|ingles))/, /(treinamento|ensinamos) (tudo|do zero)/],
    contato_informal: [/whats ?app|wa\.me|zap\b|telegram|t\.me\/|chama (no|na) (privado|pv|dm|inbox)|direct|me chama/],
    contrato: [/contrato|clt|carteira assinada|registro em carteira|visto de trabalho|work permit|work visa|beneficios|vale[- ]transporte|ferias|jornada de (\d|trabalho)/],
    promessa: [/(ganhe|ganhar|renda de) ate/, /(trabalho|servico) (facil|simples|leve)/, /(dinheiro|renda) (rapid\w+|facil|garantid\w+)/, /(enriquecer|mudar de vida|realizar seus sonhos)/, /salario (em|de) dolar/, /salarios? atrativ\w+|otimos? salarios?|ganhos? (altos|atrativos)/],
    sexual: [/(fotos?|video)[^.]{0,30}(corpo inteiro|biquini|lingerie|sensua\w+)/, /(acompanhante|massagista|danc\w+|recepcionista|modelo|garconete)[^.]{0,60}(exterior|europa|asia|japao|espanha|portugal|tailandia|dubai)/, /(mulheres|mocas|meninas)[^.]{0,20}(18 a 2\d|jovens|bonitas)/],
    vaga: [/candidat(e|ar|e-se|ura)|contratando|vagas? abert\w*|trabalhe conosco|oportunidades? de (emprego|trabalho)|\bvagas?\b|contrat(a|amos|ando)|emprego|oportunidade de trabalho|salario|trabalhe (no|na|em)|trabalhar (no|na|em|fora)|recrut\w+|processo seletivo|hiring|job offer|we are hiring|remuneracao|\bcargo\b/],
    visto_turista: [/visto de turista|visto turistico|tourist visa|visa de turista|visado de turista|entra(r|mos)? como turista|visa on arrival/],
    transfer_fronteira: [/(transfer|traslado|transporte|carro|van)[^.]{0,60}(fronteira|border|frontera|mae sot|myawaddy|outra cidade|another city|filial|escritorio parceiro|partner office)/, /(fronteira|border)[^.]{0,40}(tailandia|thailand|mianmar|myanmar|laos|camboja|cambodia)/, /zona economica especial|special economic zone|zona economica exclusiva/],
    teste_digitacao: [/teste de digitacao|typing (test|speed|job)|digitar \d+ palavras|\d+ ?(wpm|palavras por minuto)|velocidade de digitacao/],
    gratis_tudo: [/(hospedagem|alojamento|moradia|hotel|accommodation|housing|alojamiento)[^.]{0,40}(alimentacao|comida|refeic\w+|food|meals|comidas)[^.]{0,30}(gratis|gratuit\w+|free|inclus\w+|por conta)/, /(passagem|passagens|voo|flight|ticket|pasaje)[^.]{0,30}(gratis|gratuit\w+|free|pag[ao]s? pela empresa|paid by (the )?company|por conta da empresa)/],
    faixa_etaria: [/(idade|age|edad)[^.]{0,15}(entre )?(1[8-9]|2\d) ?(a|e|-|to|y|até|ate) ?(2\d|3\d|40)( anos| years)?/, /(1[8-9]|2\d) (a|-) (3\d|40) anos/],
    trabalho_digital: [/atendimento|suporte|customer service|call ?center|cripto|crypto|digitad\w+|marketing (digital|online)|bilingue|ingles|chat|vendas online|operador|moderador|ti\b|tecnologia|apostas|bets?\b|cassino|casino|digitacao|typing|relacionamento online|investimentos? online/]
  };
 
  // ---- inglês (en) e espanhol (es): mesmos indicadores, outras línguas
  const ML = {
    taxa: [/(pay|deposit|transfer|send)[^.]{0,50}(fee|visa|training|processing|registration|deposit)/, /(processing|registration|visa|recruitment|placement|booking) fee/, /(pagar|pague|deposit\w+|transferir)[^.]{0,50}(tasa|cuota|visado|inscripcion|curso|tramite)/, /(tasa|cuota) de (inscripcion|tramite|visado|reserva)/],
    passaporte_retencao: [/(passport|documents?)[^.]{0,40}(will be (kept|held|retained)|kept by|held by|stay with)/, /(hand over|surrender) (your )?(passport|documents)/, /(pasaporte|documentos)[^.]{0,40}(se quedan|quedaran|retenid\w+|en poder de)/, /entregar (el |su |tu )?(pasaporte|documentos)/],
    passaporte_envio: [/send[^.]{0,30}(photo|copy|scan|picture)[^.]{0,15}(of )?(your )?passport/, /envi\w+[^.]{0,30}(foto|copia)[^.]{0,15}(del |de tu |de su )?pasaporte/],
    divida: [/(ticket|flight|airfare|travel|accommodation|housing|food|visa)[^.]{0,50}(deducted|deduction|repay|reimburse|paid back|from (your )?salary)/, /(pasaje|vuelo|viaje|alojamiento|comida|visado)[^.]{0,50}(descontad\w+|descuento|devolver|reembols\w+)/],
    restricao: [/(cannot|can't|not allowed to) leave/, /(phone|mobile)[^.]{0,30}(collected|kept|confiscated|not allowed|handed)/, /no (puede|podra|se permite) salir/, /(celular|movil|telefono)[^.]{0,30}(recogid\w+|guardad\w+|prohibid\w+)/],
    jornada: [/(1[2-8]) ?(h|hours?)[^.]{0,20}(a day|per day|daily|shifts?)/, /(7 days a week|no days off)/, /(1[2-8]) ?(h|horas)[^.]{0,20}(al dia|diarias|por dia)/, /(sin (dias de )?descanso|7 dias a la semana)/],
    pressao: [/limited (slots|positions|vacancies|places)/, /(apply|reply|answer|decide) (today|now|asap)/, /(immediate|urgent) (departure|start|hiring)/, /no interview/, /(don'?t tell|keep (it )?secret)/, /(plazas|vacantes) limitadas/, /(responde|contesta) hoy/, /salida inmediata/, /sin entrevista/, /no (le )?(cuentes|digas)/],
    sem_experiencia: [/no experience (needed|required|necessary)/, /no (english|degree|skills) (needed|required)/, /sin experiencia/, /no (se )?(necesita|requiere) experiencia/],
    contato_informal: [/\bdm\b|message me|inbox me|mandame (un )?mensaje/],
    contrato: [/contract|work permit|work visa|employment visa|paid leave|health insurance|contrato|permiso de trabajo|visado de trabajo|seguridad social|vacaciones pagadas/],
    promessa: [/(earn|make) up to/, /easy (job|money|work)/, /(get rich|high income|life[- ]changing)/, /(gana|ganar) hasta/, /(trabajo|dinero) facil/],
    sexual: [/(full[- ]body|bikini|lingerie) (photos?|pictures?)/, /(photos?|pictures?)[^.]{0,20}(full[- ]body|bikini|lingerie)/, /(hostess|model|dancer|escort|massage)[^.]{0,60}(abroad|dubai|asia|europe|japan)/, /(girls|women)[^.]{0,15}18 ?(-|to|a) ?2\d/, /fotos?[^.]{0,30}(cuerpo entero|bikini)/, /(azafata|modelo|bailarina)[^.]{0,60}(extranjero|dubai|europa|asia)/],
    vaga: [/\bhiring\b|\bjob\b|vacanc|\bposition\b|\bsalary\b|\bapply\b|recruit|vacante|\bempleo\b|\bsalario\b|contratamos|oferta de trabajo|ofrecemos|contrato de trabajo|\bpuesto\b/],
    trabalho_digital: [/typist|data entry|online sales|chat support|customer support|soporte|atencion al cliente/]
  };
  for (const k of Object.keys(ML)) P[k] = P[k].concat(ML[k]);
 
  // detecção simples de idioma por palavras frequentes (sem rede)
  function detectLang(text) {
    const n = ' ' + norm(text).replace(/[^a-z ]/g, ' ') + ' ';
    const count = (ws) => ws.reduce((s, w) => s + (n.split(' ' + w + ' ').length - 1), 0);
    const sc = { pt: count(['nao', 'voce', 'para', 'com', 'uma', 'sao', 'trabalho', 'empresa', 'do', 'da']), en: count(['the', 'and', 'you', 'with', 'will', 'your', 'for', 'job', 'work', 'is']), es: count(['el', 'los', 'las', 'usted', 'tu', 'y', 'una', 'trabajo', 'empresa', 'del']) };
    const best = Object.entries(sc).sort((a, b) => b[1] - a[1])[0];
    return best[1] >= 2 ? best[0] : 'pt';
  }
  const LANG_NAME = { pt: 'português', en: 'inglês', es: 'espanhol' };
 
  const SEA = /(tailandia|thailand|bangkok|mae sot|chiang|camboja|cambodia|phnom penh|sihanoukville|mianmar|myanmar|birmania|myawaddy|shwe kokko|kk park|golden triangle|triangulo dourado|bokeo|laos|vientiane|filipinas|philippines|manila|vietna|vietnam|malasia|malaysia|dubai \(transito\))/;
  const EXTERIOR = /(exterior|fora do brasil|abroad|overseas|extranjero|thailand|cambodia|myanmar|uae|japan|spain|united states|usa|uk|germany|ireland|australia|qatar|saudi|europa|asia|eua|estados unidos|canada|japao|portugal|espanha|italia|inglaterra|reino unido|dubai|emirados|tailandia|camboja|mianmar|laos|china|coreia|australia|irlanda|alemanha|franca|suica|israel|chile|argentina|paraguai|bolivia)/;
  const PHONE_CC = { '66': 'Tailândia', '855': 'Camboja', '95': 'Mianmar', '856': 'Laos', '63': 'Filipinas', '84': 'Vietnã', '60': 'Malásia', '971': 'Emirados Árabes', '34': 'Espanha', '351': 'Portugal', '1': 'EUA/Canadá', '44': 'Reino Unido', '55': 'Brasil', '86': 'China' };
  const COUNTRY_WORDS = { 'Tailândia': /tailandia|thailand|bangkok/, 'Camboja': /camboja|cambodia/, 'Mianmar': /mianmar|myanmar/, 'Laos': /laos/, 'Filipinas': /filipinas|philippines/, 'Vietnã': /vietna|vietnam/, 'Malásia': /malasia|malaysia/, 'Emirados Árabes': /dubai|emirados|abu dhabi|uae/, 'Espanha': /espanha|madri|barcelona|spain/, 'Portugal': /portugal|lisboa|porto\b/, 'EUA/Canadá': /eua|estados unidos|canada|usa\b/, 'Reino Unido': /reino unido|inglaterra|londres/, 'Brasil': /brasil|sao paulo|rio de janeiro|\b[a-z]+\/(sp|rj|mg|pr|sc|rs|ba|pe|ce|go|df|mt|ms|pa|am|to)\b/, 'China': /china/ };
 
  // salário: retorna o maior valor mensal aproximado em BRL encontrado
  // Taxas de referência FIXAS e aproximadas (documentadas no README), só para ordem de grandeza.
  const FX = { brl: 1, usd: 5.5, eur: 6, gbp: 7, thb: 0.16, aed: 1.5 };
  function parseSalaryBRL(text) {
    const n = norm(text);
    const re = /(r\$|us\$|usd|u\$|\$|€|eur|euros?|£|gbp|thb|baht|฿|aed|dolares|dolar)\s?(\d{1,3}(?:[.,\s]\d{3})+|\d+(?:[.,]\d+)?)\s?(mil|k)?|(\d{1,3}(?:[.,]\d{3})+|\d+)\s?(mil|k)?\s?(reais|dolares|dolar|euros?|baht|usd|eur)/g;
    let m, best = null;
    while ((m = re.exec(n))) {
      const curRaw = (m[1] || m[6] || '').trim();
      let num = (m[2] || m[4] || '').replace(/\s/g, '');
      const mult = (m[3] || m[5]) ? 1000 : 1;
      if (/[.,]\d{3}$/.test(num) || /[.,]\d{3}[.,]/.test(num)) num = num.replace(/[.,](?=\d{3}(\D|$))/g, '');
      num = parseFloat(num.replace(',', '.')) * mult;
      if (!isFinite(num) || num <= 0) continue;
      let cur = 'brl';
      if (/us|\$$|dolar|usd/.test(curRaw) && curRaw !== 'r$') cur = 'usd';
      if (/€|eur/.test(curRaw)) cur = 'eur';
      if (/£|gbp/.test(curRaw)) cur = 'gbp';
      if (/thb|baht|฿/.test(curRaw)) cur = 'thb';
      if (/aed/.test(curRaw)) cur = 'aed';
      const brl = num * FX[cur];
      if (brl < 300) continue; // provavelmente não é salário mensal
      if (!best || brl > best.brl) best = { brl: Math.round(brl), raw: m[0], currency: cur.toUpperCase() };
    }
    return best;
  }
 
  function phoneCountries(text) {
    const out = new Set();
    const re = /\+\s?(\d{1,3})[\s-]?\(?\d/g; let m;
    const s = String(text || '');
    while ((m = re.exec(s))) {
      const d = m[1];
      for (const len of [3, 2, 1]) { const cc = d.slice(0, len); if (PHONE_CC[cc]) { out.add(PHONE_CC[cc]); break; } }
    }
    const wa = /wa\.me\/(\d{8,15})/g;
    while ((m = wa.exec(s))) { for (const len of [3, 2, 1]) { const cc = m[1].slice(0, len); if (PHONE_CC[cc]) { out.add(PHONE_CC[cc]); break; } } }
    return [...out];
  }
  function extractContacts(text) {
    const s = String(text || '');
    const phones = (s.match(/(\+?\d[\d\s().-]{8,}\d)/g) || []).map((p) => p.replace(/\D/g, '')).filter((p) => p.length >= 10);
    const emails = (s.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || []).map((e) => e.toLowerCase());
    return { phones: [...new Set(phones)], emails: [...new Set(emails)] };
  }
  const FREE_MAIL = /@(gmail|hotmail|outlook|yahoo|live|icloud|bol|uol|proton(mail)?|yandex|mail)\./;
  function extractCNPJ(text) {
    const m = String(text || '').match(/\b(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/);
    return m ? m[1].replace(/\D/g, '') : null;
  }
  function domainOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch (e) { return null; }
  }
 
  // similaridade de texto (Jaccard de trigramas de palavras)
  function shingles(text) {
    const w = norm(text).replace(/[^a-z0-9 ]/g, ' ').split(' ').filter((x) => x.length > 2);
    const s = new Set(); for (let i = 0; i + 2 < w.length; i++) s.add(w[i] + ' ' + w[i + 1] + ' ' + w[i + 2]);
    return s;
  }
  function similarity(a, b) {
    const A = shingles(a), B = shingles(b); if (!A.size || !B.size) return 0;
    let inter = 0; for (const x of A) if (B.has(x)) inter++;
    return inter / Math.min(A.size, B.size); // contenção: detecta texto copiado mesmo com trechos acrescentados
  }
  function contentHash(text) { // FNV-1a 32 bits
    let h = 0x811c9dc5; const s = norm(text);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0');
  }
 
  function isJobLike(text) {
    const n = norm(text);
    if (n.length < 40) return false;
    const hits = P.vaga.reduce((t, re) => t + (n.match(new RegExp(re.source, 'g')) || []).length, 0);
    return hits >= 1 && (hits >= 2 || has(n, [/candidat|inscri|link|curriculo|salario|salary|r\$|us\$|usd|ganhe|earn|gana|remuneracao|beneficios|benefits|requisitos|requirements|whats ?app|telegram|interessad|apply/]));
  }
 
  // ------------------------------------------------------------------ indicadores
  // Cada indicador: id, título, severidade, fundamento, e função test(ctx) -> {evidence[], note} | null
  const INDICATORS = [
    { id: 'COBRANCA_TAXA', title: 'Cobrança para conseguir a vaga', severity: 'critico', basis: ['OIT_RECRUTAMENTO', 'OIT_C181', 'CP_207', 'OIT_OPERACIONAIS'],
      description: 'O anúncio pede pagamento do candidato (taxa, curso, visto, reserva da vaga). Pelas normas da OIT, quem procura emprego não deve pagar pelo recrutamento; cobranças assim também criam dívida.',
      test: (c) => { const e = findAll(c.text, P.taxa); return e.length ? { evidence: e } : null; } },
    { id: 'RETENCAO_DOCUMENTOS', title: 'Retenção de passaporte ou documentos', severity: 'critico', basis: ['CP_149', 'OIT_INDICADORES'],
      description: 'O texto indica que passaporte ou documentos ficarão com a empresa. Reter documentos é indicador de trabalho forçado (OIT) e está previsto no art. 149, §1º, II do Código Penal.',
      test: (c) => { const e = findAll(c.text, P.passaporte_retencao); return e.length ? { evidence: e } : null; } },
    { id: 'PASSAPORTE_ANTECIPADO', title: 'Pedido de passaporte antes de qualquer contrato', severity: 'medio', basis: ['OIT_OPERACIONAIS'],
      description: 'Pedir cópia do passaporte por mensagem antes de entrevista e contrato expõe dados e é etapa comum de recrutamento enganoso. Sozinho não prova nada.',
      test: (c) => { const e = findAll(c.text, P.passaporte_envio); return e.length && !c.hasContract ? { evidence: e } : null; } },
    { id: 'SERVIDAO_DIVIDA', title: 'Dívida com passagem, moradia ou comida', severity: 'critico', basis: ['CP_149', 'OIT_INDICADORES'],
      description: 'Custos de viagem, alojamento ou alimentação descontados do salário ou a devolver. A dívida que prende o trabalhador é indicador de trabalho forçado e de condição análoga à escravidão.',
      test: (c) => { const e = findAll(c.text, P.divida); return e.length ? { evidence: e } : null; } },
    { id: 'RESTRICAO_LIBERDADE', title: 'Restrição de saída ou de comunicação', severity: 'critico', basis: ['CP_149', 'OIT_INDICADORES'],
      description: 'O anúncio menciona impedir saída, recolher celular ou vigilância. Restrição de movimento e isolamento são indicadores de trabalho forçado.',
      test: (c) => { const e = findAll(c.text, P.restricao); return e.length ? { evidence: e } : null; } },
    { id: 'JORNADA_EXAUSTIVA', title: 'Jornada exaustiva', severity: 'alto', basis: ['CP_149', 'OIT_INDICADORES'],
      description: 'Jornadas de 12h ou mais por dia ou sem folga. Jornada exaustiva caracteriza condição análoga à escravidão (CP, art. 149).',
      test: (c) => { const e = findAll(c.text, P.jornada); return e.length ? { evidence: e } : null; } },
    { id: 'ALOJAMENTO_ISOLADO', title: 'Transporte para alojamento isolado (aliciamento)', severity: 'alto', basis: ['CP_207', 'CP_149', 'OIT_INDICADORES'],
      description: 'Oferta de levar o trabalhador para fazenda, obra, garimpo ou outro estado com alojamento no local. É o padrão de aliciamento mais comum nos resgates no Brasil; atenção redobrada se houver dívida ou falta de contrato.',
      test: (c) => { const e = findAll(c.text, P.alojamento_isolado); return e.length && (!c.hasContract || c.alertCount > 0) ? { evidence: e } : null; } },
    { id: 'PADRAO_SUDESTE_ASIATICO', title: 'Padrão de aliciamento para centros de golpes (Sudeste Asiático)', severity: 'alto', basis: ['ONU_SEA_2023', 'PF_SEA_2026', 'CP_149A', 'CP_206'],
      description: 'Combinação documentada pela ONU, Itamaraty e Polícia Federal: vaga de atendimento/digital/cripto no Sudeste Asiático, sem exigir experiência ou com salário alto, e contato por mensageiro; muitas vezes entrada com visto de turista e transferência por terra até a fronteira (Mae Sot/Myawaddy, Sihanoukville, Triângulo Dourado). O destino SOZINHO não gera alerta.',
      test: (c) => {
        if (!c.sea) return null;
        const extras = [];
        if (c.digitalWork) extras.push('trabalho de atendimento/digital');
        if (c.noExperience) extras.push('não exige experiência');
        if (c.highSalary) extras.push('salário muito acima do usual (' + c.salary.raw + ')');
        if (c.informalContact) extras.push('contato só por mensageiro');
        if (c.paidTrip) extras.push('viagem/hospedagem pagas pela empresa');
        if (c.touristVisa) extras.push('entrada com visto de TURISTA para trabalhar');
        if (c.borderTransfer) extras.push('transferência por terra para fronteira/outra cidade');
        if (c.typingTest) extras.push('seleção por teste de digitação');
        if (c.ageRange) extras.push('faixa etária jovem exigida');
        if (extras.length < 2) return null;
        const ev = findAll(c.text, [SEA].concat(P.visto_turista, P.transfer_fronteira)).slice(0, 2);
        return { evidence: ev.concat(['Combinação: ' + extras.join(' + ')]) };
      } },
    { id: 'SINAIS_EXPLORACAO_SEXUAL', title: 'Sinais associados a aliciamento para exploração sexual', severity: 'alto', basis: ['CP_149A', 'OIT_OPERACIONAIS'],
      description: 'Pedido de fotos de corpo/biquíni, ou vagas de "modelo/dançarina/acompanhante" no exterior voltadas a mulheres jovens.',
      test: (c) => { const e = findAll(c.text, P.sexual); return e.length && (c.abroad || has(c.text, [/fotos?[^.]{0,30}(corpo|biquini|lingerie)/])) ? { evidence: e } : null; } },
    { id: 'PRESSAO_URGENCIA', title: 'Pressão para aceitar sem verificar', severity: 'medio', basis: ['OIT_OPERACIONAIS', 'OIT_RECRUTAMENTO'],
      description: 'Urgência, "sem entrevista", "vagas limitadas" ou pedido de sigilo à família impedem que a pessoa verifique a oferta.',
      test: (c) => { const e = findAll(c.text, P.pressao); return e.length ? { evidence: e } : null; } },
    { id: 'SEM_CONDICOES_CONTRATUAIS', title: 'Trabalho no exterior sem contrato ou visto de trabalho mencionado', severity: 'medio', basis: ['LEI_7064', 'OIT_RECRUTAMENTO'],
      description: 'Vagas legítimas no exterior mencionam contrato escrito e visto de trabalho. A ausência não prova fraude, mas exige confirmação antes de viajar.',
      test: (c) => (c.abroad && !c.hasContract && !c.preliminary ? { evidence: ['O texto fala em trabalho no exterior e não menciona contrato nem visto de trabalho.'] } : null) },
    { id: 'PROMESSA_VAGA', title: 'Promessas vagas ou fora da realidade', severity: 'medio', basis: ['OIT_OPERACIONAIS'],
      description: 'Ganho alto e fácil sem descrição real da função. Salário alto SOZINHO não é alerta: só conta junto com falta de exigências ou promessas genéricas.',
      test: (c) => {
        const e = findAll(c.text, P.promessa);
        if (c.highSalary && c.noExperience) e.push('Salário de ' + c.salary.raw + ' (≈ R$ ' + c.salary.brl.toLocaleString('pt-BR') + '/mês) sem exigir experiência.');
        return e.length ? { evidence: e.slice(0, 3) } : null;
      } },
    { id: 'CONTATO_INFORMAL', title: 'Contato só por mensageiro, sem canal da empresa', severity: 'medio', basis: ['OIT_OPERACIONAIS'],
      description: 'A conversa é levada para WhatsApp/Telegram/privado e não há site ou e-mail corporativo para confirmar a empresa.',
      test: (c) => (c.informalContact && !c.corporateChannel ? { evidence: findAll(c.text, P.contato_informal) } : null) },
    // ---- indicadores que dependem de verificação externa (fatos vindos do servidor ou histórico local)
    { id: 'INFORMACOES_CONTRADITORIAS', title: 'Informações da empresa contraditórias', severity: 'alto', basis: ['OIT_OPERACIONAIS'],
      description: 'Dados do anúncio não batem entre si ou com registros públicos (país, telefone, e-mail, domínio, CNPJ).',
      test: (c) => (c.contradictions.length ? { evidence: c.contradictions } : null) },
    { id: 'DOMINIO_RECENTE', title: 'Site da empresa registrado há pouco tempo', severity: 'medio', basis: ['OIT_OPERACIONAIS'],
      description: 'O domínio do site foi registrado recentemente (consulta pública RDAP). Empresas novas existem; junto com outros sinais, pede verificação.',
      test: (c) => (c.facts.domain_age_days != null && c.facts.domain_age_days < 180 ? { evidence: ['Domínio ' + c.facts.domain + ' registrado há ' + c.facts.domain_age_days + ' dias (RDAP).'] } : null) },
    { id: 'ANUNCIO_REPLICADO', title: 'Mesmo anúncio publicado por empresas diferentes', severity: 'alto', basis: ['OIT_OPERACIONAIS'],
      description: 'Um texto praticamente igual já foi visto com outro nome de empresa ou outro contato — padrão de anúncios falsos reaproveitados.',
      test: (c) => {
        const ev = (c.facts.similar_jobs || []).filter((s) => s.similarity >= 0.6 && s.company && c.job.company && norm(s.company) !== norm(c.job.company))
          .map((s) => Math.round(s.similarity * 100) + '% igual a anúncio de "' + s.company + '" (' + (s.seen_at || '').slice(0, 10) + ')');
        const loc = (c.facts.local_history || []).filter((h) => h.kind === 'mesmo_contato_outra_empresa').map((h) => h.text);
        const all = ev.concat(loc);
        return all.length ? { evidence: all.slice(0, 3) } : null;
      } },
    { id: 'CADASTRO_EMPREGADORES', title: 'Nome consta no Cadastro de Empregadores (lista suja)', severity: 'alto', basis: ['MTE_CADASTRO', 'CP_149'],
      description: 'Um empregador com nome/documento correspondente foi incluído pelo MTE após autuação por trabalho análogo ao de escravo. Confira se é o mesmo empregador (homônimos existem).',
      test: (c) => ((c.facts.registry_matches || []).length ? { evidence: c.facts.registry_matches.map((r) => r.employer_name + (r.uf ? ' (' + r.uf + ')' : '') + ' — ' + r.source + (r.is_demo ? ' [DADO FICTÍCIO DE DEMONSTRAÇÃO]' : '')) } : null) }
  ];
  const WEIGHT = { critico: 4, alto: 3, medio: 2, info: 0 };
 
  /**
   * job: { title, company, description, location, salary, url, source, preliminary? }
   * facts (opcional, do servidor/histórico): {
   *   domain, domain_age_days, domain_checked, company_record:{name, verification_status, country, is_demo, source},
   *   cnpj:{situacao, abertura, razao_social}|null, cnpj_checked, registry_matches:[], similar_jobs:[],
   *   approved_reports:n, local_history:[{kind,text}], gleif_match }
   */
  function analyze(job, facts) {
    job = job || {}; facts = facts || {};
    const text = [job.title, job.company, job.location, job.salary, job.description].filter(Boolean).join('\n');
    const n = norm(text);
    const preliminary = !!job.preliminary || (norm(job.description).length < 120);
    const lang = detectLang(text);
    const contacts = extractContacts(text);
    const salary = parseSalaryBRL([job.salary, job.description, job.title].filter(Boolean).join(' '));
    const c = {
      job, text, facts, preliminary, salary,
      sea: SEA.test(n),
      abroad: (EXTERIOR.test(n) || SEA.test(n)) && !/(trabalho remoto|home ?office)/.test(n),
      digitalWork: has(n, P.trabalho_digital),
      noExperience: has(n, P.sem_experiencia),
      highSalary: !!salary && salary.brl >= 9000,
      informalContact: has(n, P.contato_informal),
      corporateChannel: contacts.emails.some((e) => !FREE_MAIL.test(e)) || !!(facts.company_record && facts.company_record.domain),
      hasContract: has(n, P.contrato),
      paidTrip: has(n, [/(passagem|viagem|voo|hospedagem)[^.]{0,30}(paga|gratis|por conta da empresa|inclus\w+)/]) || P.gratis_tudo.some((re) => re.test(n)),
      touristVisa: has(n, P.visto_turista),
      borderTransfer: has(n, P.transfer_fronteira),
      typingTest: has(n, P.teste_digitacao),
      ageRange: P.faixa_etaria.some((re) => re.test(n)),
      contradictions: [],
      alertCount: 0
    };
 
    // --- contradições verificáveis
    const claimed = Object.keys(COUNTRY_WORDS).filter((k) => COUNTRY_WORDS[k].test(norm([job.location, job.title, job.description].join(' '))));
    const phoneC = phoneCountries(text);
    const foreignPhones = phoneC.filter((p) => p !== 'Brasil' && claimed.length && !claimed.includes(p));
    if (foreignPhones.length) c.contradictions.push('Vaga diz ' + claimed.join('/') + ', mas o telefone de contato é de ' + foreignPhones.join('/') + '.');
    const freeMails = contacts.emails.filter((e) => FREE_MAIL.test(e));
    if (freeMails.length && job.company && /(ltda|s\.?a\.?|inc|corp|group|grupo|international|internacional|company|limited|co\.)/i.test(job.company)) c.contradictions.push('Empresa "' + job.company + '" usa e-mail pessoal gratuito (' + freeMails[0] + ').');
    if (facts.cnpj && facts.cnpj.situacao && !/ativa/i.test(facts.cnpj.situacao)) c.contradictions.push('CNPJ informado está com situação "' + facts.cnpj.situacao + '" na Receita Federal.');
    if (facts.cnpj && facts.cnpj.razao_social && job.company && similarity(facts.cnpj.razao_social + ' x y', job.company + ' x y') === 0 && !norm(facts.cnpj.razao_social).includes(norm(job.company).split(' ')[0])) c.contradictions.push('CNPJ do anúncio pertence a "' + facts.cnpj.razao_social + '", não a "' + job.company + '".');
    if (facts.company_record && facts.company_record.verification_status === 'inconsistente') c.contradictions.push('Empresa marcada como inconsistente na base ELO (' + facts.company_record.source + ').');
 
    // --- dispara indicadores (duas passadas: alguns dependem da contagem)
    const alerts = [];
    for (const pass of [1, 2]) {
      for (const ind of INDICATORS) {
        if (alerts.find((a) => a.id === ind.id)) continue;
        if (pass === 1 && ind.id === 'ALOJAMENTO_ISOLADO') continue;
        const r = ind.test(c);
        if (r && r.evidence && r.evidence.length) {
          alerts.push({ id: ind.id, title: ind.title, severity: ind.severity, description: ind.description, evidence: r.evidence, basis: ind.basis });
          c.alertCount = alerts.length;
        }
      }
    }
 
    // --- informações verificadas
    const verified = [];
    if (facts.company_record) verified.push({ item: 'Empresa na base ELO', value: facts.company_record.name + ' — ' + labelStatus(facts.company_record.verification_status) + (facts.company_record.is_demo ? ' [fictícia, demonstração]' : ''), source: facts.company_record.source });
    if (facts.domain_age_days != null) verified.push({ item: 'Idade do domínio', value: facts.domain + ': ' + facts.domain_age_days + ' dias', source: 'RDAP (registro público de domínios)' });
    if (facts.cnpj) verified.push({ item: 'CNPJ', value: (facts.cnpj.razao_social || '') + ' — ' + (facts.cnpj.situacao || '?') + (facts.cnpj.abertura ? ', aberto em ' + facts.cnpj.abertura : ''), source: 'Receita Federal via BrasilAPI' });
    if (facts.registry_checked) verified.push({ item: 'Cadastro de Empregadores (lista suja)', value: (facts.registry_matches || []).length ? 'Nome correspondente encontrado' : 'Nenhum nome correspondente', source: 'Tabela employer_registry' });
    if (facts.gleif_match) verified.push({ item: 'Registro internacional (LEI)', value: facts.gleif_match, source: 'GLEIF' });
    if (facts.approved_reports) verified.push({ item: 'Relatos moderados', value: facts.approved_reports + ' relato(s) aprovado(s) pela moderação — relatos não alteram o nível de risco sozinhos', source: 'ELO' });
    if (salary) verified.push({ item: 'Salário identificado', value: salary.raw + (salary.currency !== 'BRL' ? ' (≈ R$ ' + salary.brl.toLocaleString('pt-BR') + '/mês, câmbio de referência)' : ''), source: 'Texto do anúncio' });
 
    // --- informações insuficientes
    const insufficient = [];
    if (!job.company) insufficient.push('Nome da empresa não aparece no anúncio.');
    else if (!facts.company_record && !facts.cnpj && !facts.gleif_match) insufficient.push('Não encontramos registro público que confirme a empresa "' + job.company + '".');
    if (!salary) insufficient.push('Salário não informado.');
    if (!c.hasContract) insufficient.push('Tipo de contrato não informado.');
    if (!job.location && !claimed.length) insufficient.push('Local de trabalho não informado.');
    if (facts.domain && facts.domain_age_days == null && facts.domain_checked) insufficient.push('Não foi possível consultar a idade do domínio ' + facts.domain + '.');
    if (preliminary) insufficient.push('Análise preliminar: só título/resumo disponíveis. Abra o anúncio completo para análise detalhada.');
    if (c.abroad) insufficient.push('Confirme a empresa e o visto com o consulado/embaixada do Brasil no país antes de viajar.');
 
    // --- nível
    const score = alerts.reduce((s, a) => s + WEIGHT[a.severity], 0);
    const critical = alerts.filter((a) => a.severity === 'critico').length;
    let level;
    if (!alerts.length) level = insufficient.length >= 3 ? 'dados_insuficientes' : 'sem_alertas';
    else if ((critical >= 1 && alerts.length >= 2) || score >= 7) level = 'alto_risco';
    else level = 'atencao';
 
    const justification = buildJustification(level, alerts, preliminary);
    if (lang !== 'pt') verified.push({ item: 'Idioma do anúncio', value: LANG_NAME[lang] + ' — analisado também com as regras em ' + LANG_NAME[lang], source: 'Detecção automática' });
    const theme = jobTheme(text);
    const profile_notes = profileNotes(facts.profile, c, theme);
    // relatos da comunidade: anúncios parecidos ou com o mesmo contato já reportados (nota; relatos sozinhos não mudam o nível)
    const community_notes = (facts.reported_similar || []).map((r) => {
      const how = r.shared && r.shared.length ? 'usa o mesmo contato (' + r.shared.map((k) => k.replace(/^(tel|mail|tg):/, '')).slice(0, 2).join(', ') + ')' : 'tem texto ' + Math.round(r.similarity * 100) + '% parecido';
      return 'Este anúncio ' + how + ' de um anúncio reportado por usuários em ' + String(r.seen_at || '').slice(0, 10) + (r.title ? ' ("' + String(r.title).slice(0, 80) + '")' : '') + (r.status === 'aprovado' ? ' — relato confirmado pela moderação.' : ' — relato ainda não moderado.');
    });
    for (const cn of community_notes) verified.push({ item: 'Relatos de usuários (base ELO)', value: cn, source: 'API ELO — relatos' });
    for (const pn of profile_notes) verified.push({ item: 'Seu perfil', value: pn, source: 'Painel ELO (só neste navegador)' });
    return { level, preliminary, theme, profile_notes, community_notes, regions: jobRegions(n), lang, lang_name: LANG_NAME[lang], abroad: c.abroad, score, indicators: alerts, verified, insufficient, justification, rules_version: RULES_VERSION, content_hash: contentHash(text), salary };
  }
 
  // ------------------------------------------------------------------ perfil (área de interesse e região)
  // profile: { areas: ['atendimento','ti',...], origem_uf: 'SP', regioes: ['sudeste_asiatico','europa',...] }
  // Gera NOTAS (nunca alertas): o perfil não muda o nível de risco.
  const REGION_RE = {
    brasil: /brasil|\b[a-z ]+\/(sp|rj|mg|pr|sc|rs|ba|pe|ce|go|df|mt|ms|pa|am|to|es|pb|rn|al|se|pi|ma|ro|ac|ap|rr)\b/,
    america_do_sul: /argentina|chile|paraguai|uruguai|bolivia|peru|colombia|venezuela|guiana|suriname/,
    europa: /europa|portugal|espanha|italia|franca|alemanha|irlanda|reino unido|inglaterra|suica|holanda|belgica|lisboa|madri|girona/,
    america_do_norte: /eua|estados unidos|usa\b|canada|mexico/,
    oriente_medio: /dubai|emirados|catar|qatar|arabia|israel|kuwait|oma\b|bahrein/,
    sudeste_asiatico: SEA,
    asia_leste: /japao|japan|china|coreia|korea|taiwan/
  };
  const REGION_NAME = { brasil: 'Brasil', america_do_sul: 'América do Sul', europa: 'Europa', america_do_norte: 'América do Norte', oriente_medio: 'Oriente Médio', sudeste_asiatico: 'Sudeste Asiático', asia_leste: 'Ásia (Japão, China, Coreia)' };
  const AREA_NAME = { atendimento: 'atendimento/call center', ti: 'TI/tecnologia', marketing_digital: 'marketing digital', agro: 'agro/trabalho rural', construcao: 'construção', hotelaria: 'hotelaria/restaurante', domestico: 'doméstico/cuidador', beleza_entretenimento: 'beleza/entretenimento', outra: 'outra' };
  function jobRegions(n) { return Object.keys(REGION_RE).filter((k) => REGION_RE[k].test(n)); }
  function profileNotes(profile, c, theme) {
    if (!profile || typeof profile !== 'object') return [];
    const areas = Array.isArray(profile.areas) ? profile.areas : [];
    const regioes = Array.isArray(profile.regioes) ? profile.regioes : [];
    const n = norm(c.text), notes = [];
    const here = jobRegions(n).filter((r) => regioes.includes(r));
    if (here.length) notes.push('Esta vaga é numa região que você marcou como interesse (' + here.map((r) => REGION_NAME[r]).join(', ') + ').');
    const digitalArea = areas.some((a) => ['atendimento', 'ti', 'marketing_digital'].includes(a));
    if (c.sea && digitalArea) notes.push('Atenção: pessoas jovens da área de ' + areas.filter((a) => ['atendimento', 'ti', 'marketing_digital'].includes(a)).map((a) => AREA_NAME[a]).join('/') + ' são o perfil MAIS procurado por aliciadores de centros de golpes no Sudeste Asiático (Itamaraty, ONU). Confirme a empresa com a embaixada antes de qualquer passo.');
    else if (regioes.includes('sudeste_asiatico') && digitalArea && c.abroad && !c.sea) notes.push('Você marcou interesse no Sudeste Asiático: desconfie de vagas de atendimento/TI com salário em dólar e viagem paga.');
    if (c.abroad && profile.origem_uf) notes.push('Antes de viajar, procure o Posto Avançado / Núcleo de Enfrentamento ao Tráfico de Pessoas do seu estado (' + String(profile.origem_uf).slice(0, 2).toUpperCase() + ').');
    return notes.slice(0, 3);
  }

  function labelStatus(s) { return { verificada: 'verificada', nao_verificada: 'não verificada', inconsistente: 'inconsistente', demonstracao: 'demonstração' }[s] || s; }
 
  function buildJustification(level, alerts, preliminary) {
    const pre = preliminary ? 'Análise preliminar. ' : '';
    if (level === 'sem_alertas') return pre + 'Não encontramos sinais de risco nas informações disponíveis. Isso não garante que a vaga seja segura: confirme sempre a empresa e o contrato.';
    if (level === 'dados_insuficientes') return pre + 'Não encontramos sinais de risco, mas faltam informações básicas para avaliar a vaga. Peça os dados que faltam antes de enviar documentos ou dinheiro.';
    const names = alerts.slice(0, 3).map((a) => a.title.toLowerCase()).join('; ') + (alerts.length > 3 ? ' e mais ' + (alerts.length - 3) : '');
    const base = pre + 'Encontramos ' + alerts.length + ' sinal(is) que a OIT e a lei brasileira associam a recrutamento enganoso: ' + names + '. Isso NÃO prova crime nem acusa a empresa; indica que a oferta precisa ser verificada antes de qualquer passo.';
    return level === 'alto_risco' ? base + ' Mesmo que você aceite a proposta, o consentimento obtido por engano não vale (Protocolo de Palermo): não envie documentos nem dinheiro e procure orientação.' : base;
  }
 
  // tema da vaga (ocupações) e cidade — usados para buscar vagas reais do mesmo tema
  const OCC = ['merendeira', 'auxiliar de limpeza', 'auxiliar de sala', 'porteiro', 'vendedor', 'vendedora', 'atendente', 'recepcionista', 'motorista', 'cozinheiro', 'cozinheira', 'auxiliar de cozinha', 'garcom', 'garconete', 'auxiliar administrativo', 'assistente administrativo', 'operador de caixa', 'repositor', 'estoquista', 'auxiliar de producao', 'operador de telemarketing', 'baba', 'cuidador', 'cuidadora de idosos', 'pedreiro', 'servente', 'eletricista', 'soldador', 'tecnico de enfermagem', 'enfermeiro', 'professor', 'camareira', 'faxineira', 'diarista', 'jardineiro', 'vigilante', 'seguranca', 'entregador', 'montador', 'auxiliar de logistica', 'conferente', 'empacotador', 'jovem aprendiz', 'estagio', 'operador de maquinas', 'trabalhador rural', 'safrista', 'atendimento ao cliente', 'customer service', 'suporte', 'marketing digital', 'recepcionista de hotel', 'modelo', 'operador de colheita', 'camarero'];
  const CITIES = ['sao paulo', 'rio de janeiro', 'brasilia', 'belo horizonte', 'salvador', 'fortaleza', 'recife', 'curitiba', 'porto alegre', 'manaus', 'belem', 'goiania', 'campinas', 'guarulhos', 'sao luis', 'natal', 'joao pessoa', 'maceio', 'teresina', 'florianopolis', 'vitoria', 'cuiaba', 'campo grande', 'rio verde', 'bangkok', 'dubai', 'lisboa', 'porto', 'madri', 'girona'];
  function jobTheme(text) {
    const n = norm(text);
    const occ = OCC.filter((o) => new RegExp('\\b' + o + '\\b').test(n)).slice(0, 3);
    const city = CITIES.find((c) => new RegExp('\\b' + c + '\\b').test(n)) || null;
    return { occupations: occ, city };
  }
 
  // sugestão de vagas parecidas: pontua oportunidades por categoria/palavras
  const AREA_CATS = { atendimento: ['atendimento'], ti: ['atendimento', 'tecnologia'], marketing_digital: ['atendimento', 'marketing'], agro: ['agro'], construcao: ['construcao', 'logistica'], hotelaria: ['hotelaria'], domestico: ['domestico'], beleza_entretenimento: [], outra: [] };
  function rankAlternatives(job, opportunities, limit, profile) {
    const jt = norm([job.title, job.description].join(' '));
    const cats = [].concat(...((profile && Array.isArray(profile.areas) ? profile.areas : []).map((a) => AREA_CATS[a] || [])));
    return (opportunities || []).map((o) => {
      const words = norm([o.title, o.category, o.requirements].join(' ')).split(/\W+/).filter((w) => w.length > 3);
      let s = 0; for (const w of new Set(words)) if (jt.includes(w)) s++;
      if (o.category && jt.includes(norm(o.category))) s += 2;
      if (o.category && cats.includes(o.category)) s += 2;
      return { o, s };
    }).filter((x) => x.o.kind === 'emprego' && x.s > 0).sort((a, b) => b.s - a.s).slice(0, limit || 3).map((x) => x.o);
  }
 
  const api = { jobTheme, profileNotes, jobRegions, REGION_NAME, AREA_NAME, detectLang, LANG_NAME, RULES_VERSION, LEGAL, INDICATORS, analyze, isJobLike, similarity, contentHash, parseSalaryBRL, extractCNPJ, extractContacts, domainOf, rankAlternatives, norm };
  root.ELORules = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);