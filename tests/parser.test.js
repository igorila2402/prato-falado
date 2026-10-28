"use strict";
/* Testes do interpretador do ditado. Rodar: node tests/parser.test.js */
const path = require('path');
const P = require(path.join(__dirname, '..', 'parser.js'));
const TACO = require(path.join(__dirname, '..', 'taco.json'));
P.init(TACO);
P.setContext({products:{}, aliases:{}, mealNames:['Café da manhã','Almoço','Lanche','Jantar','Ceia']});

let pass = 0, fail = 0;
function ok(cond, msg){ if(cond) pass++; else { fail++; console.log('  FALHOU: ' + msg); } }
const kcal = it => it.v[0] * it.g / 100;

/* Cada caso: frase, refeição esperada, itens esperados [trecho do nome, gramas, tolerância?], faltando. */
function t(phrase, meal, items, missing = []){
  const r = P.parse(phrase);
  const label = JSON.stringify(phrase);
  const got = r.items.map(i => `${i.n} ${i.g}g`).join(' | ');
  const before = fail;
  ok(r.meal === meal, `${label}: refeição ${r.meal} (esperado ${meal})`);
  ok(r.items.length === items.length, `${label}: ${r.items.length} itens (esperado ${items.length}) → ${got}`);
  items.forEach(([name, g, tol], k) => {
    const it = r.items[k]; if(!it) return;
    ok(it.n.includes(name), `${label}: item ${k} "${it.n}" deveria conter "${name}"`);
    if(g != null) ok(Math.abs(it.g - g) <= (tol ?? Math.max(2, g * 0.05)), `${label}: item ${k} ${it.g} g (esperado ~${g})`);
    ok(kcal(it) > 0 || /Água|Sal|Café|Chá|zero/.test(it.n), `${label}: item ${k} com 0 kcal (${it.n})`);
    ok(['taco','est','prod'].includes(it.src) && /^[TP]/.test(it.ref) && typeof it.t === 'string' && typeof it.est === 'boolean', `${label}: formato do item ${k}`);
  });
  ok(JSON.stringify(r.missing) === JSON.stringify(missing), `${label}: faltando ${JSON.stringify(r.missing)} (esperado ${JSON.stringify(missing)})`);
  if(fail > before) console.log('  → obtido: ' + got);
}

const ARROZ = 'Arroz, tipo 1, cozido', PAT = 'patinho, sem gordura, grelhado', FRANGO = 'Frango, peito, sem pele, grelhado', FEIJAO = 'Feijão, carioca, cozido';
const ALF = 'Alface, crespa', TOM = 'Tomate, com semente', LEITE = 'Leite, de vaca, integral (média)';

console.log('Frases do ditado');
// exemplo do usuário
t('Refeição 1, 200 gramas de arroz, 200 gramas de carne, 100 gramas de salada', 0, [[ARROZ,200],[PAT,200],[ALF,50],[TOM,50]]);
// ditado do iPhone sem pontuação
t('almoço 200 gramas de arroz 150 gramas de frango e uma concha de feijão', 1, [[ARROZ,200],[FRANGO,150],[FEIJAO,140]]);
t('Refeição número 2 arroz feijão e bife', 1, [[ARROZ,150],[FEIJAO,140],[PAT,100]]);
t('refeição 3: 2 ovos e um pão', 2, [['Ovo, de galinha, inteiro, cozido',100],['Pão, trigo, francês',50]]);
t('primeira refeição café com leite e pão com manteiga', 0, [['Café',125],[LEITE,125],['Pão, trigo, francês',50],['Manteiga',10]]);
t('café da manhã: pão com ovo e café', 0, [['Pão, trigo, francês',50],['Ovo, de galinha, inteiro, frito',50],['Café',50]]);
t('meio copo de leite', null, [[LEITE,100]]);
t('3 colheres de arroz', null, [[ARROZ,75]]);
t('3 colheres de sopa de arroz e 2 conchas de feijão', null, [[ARROZ,75],[FEIJAO,280]]);
t('arroz e feijão', null, [[ARROZ,150],[FEIJAO,140]]);
t('200 g de arroz e 100 de feijão', null, [[ARROZ,200],[FEIJAO,100]]);
t('200g de arroz, 150g de frango grelhado', null, [[ARROZ,200],[FRANGO,150]]);
t('duzentos e cinquenta gramas de macaxeira', null, [['Mandioca, cozida',250]]);
t('trezentos e cinquenta ml de suco de laranja', null, [['Laranja, pêra, suco',350]]);
t('mil e quinhentos ml de água', null, [['Água',1500]]);
t('1,5 kg de melancia', null, [['Melancia',1500]]);
t('300 ml de leite desnatado', null, [['Leite, de vaca, desnatado (média)',300]]);
t('uma e meia concha de feijão', null, [[FEIJAO,210]]);
t('comi duas bananas e uma maçã no lanche', 2, [['Banana, prata',140],['Maçã',130]]);
t('No jantar eu comi um prato de macarrão com carne moída', 3, [['Macarrão, trigo, cozido',300],['acém, moído',100]]);
t('janta: sopa de legumes', 3, [['Sopa de legumes',300]]);
t('dois pratos fundos de sopa', null, [['Sopa de legumes',800]]);
t('ceia um iogurte natural', 4, [['Iogurte, natural',170]]);
t('café da manhã tapioca com ovo e café preto', 0, [['Tapioca',80],['Ovo, de galinha',50],['Café, infusão',50]]);
t('tomei uma lata de coca', null, [['Refrigerante, tipo cola',350]]);
t('uma lata de cerveja e duas fatias de pizza', null, [['Cerveja',350],['Pizza',220]]);
t('dois pães de queijo e um cafezinho', null, [['Pão, de queijo',60],['Café',50]]);
t('uma cuia de açaí com farinha', null, [['Açaí',400],['Farinha, de mandioca',30]]);
t('baião de dois e um pedaço de carne de sol', null, [['Baião de dois',200],['Carne, bovina, seca',100]]);
t('uma fatia de cuscuz com ovo frito', null, [['Cuscuz, de milho',100],['Ovo, de galinha, inteiro, frito',50]]);
t('macaxeira frita 150 gramas', null, [['Mandioca, frita',150]]);
t('uma escumadeira de arroz duas colheres de farofa e um filé de frango', null, [[ARROZ,90],['farofa',30],[FRANGO,120]]);
t('salada', null, [[ALF,40],[TOM,40]]);
t('arroz feijão salada e frango', null, [[ARROZ,150],[FEIJAO,140],[ALF,40],[TOM,40],[FRANGO,120]]);
t('um copo grande de suco de caju', null, [['Caju, suco',375]]);
t('uma xícara de café com leite', null, [['Café',120],[LEITE,120]]);
t('um pão francês com manteiga', null, [['Pão, trigo, francês',50],['Manteiga',10]]);
t('aroz e fejão', null, [[ARROZ,150],[FEIJAO,140]]);
t('batata doce 200 g e frango 150 g', null, [['Batata, doce, cozida',200],[FRANGO,150]]);
t('arroz 200 frango 150', null, [[ARROZ,200],[FRANGO,150]]);
t('um x salada e um refrigerante', null, [['hambúrguer (média)',51],['Hambúrguer, bovino',77],['mozarela',17],[ALF,12],[TOM,13],['Refrigerante, tipo cola',350]]);
t('uma coxinha e um suco de maracujá', null, [['Coxinha',80],['Maracujá, suco',250]]);
t('comi um bife acebolado', null, [[PAT,100]]);
t('2 fatias de queijo e 2 fatias de presunto', null, [['Queijo, minas',40],['Presunto',30]]);
t('uma colher de sopa de azeite', null, [['Azeite',10]]);
t('um scoop de whey com 200 ml de leite', null, [['Whey',30],[LEITE,200]]);
t('almocei feijoada', 1, [['Feijoada',300]]);
t('lanche da tarde uma vitamina de banana', 2, [[LEITE,188],['Banana, prata',62]]);
t('tacacá', null, [['Tacacá',400]]);
t('100 gramas de estrogonofe de frango e 100 gramas de purê', null, [['Estrogonofe de frango',100],['Purê de batata',100]]);
t('comi xpto e arroz', null, [[ARROZ,150]], ['xpto']);
t('200 gramas de abacaxi e 50 g de zzzqwk', null, [['Abacaxi, cru',200]], ['zzzqwk']);
t('Refeição 2. 120g de tilápia; 1 batata cozida\n1 colher de azeite', 1, [['Tilápia',120],['Batata, inglesa, cozida',130],['Azeite',10]]);
t('um copo de leite com achocolatado', null, [['achocolatado',250]]);
t('meia banana', null, [['Banana, prata',35]]);
t('uma banana grande', null, [['Banana, prata',90]]); // antes 70×1,5=105; agora banana prata G (UNIT_SIZES)

console.log('Tamanhos por unidade (P/M/G)');
{ const U = P.unitSizes;
  // u = {k, c, s}; g = c × unitGrams(k, s); est sempre true
  function tu(phrase, name, k, c, s){
    const r = P.parse(phrase), it = r.items[0], label = JSON.stringify(phrase);
    ok(r.items.length >= 1 && it.n.includes(name), `${label}: alimento ${it && it.n} (esperado ${name})`);
    if(!it) return;
    ok(it.u && it.u.k === k && it.u.c === c && it.u.s === s, `${label}: u ${JSON.stringify(it.u)} (esperado ${JSON.stringify({k, c, s})})`);
    if(it.u) ok(it.g === Math.max(1, Math.round(c * P.unitGrams(k, s))), `${label}: g ${it.g} = c × unitGrams`);
    ok(it.est === true, `${label}: est true`);
  }
  tu('2 ovos', 'Ovo, de galinha, inteiro, cozido', 'ovo', 2, 'm');
  tu('uma maçã', 'Maçã', 'maca', 1, 'm');
  tu('meia banana', 'Banana, prata', 'banana_prata', .5, 'm');
  tu('1 unidade de ovo', 'Ovo, de galinha', 'ovo', 1, 'm');
  tu('uma unidade grande de banana', 'Banana, prata', 'banana_prata', 1, 'g');
  tu('2 ovos grandes', 'Ovo, de galinha', 'ovo', 2, 'g');
  tu('banana pequena', 'Banana, prata', 'banana_prata', 1, 'p');
  tu('1 banana média', 'Banana, prata', 'banana_prata', 1, 'm');
  tu('duas laranjas grandes', 'Laranja, pêra', 'laranja', 2, 'g');
  tu('banana', 'Banana, prata', 'banana_prata', 1, 'm');
  tu('um ovo tamanho grande', 'Ovo, de galinha', 'ovo', 1, 'g');
  tu('2 ovos gde', 'Ovo, de galinha', 'ovo', 2, 'g');
  tu('banana peq', 'Banana, prata', 'banana_prata', 1, 'p');
  tu('uma banana grandona', 'Banana, prata', 'banana_prata', 1, 'g');
  tu('uma banana da terra grande', 'Banana, da terra', 'banana_terra', 1, 'g');
  tu('duas bananas nanicas pequenas', 'Banana, nanica', 'banana_nanica', 2, 'p');
  tu('uma laranja e meia', 'Laranja', 'laranja', 1.5, 'm');
  tu('3 ovos de codorna', 'Ovo, de codorna', 'ovo_codorna', 3, 'm');
  tu('ovo frito', 'Ovo, de galinha, inteiro, frito', 'ovo_frito', 1, 'm');
  tu('1 fatia de pão de forma', 'Pão, trigo, forma', 'pao_forma', 1, 'm');
  tu('2 fatias de bolo', 'Bolo', 'bolo', 2, 'm');
  tu('uma fatia grande de pizza', 'Pizza', 'pizza', 1, 'g');
  tu('fatia fina de pizza', 'Pizza', 'pizza', 1, 'p');
  tu('1 fatia de cuscuz', 'Cuscuz, de milho', 'cuscuz', 1, 'm');
  tu('pão de forma', 'Pão, trigo, forma', 'pao_forma', 2, 'm');
  tu('duas espigas de milho', 'Milho verde, cozido', 'milho_espiga', 2, 'm');
  tu('um pote de iogurte', 'Iogurte', 'iogurte', 1, 'm');
  tu('um bife grande', 'patinho', 'bife', 1, 'g');
  tu('um filé de frango', 'Frango, peito', 'file_frango', 1, 'm');
  tu('uma coxinha pequena', 'Coxinha', 'coxinha', 1, 'p');
  tu('2 pães de queijo pequenos', 'Pão, de queijo', 'pao_queijo', 2, 'p');
  tu('uma ponkan', 'Tangerina, Poncã', 'tangerina', 1, 'm');
  tu('3 pupunhas grandes', 'Pupunha', 'pupunha', 3, 'g');
  tu('um coco verde', 'Coco, água de', 'coco_verde', 1, 'm');
  tu('meio abacate', 'Abacate', 'abacate', .5, 'm');
  tu('uma esfiha', 'Esfiha', 'esfiha', 1, 'm');
  tu('um picolé', 'Picolé', 'picole', 1, 'm');
  { const r = P.parse('comi uma maçã e um ovo');
    ok(r.items.length === 2 && r.items[0].u.k === 'maca' && r.items[1].u.k === 'ovo' && r.items[0].g === 130 && r.items[1].g === 50, 'maçã e ovo sem quantidade explícita → 1 unidade média cada'); }
  { const r = P.parse('uma esfiha e uma coxinha pequena');
    ok(r.items.length === 2 && r.items[0].u.s === 'm' && r.items[1].u.s === 'p', 'tamanho fica no próprio item'); }
  // gramas explícitos e medidas não unitárias: sem u
  { const it = P.parse('100 g de banana').items[0]; ok(it && it.g === 100 && !it.u && it.est === false, '100 g de banana → sem u, est false'); }
  { const it = P.parse('banana 150 gramas').items[0]; ok(it && it.g === 150 && !it.u && it.est === false, 'banana 150 gramas → sem u'); }
  { const it = P.parse('200 de banana').items[0]; ok(it && it.g === 200 && !it.u, '200 de banana → gramas, sem u'); }
  { const it = P.parse('um pouco de banana').items[0]; ok(it && !it.u, '"um pouco" não vira unidade'); }
  { const it = P.parse('um copo grande de suco de laranja').items[0]; ok(it && !it.u && it.g === 375, 'copo grande continua multiplicador genérico'); }
  { const it = P.parse('uma colher cheia de arroz').items[0]; ok(it && !it.u && it.g === 33, 'colher cheia continua multiplicador'); }
  { const it = P.parse('um gomo de laranja').items[0]; ok(it && !it.u && it.g === 10, 'gomo de laranja não é unidade'); }
  { const it = P.parse('frango').items[0]; ok(it && !it.u && it.g === 120, '"frango" sozinho não vira filé contado'); }
  { const it = P.parse('chocolate').items[0]; ok(it && !it.u, '"chocolate" sozinho não vira barra'); }
  { const it = P.parse('água de coco').items[0]; ok(it && !it.u && it.g === 300, '"água de coco" é bebida, não coco verde'); }
  { const r = P.parse('salada'); ok(r.items.every(i => !i.u), 'combos não recebem u'); }
  // API
  ok(typeof P.unitInfo === 'function' && typeof P.unitGrams === 'function' && U && typeof U === 'object', 'API de unidades exposta');
  ok(Object.isFrozen(U) && Object.isFrozen(U.ovo), 'unitSizes somente leitura');
  ok(Object.keys(U).length >= 60, `UNIT_SIZES tem ${Object.keys(U).length} chaves (>= 60)`);
  const ref = n => P._internal.foodByName(n).ref;
  { const u = P.unitInfo(ref('Ovo, de galinha, inteiro, cozido/10minutos')); ok(u && u.k === 'ovo' && u.label === 'unidade' && u.p === 40 && u.m === 50 && u.g === 60, 'unitInfo ovo'); }
  { const u = P.unitInfo(ref('Banana, da terra, crua')); ok(u && u.k === 'banana_terra' && u.m > U.banana_prata.m, 'unitInfo banana da terra maior que prata'); }
  { const u = P.unitInfo(ref('Pão, trigo, forma, integral')); ok(u && u.k === 'pao_forma' && u.label === 'fatia', 'unitInfo pão de forma → fatia'); }
  { const u = P.unitInfo(ref('Pizza de mussarela (média)')); ok(u && u.label === 'fatia' && u.m === 110, 'unitInfo pizza'); }
  { const u = P.unitInfo(ref('Frango, peito, sem pele, grelhado')); ok(u && u.k === 'file_frango' && u.label === 'filé', 'unitInfo peito de frango → filé'); }
  { const u = P.unitInfo(ref('Iogurte, natural')); ok(u && u.label === 'pote', 'unitInfo iogurte → pote'); }
  { const u = P.unitInfo(ref('Chocolate, ao leite')); ok(u && u.k === 'chocolate_barra', 'unitInfo chocolate → barra (bombom só pelo nome dito)'); }
  ok(P.unitInfo(ref('Arroz, tipo 1, cozido')) === null, 'unitInfo arroz → null');
  ok(P.unitInfo(ref('Coco, água de')) === null, 'unitInfo água de coco → null (coco verde só pelo nome dito)');
  ok(P.unitInfo('P123') === null && P.unitInfo('X1') === null && P.unitInfo(null) === null, 'unitInfo produto/inválido → null');
  ok(P.unitGrams('ovo', 'g') === 60 && P.unitGrams('ovo') === 50 && P.unitGrams('ovo', 'p') === 40, 'unitGrams ovo');
  ok(P.unitGrams('xyz', 'm') === null && P.unitGrams('ovo', 'x') === null, 'unitGrams inválido → null');
  // auditoria da tabela
  const names = new Set(TACO.map(r => r[0]).concat(P._internal.EXTRAS.map(r => r[0])));
  for(const [k, e] of Object.entries(U)){
    ok(typeof e.label === 'string' && e.label === e.label.toLowerCase() && !/s$/.test(e.label), `UNIT_SIZES.${k} label singular "${e.label}"`);
    ok(e.p > 0 && e.p < e.m && e.m < e.g, `UNIT_SIZES.${k} p<m<g (${e.p}/${e.m}/${e.g})`);
    ok(Array.isArray(e.match) && e.match.length > 0, `UNIT_SIZES.${k} tem match`);
    for(const n of e.match){ ok(names.has(n), `UNIT_SIZES.${k} → "${n}" existe na TACO/EXTRAS`); const f = P._internal.foodByName(n); ok(f && f.v[0] > 0, `UNIT_SIZES.${k} → "${n}" tem kcal`); }
  }
}

console.log('Refeição com nomes personalizados');
P.setContext({mealNames:['Pré-treino','Pós-treino','Almoço','Jantar']});
t('pós treino 40 gramas de whey', 1, [['Whey',40]]);
t('almoço arroz e frango', 2, [[ARROZ,150],[FRANGO,120]]);
t('refeição 4 sopa de legumes', 3, [['Sopa de legumes',300]]);
t('pré-treino uma banana com aveia', 0, [['Banana, prata',70],['Aveia',30]]);
P.setContext({mealNames:['Café da manhã','Almoço','Lanche','Jantar','Ceia']});

console.log('Dicionário pessoal e produtos');
P.setContext({products:{'7891000100103':{n:'Iogurte Grego Nestlé',v:[120,6,14,4.5,0,60,150,0,0,200,15,0.5],porcao:100}},
  aliases:{'marmita da mae':{ref:'T2',n:'Arroz, tipo 1, cozido'}, 'iogurte grego':{ref:'P7891000100103',n:'Iogurte Grego Nestlé'}}});
t('marmita da mãe', null, [[ARROZ,150]]);
t('2 iogurtes gregos', null, [['Iogurte Grego Nestlé',200]]);
{ const r = P.parse('1 iogurte grego'); ok(r.items[0] && r.items[0].src === 'prod' && r.items[0].ref === 'P7891000100103', 'produto pelo apelido → src prod'); }
{ const s = P.search('iogurte', 5); ok(s[0] && s[0].ref === 'P7891000100103', 'busca: produto antes da TACO'); }
P.setContext({products:{}, aliases:{}});

console.log('Busca');
{ const s = P.search('frango', 5); ok(s[0].name === 'Frango, peito, sem pele, grelhado', 'busca "frango" → peito grelhado primeiro: ' + s[0].name); ok(!/cru/.test(s[0].name), 'busca prefere cozido'); }
{ const s = P.search('frango cru', 5); ok(/cru/.test(s[0].name), 'busca "frango cru" → cru: ' + s[0].name); }
{ const s = P.search('leite', 10); ok(s.every(x => x.kcal > 0), 'busca "leite" sem itens de 0 kcal'); ok(s[0].name === 'Leite, de vaca, integral (média)', 'busca "leite" → integral (média)'); }
{ const s = P.search('arroz', 3); ok(s[0].name === ARROZ, 'busca "arroz" → tipo 1 cozido'); }
{ const s = P.search('feijao preto', 3); ok(s[0].name === 'Feijão, preto, cozido', 'busca sem acento: ' + s[0].name); }
{ const s = P.search('', 10); ok(s.length === 10, 'busca vazia lista itens'); }

console.log('API');
ok(typeof P.norm === 'function' && P.norm('Feijão, Carioca!') === 'feijao carioca', 'norm');
{ const f = P.foodFromRef('T2'); ok(f && f.n === ARROZ && f.src === 'taco' && f.v.length === 12, 'foodFromRef T2'); }
{ const f = P.foodFromRef('T' + TACO.length); ok(f && f.src === 'est' && f.n === P._internal.EXTRAS[0][0], 'EXTRAS começam no fim da TACO com src est'); }
ok(P.foodFromRef('X1') === null && P.foodFromRef('T99999') === null, 'foodFromRef inválido → null');
{ const r = P.parse(''); ok(r.meal === null && r.items.length === 0 && r.missing.length === 0, 'texto vazio'); }

console.log('Auditoria do dicionário');
{ const { SYN, COMBOS, PROFILES, EXTRAS, foodByName } = P._internal;
  const names = new Set(TACO.map(r => r[0]).concat(EXTRAS.map(r => r[0])));
  for(const [k, v] of Object.entries(SYN)) ok(names.has(v), `SYN["${k}"] → "${v}" não existe na TACO/EXTRAS`);
  for(const [k, parts] of Object.entries(COMBOS)) for(const [n] of parts) ok(names.has(n), `COMBOS["${k}"] → "${n}" não existe`);
  for(const [k, parts] of Object.entries(COMBOS)) ok(Math.abs(parts.reduce((s, p) => s + p[1], 0) - 1) < 0.01, `COMBOS["${k}"] frações somam 1`);
  // nenhum termo comum aponta para linha com kcal 0 (exceto água/café/chá/zero)
  for(const [k, v] of Object.entries(SYN)){ const f = foodByName(v); if(f && !/^(agua|cafe|cafezinho|cha|mate|refrigerante zero|coca zero|guarana zero|refri zero)/.test(k) && !/^agua/.test(k)) ok(f.v[0] > 0, `SYN["${k}"] → "${v}" tem 0 kcal`); }
  for(const r of EXTRAS){ ok(r.length === 13 && r.slice(1).every(x => typeof x === 'number'), `EXTRAS "${r[0]}" com 12 números`); ok(/\(média\)|^Macarrão, trigo, cozido$|^Água de coco$/.test(r[0]), `EXTRAS "${r[0]}" sem sufixo (média)`); }
  ok(Object.keys(SYN).every(k => k === P.norm(k)), 'chaves do SYN normalizadas');
}

console.log(`\n${pass} verificações passaram, ${fail} falharam.`);
process.exit(fail ? 1 : 0);
