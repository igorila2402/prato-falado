"use strict";
/* Testes do leitor de tabela nutricional. Rodar: node tests/label.test.js */
const assert = require('assert');
const { parseLabel } = require('../label.js');

let pass = 0, fail = 0;
function t(name, fn){ try{ fn(); pass++; console.log('ok   - '+name); }catch(e){ fail++; console.log('FAIL - '+name+'\n       '+e.message); } }
const near = (a, b, msg) => assert.ok(a!=null && Math.abs(a-b) < 0.051, `${msg}: esperado ${b}, veio ${a}`);

t('RDC 429/2020: colunas 100 g | porção | %VD', () => {
  const r = parseLabel(`INFORMAÇÃO NUTRICIONAL
Porções por embalagem: 6
Porção: 30 g (1 xícara)
100 g 30 g %VD*
Valor energético (kcal) 380 114 6
Carboidratos totais (g) 75 23 8
Açúcares totais (g) 20 6,0
Açúcares adicionados (g) 18 5,4 11
Proteínas (g) 8,0 2,4 5
Gorduras totais (g) 5,0 1,5 2
Gorduras saturadas (g) 1,0 0,3 2
Gorduras trans (g) 0 0 **
Fibras alimentares (g) 6,0 1,8 7
Sódio (mg) 450 135 7
*Percentual de valores diários fornecidos pela porção.`);
  near(r.kcal, 380, 'kcal'); near(r.c, 75, 'carbo'); near(r.p, 8, 'prot'); near(r.f, 5, 'gord');
  near(r.fi, 6, 'fibra'); near(r.na, 450, 'sódio'); assert.strictEqual(r.per100, true); assert.strictEqual(r.servingG, 30);
});

t('RDC 429/2020 com ruído de OCR (kcai, vírgulas soltas, O no lugar de 0)', () => {
  const r = parseLabel(`INFORMACAO NUTRICIONAL
Porções por embalagem: cerca de 10
Porção: 25 g (2 1/2 biscoitos)
                    100 g    25 g   %VD*
Valor energetico (kcai)  480   120    6
Carboidratos (g)   65    16    5
Proteinas (g)  7, 2   1,8   4
Gorduras totais (g)  21   5,3   8
Fibras alimentares (g)  2,4  O,6   2
Sodio (mg)  1.120  280   14`);
  near(r.kcal, 480, 'kcal'); near(r.c, 65, 'carbo'); near(r.p, 7.2, 'prot'); near(r.f, 21, 'gord');
  near(r.fi, 2.4, 'fibra'); near(r.na, 1120, 'sódio'); assert.strictEqual(r.per100, true);
});

t('RDC 429/2020 com colunas na ordem porção | 100 g (detecta pela energia)', () => {
  const r = parseLabel(`Porção de 200 ml (1 copo)
200 ml 100 ml %VD
Valor energético (kcal) 120 60 6
Carboidratos (g) 9,4 4,7 3
Proteínas (g) 6,2 3,1 12
Gorduras totais (g) 6,0 3,0 9
Sódio (mg) 130 65 7`);
  near(r.kcal, 60, 'kcal'); near(r.p, 3.1, 'prot'); near(r.na, 65, 'sódio'); assert.strictEqual(r.per100, true);
});

t('RDC 360/2003 (antiga): só porção, converte para 100 g', () => {
  const r = parseLabel(`INFORMAÇÃO NUTRICIONAL
Porção de 30 g (1 1/2 xícara)
Quantidade por porção %VD(*)
Valor energético 117 kcal = 491 kJ 6%
Carboidratos 24 g 8%
Proteínas 2,1 g 3%
Gorduras totais 1,2 g 2%
Gorduras saturadas 0,3 g 1%
Gorduras trans 0 g **
Fibra alimentar 0,9 g 4%
Sódio 99 mg 4%
* % Valores Diários com base em uma dieta de 2.000 kcal ou 8.400 kJ.`);
  near(r.kcal, 390, 'kcal'); near(r.c, 80, 'carbo'); near(r.p, 7, 'prot'); near(r.f, 4, 'gord');
  near(r.fi, 3, 'fibra'); near(r.na, 330, 'sódio');
  assert.strictEqual(r.basis, 'serving-converted'); assert.strictEqual(r.per100, true); assert.strictEqual(r.servingG, 30);
  near(r.perServing.kcal, 117, 'kcal porção');
});

t('Antiga: kcal antes de kJ em linha com parênteses', () => {
  const r = parseLabel(`Porção 50 g (1 unidade)
Valor energético 135 kcal = 567 kJ 7 %
Carboidratos 27 g 9 %
Proteínas 4,5 g 6 %
Gorduras totais 1,0 g 2 %
Sódio 300 mg 13 %`);
  near(r.kcal, 270, 'kcal'); near(r.c, 54, 'carbo'); near(r.p, 9, 'prot'); near(r.na, 600, 'sódio');
});

t('Antiga sem tamanho de porção: devolve por porção e não marca per100', () => {
  const r = parseLabel(`Quantidade por porção
Valor energético 90 kcal
Proteínas 3 g
Carboidratos 15 g
Gorduras totais 2 g`);
  near(r.kcal, 90, 'kcal'); near(r.p, 3, 'prot'); assert.strictEqual(r.per100, false); assert.strictEqual(r.basis, 'serving');
});

t('Valor com número na linha seguinte', () => {
  const r = parseLabel(`Porção: 40 g
100 g 40 g %VD
Valor energético (kcal)
350 140 7
Proteínas (g) 10 4,0 8`);
  near(r.kcal, 350, 'kcal'); near(r.p, 10, 'prot');
});

t('Não confunde gorduras saturadas nem açúcares com totais', () => {
  const r = parseLabel(`100 g 20 g %VD
Valor energético (kcal) 500 100 5
Carboidratos (g) 60 12 4
Açúcares totais (g) 50 10
Gorduras saturadas (g) 9 1,8 9
Gorduras totais (g) 25 5,0 8`);
  near(r.c, 60, 'carbo'); near(r.f, 25, 'gord');
});

t('Linha de kJ antes da de kcal é ignorada', () => {
  const r = parseLabel(`100 g 30 g %VD
Valor energético (kJ) 1590 477
Valor energético (kcal) 380 114 6
Proteínas (g) 8,0 2,4 5`);
  near(r.kcal, 380, 'kcal');
});

t('Texto vazio não quebra', () => {
  const r = parseLabel('');
  assert.strictEqual(r.kcal, undefined); assert.strictEqual(r.per100, false);
});

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
