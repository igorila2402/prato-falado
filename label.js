"use strict";
/* Leitura do texto (OCR) de tabelas nutricionais brasileiras.
   Formatos tratados:
   - RDC 429/2020 (novo): colunas "100 g | porção | %VD*", ex.: "Valor energético (kcal) 400 120 6".
   - RDC 360/2003 (antigo): só "Quantidade por porção | %VD", ex.: "Valor energético 120 kcal = 504 kJ 6%".
   Quando só há valores por porção e o tamanho da porção aparece ("Porção de 30 g"), converte para 100 g.
   Saída (por 100 g quando possível): {kcal,p,c,f,fi,na, per100, basis, servingG, perServing}. */
(function(root){
  const strip = s => String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');

  /* Correções de erros comuns do OCR antes de procurar números. */
  function fixOcr(l){
    return l
      .replace(/\bk\s?c[ao0][l1i|]\b|\bkca[l1i|]\.?/g,'kcal')       // kcai, kca1, kcol -> kcal
      .replace(/\bk\s?j\b/g,'kj')
      .replace(/(\d)\s*[.,]\s*[o]\b/g,'$1,0')                         // 0,O -> 0,0
      .replace(/(^|[\s(])[o](?=\s*(?:g|mg|ml|%|kcal)\b)/g,'$10')      // "O g" -> "0 g"
      .replace(/(\d)[o](?=\s*(?:g|mg|ml|%|kcal)\b)/g,'$10')           // "1O g" -> "10 g"
      .replace(/(\d)\s+,\s*(\d)/g,'$1,$2')                            // "2 ,4" -> "2,4"
      .replace(/(\d),\s+(\d)\b/g,'$1,$2');                            // "2, 4" -> "2,4"
  }

  const NUM = /(\d+(?:[.,]\d+)?)/;
  function toNum(s, mgRow){
    if(mgRow && /^\d{1,3}\.\d{3}$/.test(s)) return parseFloat(s.replace('.',''));   // 1.200 mg
    return parseFloat(s.replace(',','.'));
  }

  /* Números de uma linha, sem %VD, sem kJ e sem o que estiver nos parênteses do rótulo. */
  function rowNumbers(rest, mgRow){
    let s = ' '+rest+' ';
    s = s.replace(/\([^)]*\)/g,' ');                                  // "(g)", "(kcal)"
    s = s.replace(/\d+(?:[.,]\d+)?\s*kj\b/g,' ');                     // 504 kJ
    s = s.replace(/\d+(?:[.,]\d+)?\s*%/g,' ');                        // 6%
    s = s.replace(/\*+/g,' ');
    const out = [];
    const re = /(\d+(?:[.,]\d+)?)/g; let m;
    while((m = re.exec(s))) out.push(toNum(m[1], mgRow));
    return out;
  }

  const ROWS = [
    {k:'kcal', re:/valor\s*energ|valor\s*calor|\benergia\b/, not:/^(?!.*kcal).*\bkj\b/},  // linha só com kJ é ignorada
    {k:'c',    re:/carboidrat|hidratos?\s+de\s+carbono/, not:/acucar|polio/},
    {k:'p',    re:/proteina/},
    {k:'f',    re:/gorduras?\s+tota|gordura\s*total|lipidios?\s+tota|^\s*lipidios?\b|^\s*gorduras?\s*(\(g\))?\s*[\d(]/, not:/satur|trans|mono|poli/},
    {k:'fi',   re:/fibra/},
    {k:'na',   re:/\bsodio\b/, mg:true},
  ];

  function parseLabel(text){
    const lines = String(text||'').split(/\r?\n+/).map(l=>fixOcr(strip(l)).replace(/\s+/g,' ').trim()).filter(Boolean);
    const all = lines.join('\n');
    const out = {};

    /* tamanho da porção: "Porção de 30 g", "Porção: 30g (1 xícara)", "porcao 200 ml" (não "porções por embalagem") */
    let servingG = null;
    for(const l of lines){
      const m = l.match(/\bporcao\b\s*(?:de|:|=|-)?\s*(?:media\s*(?:de)?\s*)?(\d+(?:[.,]\d+)?)\s*(g|ml)\b/);
      if(m){ servingG = toNum(m[1]); break; }
    }
    if(servingG!=null && !(servingG>0 && servingG<=2000)) servingG = null;

    /* colunas: procura um cabeçalho com "100 g" */
    let cols = ['srv'];
    for(const l of lines){
      const m100 = l.match(/\b100\s*(g|ml)\b/);
      if(!m100) continue;
      if(/\bporcao\b\s*(?:de|:|=|-)?\s*100\s*(g|ml)\b/.test(l)) continue;   // "Porção de 100 g" (tabela antiga)
      if(/porcoes\s+por\s+embalagem/.test(l) && !/%\s*vd/.test(l)) continue;
      // outra coluna: "30 g", "porção" ou "%VD" na mesma linha
      let other = null;
      for(const x of l.matchAll(/\b(\d+(?:[.,]\d+)?)\s*(g|ml)\b/g)) if(x.index!==m100.index){ other = x; break; }
      const wordSrv = l.search(/\bporcao\b/);
      if(other){ cols = other.index < m100.index ? ['srv','100'] : ['100','srv']; if(servingG==null) servingG = toNum(other[1]); }
      else if(wordSrv>=0) cols = wordSrv < m100.index ? ['srv','100'] : ['100','srv'];
      else cols = ['100'];
      break;
    }
    if(cols.length===1 && cols[0]==='srv' && /(?:por|em|cada)\s+100\s*(g|ml)\b/.test(all) && !/por\s+porcao/.test(all)) cols = ['100'];

    /* lê cada nutriente */
    const raw = {};
    for(const row of ROWS){
      for(let i=0;i<lines.length;i++){
        const l = lines[i];
        if(!row.re.test(l) || (row.not && row.not.test(l))) continue;
        const idx = l.search(row.re);
        let rest = l.slice(idx).replace(row.re,' ');
        let nums;
        if(row.k==='kcal'){
          const kc = [...rest.matchAll(/(\d+(?:[.,]\d+)?)\s*kcal\b/g)].map(m=>toNum(m[1]));
          nums = kc.length ? kc : rowNumbers(rest);
        } else nums = rowNumbers(rest, row.mg);
        if(!nums.length && i+1<lines.length && /^[\d\s.,%*()gmlkcaj=]+$/.test(lines[i+1])){
          nums = row.k==='kcal' && /kcal/.test(lines[i+1]) ? [...lines[i+1].matchAll(/(\d+(?:[.,]\d+)?)\s*kcal\b/g)].map(m=>toNum(m[1])) : rowNumbers(lines[i+1], row.mg);
        }
        nums = nums.filter(n=>isFinite(n));
        if(nums.length){ raw[row.k] = nums; break; }
      }
    }

    /* ordem das colunas conferida pela energia: porção/100 deve bater com o tamanho da porção */
    if(cols.length===2 && servingG && raw.kcal && raw.kcal.length>=2 && raw.kcal[0]>0 && raw.kcal[1]>0){
      const a=raw.kcal[0], b=raw.kcal[1], r=servingG/100;
      const asIs = cols[0]==='100' ? Math.abs(b/a - r) : Math.abs(a/b - r);
      const swapped = cols[0]==='100' ? Math.abs(a/b - r) : Math.abs(b/a - r);
      if(swapped + 0.05 < asIs) cols = cols.slice().reverse();
    }

    const i100 = cols.indexOf('100'), iSrv = cols.indexOf('srv');
    const perServing = {};
    let basis = 'unknown';
    for(const k of Object.keys(raw)){
      const n = raw[k];
      if(i100>=0 && n.length>i100){ out[k] = n[i100]; basis = 'per100'; if(iSrv>=0 && n.length>iSrv) perServing[k] = n[iSrv]; }
      else if(i100>=0 && cols.length===2 && n.length===1){ out[k] = n[0]; basis = 'per100'; }
      else if(iSrv>=0 && n.length>iSrv) perServing[k] = n[iSrv];
    }
    if(basis!=='per100' && Object.keys(perServing).length){
      if(servingG){
        for(const k of Object.keys(perServing)) out[k] = Math.round(perServing[k]*100/servingG*10)/10;
        basis = 'serving-converted';
      } else {
        for(const k of Object.keys(perServing)) out[k] = perServing[k];
        basis = 'serving';
      }
    }
    // valores impossíveis por 100 g são descartados (melhor deixar em branco do que errado)
    const max = {kcal:950,p:100,c:100,f:100,fi:100,na:40000};
    if(basis!=='serving') for(const k of Object.keys(max)) if(out[k]!=null && out[k]>max[k]) delete out[k];

    out.per100 = basis==='per100' || basis==='serving-converted';
    out.basis = basis;
    out.servingG = servingG;
    out.perServing = perServing;
    return out;
  }

  const api = { parseLabel, _fixOcr: fixOcr };
  if(typeof module!=='undefined' && module.exports) module.exports = api;
  else root.PFLabel = api;
})(typeof window!=='undefined' ? window : globalThis);
