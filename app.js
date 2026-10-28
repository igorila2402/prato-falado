"use strict";
/* Prato Falado — diário de calorias por ditado e código de barras.
   Dados: TACO (Unicamp) embutida + Open Food Facts ao vivo + base pessoal.
   Registros: neste aparelho e, com conta, sincronizados no Supabase. */

/* ---------- constantes ---------- */
const K = {kcal:0,p:1,c:2,f:3,fi:4,na:5,ca:6,fe:7,vc:8,k:9,mg:10,zn:11};
const MICROS = [ // referência diária para adultos (IN 75/2020, Anvisa)
  {i:K.fi,n:'Fibra',u:'g',ref:25,main:1},{i:K.na,n:'Sódio',u:'mg',ref:2000,main:1,lim:1},{i:K.ca,n:'Cálcio',u:'mg',ref:1000,main:1},
  {i:K.fe,n:'Ferro',u:'mg',ref:14,main:1},{i:K.vc,n:'Vitamina C',u:'mg',ref:100,main:1},{i:K.k,n:'Potássio',u:'mg',ref:3500,main:1},
  {i:K.mg,n:'Magnésio',u:'mg',ref:420},{i:K.zn,n:'Zinco',u:'mg',ref:11}];
const DEF = {kcal:2200, prot:0, weekStart:1, meals:['Café da manhã','Almoço','Lanche','Jantar','Ceia']};
const WD = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const MES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

/* ---------- utilidades ---------- */
const $ = s => document.querySelector(s);
const el = (tag, attrs={}, ...kids) => { const e=document.createElement(tag); for(const [k,v] of Object.entries(attrs)){ if(k==='class') e.className=v; else if(k==='text') e.textContent=v; else if(k==='html') e.innerHTML=v; else if(k.startsWith('on')) e.addEventListener(k.slice(2),v); else if(v!==false&&v!=null) e.setAttribute(k,v===true?'':v);} for(const c of kids.flat()) if(c!=null&&c!==false) e.append(c.nodeType?c:document.createTextNode(c)); return e; };
const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const fmt = (n,d=0) => Number(n||0).toLocaleString('pt-BR',{maximumFractionDigits:d,minimumFractionDigits:0});
const r10 = n => Math.round((n||0)/10)*10;
const iso = d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const parseIso = s => { const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); };
const addDays = (s,n) => { const d=parseIso(s); d.setDate(d.getDate()+n); return iso(d); };
/* "Hoje" segue o relógio e o fuso do aparelho (no Acre: America/Rio_Branco, UTC−5, sem horário de verão).
   Datas são guardadas como texto AAAA-MM-DD do dia local, então não mudam se o fuso mudar depois. */
const todayIso = () => iso(new Date());
function toast(msg){ const t=$('#toast'); if(!t) return; t.textContent=msg; t.hidden=false; clearTimeout(toast._t); toast._t=setTimeout(()=>t.hidden=true,2600); }
function totals(items){ const t=new Array(12).fill(0); for(const it of items){ const v=it.v||[]; for(let i=0;i<12;i++) t[i]+=(Number(v[i])||0)*(Number(it.g)||0)/100; } return t; }
function dayTotals(day){ return totals((day?.meals||[]).flat()); }

/* ---------- armazenamento: aparelho + nuvem (Supabase) ----------
   Regras de dono dos dados neste aparelho (pf:__owner):
   - sem conta: __owner ausente. Ao entrar pela 1ª vez, os registros do aparelho são MESCLADOS com os da conta
     (dias: refeições somadas; produtos/refeições salvas/dicionário: união; metas: vale a da nuvem se existir).
   - com conta: __owner = id do usuário. Ao tocar em "Sair", o que falta enviar é enviado e os registros
     são APAGADOS do aparelho (o próximo a usar o aparelho não vê os dados de quem saiu).
   - se a sessão cair sozinha (token vencido) e OUTRA conta entrar, os dados do dono anterior não sobem para
     a conta nova: ficam guardados à parte (pf:__stash:<id>) e voltam se o dono anterior entrar de novo.
   Senhas nunca são guardadas pelo app (só a sessão do Supabase, no armazenamento padrão dele). */
const Local = {
  get(k){ try{ const v=localStorage.getItem('pf:'+k); return v?JSON.parse(v):null; }catch(e){ return null; } },
  raw(k){ try{ return localStorage.getItem('pf:'+k); }catch(e){ return null; } },
  set(k,v){ try{ localStorage.setItem('pf:'+k, JSON.stringify(v)); return true; }catch(e){ toast('Memória do aparelho cheia'); return false; } },
  del(k){ try{ localStorage.removeItem('pf:'+k); }catch(e){} },
  keys(){ const out=[]; try{ for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if(k&&k.startsWith('pf:')&&!k.startsWith('pf:__')) out.push(k.slice(3)); } }catch(e){} return out; },
  wipeUserData(){ for(const k of this.keys()) this.del(k); this.del('__pending'); this.del('__owner'); }
};
const Cloud = {
  client:null, user:null, lastSync:null, syncing:null, again:false,
  configured(){ const c=window.PF_CONFIG||{}; return !!(c.supabaseUrl && c.supabaseKey && window.supabase?.createClient); },
  async init(){
    if(!this.configured()) return;
    const c=window.PF_CONFIG;
    // erro vindo do link de confirmação (ex.: link vencido) chega no endereço; mostra e limpa
    const hp=new URLSearchParams(location.hash.slice(1)+'&'+location.search.slice(1));
    const linkErr=hp.get('error_description');
    try{ this.client = window.supabase.createClient(c.supabaseUrl, c.supabaseKey, {auth:{persistSession:true, autoRefreshToken:true, detectSessionInUrl:true}}); }
    catch(e){ console.warn(e); this.client=null; return; }
    try{ const {data}=await this.client.auth.getSession(); this.user=data?.session?.user||null; }catch(e){}
    if(linkErr){ toast('Link de confirmação: '+linkErr.replace(/\+/g,' ')); try{ history.replaceState(null,'',location.pathname); }catch(e){} }
    // Não chamar o Supabase de dentro deste callback (trava a sessão); por isso o setTimeout.
    this.client.auth.onAuthStateChange((ev,session)=>{ const was=this.user?.id; this.user=session?.user||null;
      setTimeout(()=>{ if(this.user && this.user.id!==was){ syncNow(true); } else if(!this.user && was){ renderAll(); } },0); });
  },
  pending(){ return new Set(Local.get('__pending')||[]); },
  savePending(s){ Local.set('__pending',[...s]); }
};
const Store = {
  get(k){ return Local.get(k); },
  set(k,v){ if(!Local.set(k,v)) return; const p=Cloud.pending(); p.add(k); Cloud.savePending(p); scheduleFlush(); }
};
let flushT, flushing=null, retryMs=0;
function scheduleFlush(ms=900){ clearTimeout(flushT); flushT=setTimeout(flush,ms); }
/* Envia as chaves pendentes. Só tira da fila as que não mudaram enquanto o envio estava no ar. */
function flush(){
  if(flushing) return flushing.then(()=>flush());
  flushing=(async()=>{
    clearTimeout(flushT);
    if(!Cloud.user || !Cloud.client || !navigator.onLine) return false;
    if(Local.get('__owner')!==Cloud.user.id) return false;   // dados ainda não mesclados com esta conta
    const p=Cloud.pending(); if(!p.size) return true;
    const sent=new Map(); const rows=[];
    for(const k of p){ const raw=Local.raw(k); if(raw==null) continue; sent.set(k,raw); rows.push({user_id:Cloud.user.id, key:k, value:JSON.parse(raw), updated_at:new Date().toISOString()}); }
    let ok=true;
    for(let i=0;i<rows.length && ok;i+=200){
      const {error}=await Cloud.client.from('kv').upsert(rows.slice(i,i+200),{onConflict:'user_id,key'});
      if(error){ console.warn(error); ok=false; }
    }
    const now=Cloud.pending();
    for(const k of p){ if(!sent.has(k)) now.delete(k); }                  // chave sumiu do aparelho
    if(ok) for(const [k,raw] of sent) if(Local.raw(k)===raw) now.delete(k);
    Cloud.savePending(now);
    if(ok){ Cloud.lastSync=new Date(); retryMs=0; if(now.size) scheduleFlush(); }
    else { retryMs=Math.min(120000,(retryMs||5000)*2); scheduleFlush(retryMs); }
    return ok;
  })().catch(e=>{ console.warn(e); retryMs=Math.min(120000,(retryMs||5000)*2); scheduleFlush(retryMs); return false; })
     .finally(()=>{ flushing=null; });
  return flushing;
}
async function pullAll(){
  const out=[]; let from=0; const size=1000;
  for(;;){
    const {data,error}=await Cloud.client.from('kv').select('key,value').order('key').range(from,from+size-1);
    if(error) throw error;
    out.push(...data); if(data.length<size) break; from+=size;
  }
  return out;
}
/* Junta registros feitos sem conta com os da conta (1ª entrada neste aparelho). */
function mergeValue(k, local, cloud){
  if(cloud==null) return local;
  if(/^day-/.test(k) && Array.isArray(local?.meals) && Array.isArray(cloud?.meals)){
    const n=Math.max(local.meals.length,cloud.meals.length), meals=[];
    for(let i=0;i<n;i++) meals.push([...(cloud.meals[i]||[]),...(local.meals[i]||[])]);
    return {...cloud, meals};
  }
  if(local?.map && cloud?.map) return {...cloud, map:{...cloud.map,...local.map}};
  return cloud;   // metas e o resto: vale o que já está na conta
}
function stashOtherOwner(owner){
  const data={}; for(const k of Local.keys()) data[k]=Local.get(k);
  Local.set('__stash:'+owner,{data, pending:[...Cloud.pending()]});
  Local.wipeUserData();
}
function restoreStash(uid){
  const st=Local.get('__stash:'+uid); if(!st) return false;
  for(const [k,v] of Object.entries(st.data||{})) Local.set(k,v);
  Cloud.savePending(new Set(st.pending||[])); Local.set('__owner',uid); Local.del('__stash:'+uid); return true;
}
function syncNow(reload){
  if(!Cloud.user || !Cloud.client) return Promise.resolve(false);
  if(Cloud.syncing){ Cloud.again=true; return Cloud.syncing; }
  Cloud.syncing=(async()=>{
    let ok=false;
    do{
      Cloud.again=false;
      const uid=Cloud.user?.id; if(!uid) break;
      flushDaySoon();                                  // grava edição de gramas que ainda estava no temporizador
      try{
        const owner=Local.get('__owner');
        if(owner && owner!==uid){ stashOtherOwner(owner); }
        if(Local.get('__owner')!==uid) restoreStash(uid);
        if(Local.get('__owner')!==uid){
          // 1ª vez desta conta neste aparelho: mescla sem apagar nada da nuvem
          const rows=await pullAll(); const cloud=new Map(rows.map(r=>[r.key,r.value]));
          const pend=new Set();
          for(const k of Local.keys()){
            const lv=Local.get(k), merged=mergeValue(k,lv,cloud.get(k));
            Local.set(k,merged); if(JSON.stringify(merged)!==JSON.stringify(cloud.get(k))) pend.add(k);
          }
          for(const [k,v] of cloud) if(Local.raw(k)==null) Local.set(k,v);
          Cloud.savePending(pend); Local.set('__owner',uid);
          await flush();
        } else {
          await flush();
          const rows=await pullAll();
          const pend=Cloud.pending();                    // relido depois do download: edições feitas no meio vencem
          for(const r of rows) if(!pend.has(r.key)) Local.set(r.key, r.value);
        }
        Cloud.lastSync=new Date(); ok=true;
      }catch(e){ console.warn(e); toast('Não consegui sincronizar agora'); }
    } while(Cloud.again && Cloud.user);
    if(reload){ loadState(); renderAll(); }
    return ok;
  })().finally(()=>{ Cloud.syncing=null; });
  return Cloud.syncing;
}
window.addEventListener('online',()=>flush());
// iOS pode encerrar o app instalado sem 'visibilitychange'; 'pagehide' é a última chance de gravar
window.addEventListener('pagehide',()=>{ flushDaySoon(); flush(); });
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden'){ flushDaySoon(); flush(); stopScan(); stopMic(); }
  else { followToday(); if(Cloud.user) syncNow(true); else renderAll();
    if(!$('#scanSheet').hidden && $('#scanType').hidden && !scanner) openScan(); }   // câmera foi desligada ao sair do app
});

/* ---------- estado ---------- */
const S = { settings:{...DEF, meals:[...DEF.meals]}, hasSettings:false, products:{}, meals:{}, aliases:{}, date:todayIso(), view:'hoje', open:{}, weekAnchor:todayIso(), today:todayIso() };
/* Se o app ficou aberto de um dia para o outro (comum no iPhone), quem estava em "Hoje" passa para o novo hoje. */
function followToday(){ const t=todayIso(); if(t===S.today) return; if(S.date===S.today) S.date=t; if(S.weekAnchor===S.today) S.weekAnchor=t; S.today=t; }
function loadState(){
  const st=Store.get('settings'); S.settings={...DEF, meals:[...DEF.meals], ...(st||{})}; S.hasSettings=!!st;
  if(!Array.isArray(S.settings.meals)||!S.settings.meals.length) S.settings.meals=[...DEF.meals];
  S.products=Store.get('products')?.map||{}; S.meals=Store.get('meals')?.map||{}; S.aliases=Store.get('aliases')?.map||{};
}
function getDay(date){ if(sdDay && sdDay.date===date) flushDaySoon(); const d=Store.get('day-'+date); return d&&Array.isArray(d.meals)?d:null; }
function ensureDay(date){ const d=getDay(date)||{date, meals:[]}; while(d.meals.length<S.settings.meals.length) d.meals.push([]); return d; }
function saveDay(d){ if(sdDay===d){ clearTimeout(sdT); sdDay=null; } Store.set('day-'+d.date, d); }
function saveSettings(){ Store.set('settings', S.settings); S.hasSettings=true; }
function saveProducts(){ Store.set('products',{map:S.products}); }
function saveMeals(){ Store.set('meals',{map:S.meals}); }
function saveAliases(){ Store.set('aliases',{map:S.aliases}); }

/* ---------- alimentos: interpretador e busca ficam em parser.js (PFParser) ---------- */
function syncParser(){ PFParser.setContext({products:S.products, aliases:S.aliases, mealNames:S.settings.meals}); }
function searchFoods(q,max=40){ syncParser(); return PFParser.search(q,max); }
function foodFromRef(ref){ syncParser(); return PFParser.foodFromRef(ref); }

/* ---------- Open Food Facts ---------- */
/* Devolve o produto, null (não existe no OFF) ou 'net' (sem internet / OFF fora do ar / demorou). */
async function lookupOFF(code){
  const url=`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=code,product_name,product_name_pt,generic_name_pt,brands,nutriments,serving_quantity,serving_size,nutrition_data_per`;
  const ctl=new AbortController(); const t=setTimeout(()=>ctl.abort(),10000);
  try{
    const r=await fetch(url,{signal:ctl.signal, headers:{Accept:'application/json'}});
    if(r.status===404) return null; if(!r.ok) return 'net';
    const j=await r.json();
    if(j.status!==1 && j.status!=='success' || !j.product) return null;
    const p=j.product, n=p.nutriments||{};
    const num=x=>{ const v=parseFloat(String(x??'').replace(',','.')); return isFinite(v)&&v>=0?v:null; };
    const sq=num(p.serving_quantity);
    // valor por 100 g; se só houver por porção, converte com o tamanho da porção
    const per100=k=>{ let v=num(n[k+'_100g']); if(v==null && sq>0){ const sv=num(n[k+'_serving']); if(sv!=null) v=sv*100/sq; } return v; };
    const g=(k,mult=1)=>{ const v=per100(k); return v==null?0:Math.round(v*mult*100)/100; };
    let kcal=per100('energy-kcal');
    if(kcal==null){ const kj=per100('energy-kj') ?? per100('energy'); if(kj!=null) kcal=kj/4.184; }   // energy_100g vem em kJ
    kcal=kcal==null?0:Math.round(kcal);
    let na=per100('sodium'); if(na==null){ const salt=per100('salt'); if(salt!=null) na=salt/2.5; }   // g de sal → g de sódio
    let name=(p.product_name_pt||p.product_name||p.generic_name_pt||'').trim(); const brand=(p.brands||'').split(',')[0].trim();
    if(brand && !norm(name).includes(norm(brand))) name = name ? `${name} (${brand})` : brand;
    return {n:name||('Produto '+code), v:[kcal,g('proteins'),g('carbohydrates'),g('fat'),g('fiber'),na==null?0:Math.round(na*1000),g('calcium',1000),g('iron',1000),g('vitamin-c',1000),g('potassium',1000),g('magnesium',1000),g('zinc',1000)],
      porcao: sq>0&&sq<=2000?Math.round(sq):100, complete: kcal>0 && per100('proteins')!=null && per100('carbohydrates')!=null && per100('fat')!=null};
  }catch(e){ return 'net'; } finally{ clearTimeout(t); }
}

/* ---------- leitura da tabela nutricional (OCR gratuito no aparelho) ----------
   tesseract.js 5: createWorker('por') baixa o português (~2 MB, uma vez; o navegador guarda em cache). O texto
   lido vai para PFLabel.parseLabel (label.js), que entende as tabelas novas (100 g | porção) e antigas (só porção). */
function loadScript(src){ return new Promise((res,rej)=>{ const old=document.querySelector(`script[src="${src}"]`); if(old&&old.dataset.ok) return res(); if(old) old.remove();
  const s=document.createElement('script'); s.src=src; s.crossOrigin='anonymous'; s.onload=()=>{ s.dataset.ok='1'; res(); }; s.onerror=()=>{ s.remove(); rej(new Error('script '+src)); }; document.head.append(s); }); }
/* Fotos do iPhone têm 12 MP: reduz para ~1800 px e passa para tons de cinza (mais rápido e mais preciso). */
async function prepImage(file){
  try{
    const url=URL.createObjectURL(file);
    const img=await new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=url; });
    const sc=Math.min(1,1800/Math.max(img.naturalWidth,img.naturalHeight));
    const c=document.createElement('canvas'); c.width=Math.round(img.naturalWidth*sc); c.height=Math.round(img.naturalHeight*sc);
    const x=c.getContext('2d'); x.filter='grayscale(1) contrast(1.25)'; x.drawImage(img,0,0,c.width,c.height); URL.revokeObjectURL(url);
    return c;
  }catch(e){ return file; }
}
async function ocrLabel(file, onProgress){
  await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js');
  const img=await prepImage(file);
  const worker=await Tesseract.createWorker('por',1,{logger:m=>{ if(m.status==='recognizing text') onProgress?.(m.progress); }});
  try{
    await worker.setParameters({preserve_interword_spaces:'1'});
    const {data}=await worker.recognize(img);
    return window.PFLabel.parseLabel(data.text||'');
  } finally { worker.terminate(); }
}

/* ---------- tela: Hoje ---------- */
function ringSvg(val, meta){
  const C=2*Math.PI*64, ratio=meta?val/meta:0;
  const col = ratio>1.1?'var(--over)':ratio>1?'var(--warn)':'var(--accent)';
  return `<svg viewBox="0 0 150 150" aria-hidden="true"><circle cx="75" cy="75" r="64" fill="none" stroke="var(--surface2)" stroke-width="13"/><circle cx="75" cy="75" r="64" fill="none" stroke="${col}" stroke-width="13" stroke-linecap="round" stroke-dasharray="${Math.min(1,ratio)*C} ${C}"/></svg>`;
}
function macroBlock(t){
  const kp=t[K.p]*4, kc=t[K.c]*4, kf=t[K.f]*9, sum=kp+kc+kf||1;
  const box=el('div',{class:'stat'},
    el('div',{class:'split',role:'img','aria-label':`Calorias: ${fmt(kp/sum*100)}% proteína, ${fmt(kc/sum*100)}% carboidrato, ${fmt(kf/sum*100)}% gordura`},
      el('i',{style:`width:${kp/sum*100}%;background:var(--prot)`}),el('i',{style:`width:${kc/sum*100}%;background:var(--carb)`}),el('i',{style:`width:${kf/sum*100}%;background:var(--fat)`})),
    el('div',{class:'legend num'},
      el('span',{},el('i',{class:'dot',style:'background:var(--prot)'}),'P ',el('b',{text:fmt(t[K.p])+' g'})),
      el('span',{},el('i',{class:'dot',style:'background:var(--carb)'}),'C ',el('b',{text:fmt(t[K.c])+' g'})),
      el('span',{},el('i',{class:'dot',style:'background:var(--fat)'}),'G ',el('b',{text:fmt(t[K.f])+' g'}))));
  if(S.settings.prot>0){ const r=t[K.p]/S.settings.prot;
    box.append(el('div',{class:'pbar'},el('div',{class:'row num'},el('span',{text:'Proteína'}),el('span',{text:fmt(t[K.p])+' de '+fmt(S.settings.prot)+' g'})),
      el('div',{class:'track'},el('i',{style:`width:${Math.min(100,r*100)}%;background:var(--prot)`})))); }
  return box;
}
function renderHoje(){
  const v=$('#v-hoje'); v.replaceChildren();
  const day=getDay(S.date); const t=dayTotals(day); const meta=S.settings.kcal;
  if(Cloud.configured() && !Cloud.user && !Local.get('__noAccountOk')){
    v.append(el('div',{class:'banner'},el('span',{text:'Entre na sua conta para salvar os registros na nuvem.'}),el('button',{class:'ghost',text:'Entrar',onclick:()=>go('ajustes')})));
  } else if(!S.hasSettings){
    v.append(el('div',{class:'banner'},el('span',{text:'Comecei com 2.200 kcal de exemplo. Defina sua meta.'}),el('button',{class:'ghost',text:'Ajustar',onclick:()=>go('ajustes')})));
  }
  const left=meta-t[0];
  const ring=el('div',{class:'ring',role:'img','aria-label':`${fmt(r10(t[0]))} de ${fmt(meta)} kcal`,html:ringSvg(t[0],meta)});
  ring.append(el('div',{class:'c'},el('div',{class:'big num',text:fmt(r10(t[0]))}),el('div',{class:'of num',text:'de '+fmt(meta)+' kcal'})));
  const st=macroBlock(t); const r=meta?t[0]/meta:0;
  const pill = r>1.1 ? el('span',{class:'pill over',text:'acima da meta'}) : r>=0.9 ? el('span',{class:'pill',text:'na meta'}) : null;
  st.prepend(el('div',{style:'display:flex;gap:8px;align-items:center;flex-wrap:wrap'},el('div',{class:'left num',text:left>=0?'Faltam '+fmt(r10(left))+' kcal':'Passou '+fmt(r10(-left))+' kcal'}),pill));
  v.append(el('div',{class:'card summary'},ring,st));

  const all=(day?.meals||[]).flat();
  if(!all.length){
    v.append(el('div',{class:'card empty'},el('h3',{text:'Nada registrado neste dia'}),el('div',{text:'Toque no + e diga o que comeu:'}),el('div',{class:'example',text:'“Almoço: 200 g de arroz, 200 g de carne e 100 g de salada”'})));
  }
  const meals=el('div',{class:'meals'}); const empties=[];
  S.settings.meals.forEach((name,mi)=>{
    const items=day?.meals?.[mi]||[];
    if(!items.length){ empties.push(el('button',{class:'chip',text:'+ '+name,onclick:()=>openAdd(mi)})); return; }
    const mt=totals(items), key=S.date+':'+mi, open=!!S.open[key];
    const card=el('div',{class:'meal'},el('button',{class:'head','aria-expanded':String(open),onclick:()=>{S.open[key]=!open; renderHoje();}},
      el('span',{class:'nm',text:name}),el('span',{class:'kc num',text:fmt(r10(mt[0]))+' kcal'}),
      el('span',{class:'mac num',text:`P ${fmt(mt[1])} g · C ${fmt(mt[2])} g · G ${fmt(mt[3])} g`}),el('span'),
      el('span',{class:'foods',text:items.map(i=>String(i.n).split(',')[0]).join(', ')})));
    if(open){
      const body=el('div',{class:'body'});
      items.forEach((it,ii)=>body.append(itemRow(it,{
        onGrams:g=>{ it.g=g; saveDaySoon(day); }, onDone:()=>renderHoje(),
        onRemove:()=>{ items.splice(ii,1); saveDay(day); renderHoje(); toast('Removido'); },
        onSwap:()=>openPick(f=>{ Object.assign(it,{n:f.n,v:f.v,src:f.src,ref:f.ref}); if(it.t) learnAlias(it.t,f); saveDay(day); renderHoje(); })})));
      body.append(el('div',{class:'row-actions'},el('button',{class:'ghost',text:'+ Adicionar aqui',onclick:()=>openAdd(mi)}),el('button',{class:'ghost',text:'Salvar como refeição',onclick:()=>saveMealPreset(name,items)})));
      card.append(body);
    }
    meals.append(card);
  });
  if(all.length) v.append(meals);
  if(empties.length) v.append(el('div',{class:'empty-chips'},empties));

  if(all.length){
    const alerts=[];
    if(t[K.na]>2000) alerts.push(el('span',{class:'pill over',text:'Sódio acima da referência'}));
    if(t[0]>=meta*0.7 && t[K.fi]<15) alerts.push(el('span',{class:'pill warn',text:'Fibra baixa hoje'}));
    if(S.settings.prot>0 && t[0]>=meta*0.8 && t[K.p]<S.settings.prot*0.8) alerts.push(el('span',{class:'pill warn',text:'Proteína abaixo da meta'}));
    if(alerts.length) v.append(el('div',{class:'alerts'},alerts));
    const det=el('details',{class:'card micro'}); if(S.microOpen) det.open=true; det.addEventListener('toggle',()=>S.microOpen=det.open);
    det.append(el('summary',{},el('span',{text:'Micronutrientes'})));
    const grid=el('div',{class:'mgrid'});
    for(const m of (S.microAll?MICROS:MICROS.filter(x=>x.main))){ const val=t[m.i], rr=val/m.ref;
      const col=m.lim?(rr>1?'var(--over)':'var(--accent)'):(rr>=1?'var(--ok)':rr>=.5?'var(--accent)':'var(--faint)');
      grid.append(el('div',{class:'pbar'},el('div',{class:'row num'},el('span',{text:m.n}),el('span',{text:fmt(val,m.u==='g'?1:0)+' '+m.u})),el('div',{class:'track'},el('i',{style:`width:${Math.min(100,rr*100)}%;background:${col}`})))); }
    det.append(grid, el('div',{class:'ref'},'Barras em relação à referência diária para adultos (Anvisa). Produtos sem esses dados na embalagem contam como zero. ',
      el('div',{},el('button',{class:'ghost',style:'margin-top:8px',text:S.microAll?'Mostrar menos':'Ver todos',onclick:()=>{S.microAll=!S.microAll;S.microOpen=true;renderHoje();}}))));
    v.append(det);
  }
}
let rT; function renderHojeSoon(){ clearTimeout(rT); rT=setTimeout(renderHoje,450); }
/* Edição de gramas grava com atraso; qualquer leitura do mesmo dia grava antes (evita sobrescrever com dado velho). */
let sdT, sdDay=null; function saveDaySoon(d){ sdDay=d; clearTimeout(sdT); sdT=setTimeout(flushDaySoon,600); }
function flushDaySoon(){ clearTimeout(sdT); const d=sdDay; sdDay=null; if(d) Store.set('day-'+d.date, d); }
function itemRow(it,{onGrams,onRemove,onSwap,onDone}){
  const name=el('div',{class:'n'});
  name.append(onSwap?el('button',{text:it.n,onclick:onSwap,title:'Trocar alimento'}):it.n);
  if(it.src==='est') name.append(el('span',{class:'est',text:'média'}));
  if(it.est) name.append(el('span',{class:'est',text:'porção estimada'}));
  if(it.t && norm(it.t)!==norm(it.n)) name.append(el('small',{text:'você disse: '+it.t}));
  const gin=el('input',{class:'gin num',type:'number',inputmode:'numeric',min:'0',step:'5',value:String(it.g),'aria-label':'Gramas de '+it.n});
  const v=it.v||[]; const f=i=>fmt((Number(v[i])||0)*(Number(it.g)||0)/100);
  const meta=el('div',{class:'m num'});
  const upd=()=>meta.textContent=`${fmt(Math.round((Number(v[0])||0)*(Number(it.g)||0)/100))} kcal  ·  P ${f(1)} · C ${f(2)} · G ${f(3)} g`;
  upd();
  // não redesenha a tela enquanto digita (no iPhone isso fecha o teclado); totais do dia atualizam ao sair do campo
  gin.addEventListener('input',()=>{ const g=Math.max(0,Math.round(+String(gin.value).replace(',','.')||0)); it.est=false; onGrams(g); upd(); });
  if(onDone) gin.addEventListener('change',onDone);
  return el('div',{class:'item'},name,el('div',{class:'ctl'},gin,el('span',{text:'g'}),el('button',{class:'x','aria-label':'Remover '+it.n,text:'×',onclick:onRemove})),meta);
}
function learnAlias(term,f){ const k=norm(term); if(!k||!f?.ref) return; S.aliases[k]={ref:f.ref,n:f.n}; saveAliases(); }
function saveMealPreset(name,items){ let key=name,i=2; while(S.meals[key]) key=name+' '+(i++);
  S.meals[key]=items.map(x=>({n:x.n,v:x.v,g:x.g,src:x.src,ref:x.ref||null})); saveMeals(); toast('Salva como “'+key+'”'); }

/* ---------- tela: Semana ---------- */
function weekDates(anchor){ const d=parseIso(anchor); const off=(d.getDay()-S.settings.weekStart+7)%7; d.setDate(d.getDate()-off); const s=iso(d); return [...Array(7)].map((_,i)=>addDays(s,i)); }
function renderSemana(){
  const v=$('#v-semana'); v.replaceChildren(); const dates=weekDates(S.weekAnchor); const meta=S.settings.kcal;
  const tots=dates.map(d=>dayTotals(getDay(d))); const logged=tots.map((t,i)=>({t,d:dates[i]})).filter(x=>x.t[0]>0);
  const sum=tots.reduce((a,t)=>a+t[0],0), avg=logged.length?sum/logged.length:0;
  const a=parseIso(dates[0]), b=parseIso(dates[6]), isCur=dates.includes(todayIso());
  const nav=el('div',{class:'datenav'},el('button',{'aria-label':'Semana anterior',text:'‹',onclick:()=>{S.weekAnchor=addDays(S.weekAnchor,-7);renderSemana();}}),
    el('div',{class:'lbl num',text:`${a.getDate()} ${MES[a.getMonth()]} – ${b.getDate()} ${MES[b.getMonth()]}`}),
    el('button',{'aria-label':'Próxima semana',text:'›',disabled:isCur,onclick:()=>{S.weekAnchor=addDays(S.weekAnchor,7);renderSemana();}}));
  const card=el('div',{class:'card'},el('div',{class:'wk-head'},el('div',{},el('div',{class:'eyebrow',text:isCur?'Esta semana':'Semana'}),el('h2',{class:'num',text:fmt(r10(sum))+' kcal'})),nav),
    el('div',{class:'kpis'},kpi(fmt(r10(avg)),'média por dia registrado'),kpi(fmt(meta),'meta diária'),kpi(logged.length+'/7','dias registrados')),weekChart(dates,tots,meta));
  v.append(card);
  if(logged.length){
    const avgT=new Array(12).fill(0); for(const j of [1,2,3]) avgT[j]=logged.reduce((s,x)=>s+x.t[j],0)/logged.length;
    v.append(el('div',{class:'card'},el('div',{class:'eyebrow',text:'Média diária dos macros'}),el('div',{style:'height:10px'}),macroBlock(avgT)));
    v.append(el('div',{class:'card'},el('div',{class:'eyebrow',text:'Resumo'}),el('p',{style:'margin:8px 0 0',text:weekSummary(logged,meta)})));
  } else v.append(el('div',{class:'card empty'},el('h3',{text:'Nenhum dia registrado nesta semana'}),el('div',{text:'Os totais e o gráfico aparecem assim que você registrar a primeira refeição.'})));
}
function kpi(val,l){ return el('div',{class:'kpi'},el('div',{class:'v num',text:val}),el('div',{class:'l',text:l})); }
function weekChart(dates,tots,meta){
  const W=340,H=190,top=22,bot=26,lp=6,rp=6, vals=tots.map(t=>t[0]);
  const max=Math.max(meta*1.25,...vals)||1, y=v=>top+(H-top-bot)*(1-v/max);
  const slot=(W-lp-rp)/7, bw=Math.min(30,slot*0.56), today=todayIso();
  let s=`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Calorias por dia da semana com a linha da meta"><line x1="${lp}" x2="${W-rp}" y1="${H-bot}" y2="${H-bot}" stroke="var(--line)"/>`;
  vals.forEach((v,i)=>{ const x=lp+slot*i+slot/2, r=v/meta;
    const col=v===0?'var(--surface2)':r>1.1?'var(--over)':r>=.9?'var(--accent)':'color-mix(in srgb,var(--accent) 55%,var(--surface2))';
    const yy=v?y(v):H-bot-3; s+=`<rect x="${x-bw/2}" y="${yy}" width="${bw}" height="${H-bot-yy}" rx="6" fill="${col}"/>`;
    if(v) s+=`<text x="${x}" y="${yy-6}" text-anchor="middle" font-size="10.5" fill="var(--muted)" font-family="Figtree,system-ui">${fmt(r10(v))}</text>`;
    const d=parseIso(dates[i]), isT=dates[i]===today;
    s+=`<text x="${x}" y="${H-8}" text-anchor="middle" font-size="11" font-weight="${isT?700:500}" fill="${isT?'var(--ink)':'var(--muted)'}" font-family="Figtree,system-ui">${WD[d.getDay()]}</text>`; });
  s+=`<line x1="${lp}" x2="${W-rp}" y1="${y(meta)}" y2="${y(meta)}" stroke="var(--ink)" stroke-opacity=".55" stroke-dasharray="4 4"/><text x="${W-rp}" y="${y(meta)-5}" text-anchor="end" font-size="10" fill="var(--muted)" font-family="Figtree,system-ui">meta</text></svg>`;
  return el('div',{html:s});
}
function weekSummary(logged,meta){
  const inside=logged.filter(x=>Math.abs(x.t[0]/meta-1)<=0.1).length, over=logged.filter(x=>x.t[0]>meta*1.1).length;
  const avg=logged.reduce((s,x)=>s+x.t[0],0)/logged.length, diff=avg-meta, parts=[];
  if(Math.abs(diff)<=meta*0.05) parts.push('Média da semana dentro da meta.');
  else if(diff>0) parts.push(`Média ${fmt(r10(diff))} kcal acima da meta por dia.`);
  else parts.push(`Média ${fmt(r10(-diff))} kcal abaixo da meta por dia.`);
  parts.push(`${inside} de ${logged.length} dias perto da meta${over?`, ${over} acima`:''}.`);
  if(S.settings.prot>0){ const low=logged.filter(x=>x.t[1]<S.settings.prot*0.9).length; if(low) parts.push(`Proteína abaixo da meta em ${low} dia${low>1?'s':''}.`); }
  const na=logged.filter(x=>x.t[5]>2000).length; if(na) parts.push(`Sódio alto em ${na} dia${na>1?'s':''}.`);
  const we=logged.filter(x=>[0,6].includes(parseIso(x.d).getDay())), wd=logged.filter(x=>![0,6].includes(parseIso(x.d).getDay()));
  if(we.length&&wd.length){ const a=we.reduce((s,x)=>s+x.t[0],0)/we.length, b=wd.reduce((s,x)=>s+x.t[0],0)/wd.length; if(a>b*1.15) parts.push('O fim de semana puxou a média para cima.'); }
  return parts.join(' ');
}

/* ---------- tela: Ajustes ---------- */
function renderAjustes(){
  const v=$('#v-ajustes'); v.replaceChildren(); const st=S.settings;
  v.append(accountCard());
  const kc=el('input',{id:'setKcal',type:'number',inputmode:'numeric',value:String(st.kcal)});
  const pr=el('input',{id:'setProt',type:'number',inputmode:'numeric',placeholder:'sem meta',value:st.prot?String(st.prot):''});
  const ws=el('select',{id:'setWeek'},el('option',{value:'1',text:'Segunda-feira'}),el('option',{value:'0',text:'Domingo'})); ws.value=String(st.weekStart);
  const mealIns=st.meals.map((m,i)=>el('input',{id:'meal'+i,value:m,'aria-label':'Nome da refeição '+(i+1)}));
  v.append(el('div',{class:'card stack'},el('h2',{text:'Metas'}),
    el('div',{class:'grid2'},el('div',{class:'field'},el('label',{for:'setKcal',text:'Calorias por dia'}),kc),el('div',{class:'field'},el('label',{for:'setProt',text:'Proteína (g/dia)'}),pr)),
    el('div',{class:'field'},el('label',{for:'setWeek',text:'A semana começa na'}),ws),
    el('div',{class:'field'},el('label',{text:'Nomes das refeições'}),...mealIns),
    el('button',{class:'btn wide',text:'Salvar ajustes',onclick:()=>{
      const k=Math.round(+kc.value); if(!(k>=800&&k<=6000)){ toast('Use uma meta entre 800 e 6.000 kcal'); return; }
      st.kcal=k; st.prot=Math.max(0,Math.round(+pr.value||0)); st.weekStart=+ws.value; st.meals=mealIns.map((x,i)=>x.value.trim()||DEF.meals[i]);
      saveSettings(); toast('Ajustes salvos'); renderDate(); }})));
  v.append(listCard('Refeições salvas','Salve uma refeição pelo cartão dela no dia.',Object.keys(S.meals).map(k=>[k+' · '+fmt(r10(totals(S.meals[k])[0]))+' kcal',()=>{delete S.meals[k];saveMeals();renderAjustes();}])));
  v.append(listCard('Produtos com código de barras','Aparecem aqui quando você escaneia um produto.',Object.entries(S.products).map(([c,p])=>[p.n+' · '+c,()=>{delete S.products[c];saveProducts();renderAjustes();}])));
  v.append(listCard('Dicionário pessoal','Quando você troca um alimento, o app aprende o que aquela palavra significa para você.',Object.entries(S.aliases).map(([t,a])=>['“'+t+'” → '+a.n,()=>{delete S.aliases[t];saveAliases();renderAjustes();}])));
  v.append(el('p',{class:'note',text:'Valores nutricionais: TACO (Unicamp) e Open Food Facts (ODbL). Itens marcados como “média” e porções estimadas são aproximações.'}));
}
/* Sair: envia o que falta e apaga os registros deste aparelho (ficam só na nuvem), para o próximo usuário não vê-los. */
async function signOutAndWipe(){
  flushDaySoon();
  let ok=await flush();
  if(Cloud.pending().size && !ok){
    if(!confirm('Há alterações que ainda não foram enviadas (sem internet?). Se sair agora, elas serão perdidas. Sair mesmo assim?')) return;
  }
  try{ await Cloud.client.auth.signOut({scope:'local'}); }catch(e){}
  Cloud.user=null; Local.wipeUserData(); S.open={}; loadState(); renderAll(); toast('Você saiu. Os registros deste aparelho foram apagados.');
}
function accountCard(){
  const c=el('div',{class:'card stack'},el('h2',{text:'Conta'}));
  if(!Cloud.configured() || !Cloud.client){ const cfg=window.PF_CONFIG||{};
    c.append(el('p',{class:'note',text: cfg.supabaseUrl&&cfg.supabaseKey ? 'Não consegui carregar a sincronização (sem internet?). Os registros continuam salvos neste aparelho.' : 'Sincronização desligada: os registros ficam salvos só neste aparelho.'})); return c; }
  if(Cloud.user){
    const pend=Cloud.pending().size + (sdDay?1:0);
    c.append(el('p',{class:'note',text:`Conectado como ${Cloud.user.email}. ${pend?pend+' alteração(ões) aguardando envio.':'Tudo sincronizado.'}`}),
      el('div',{class:'btns'},el('button',{class:'btn sec',text:'Sincronizar agora',onclick:async()=>{ if(!navigator.onLine){ toast('Sem internet agora'); return; } const ok=await syncNow(true); if(ok) toast('Sincronizado'); }}),
        el('button',{class:'btn sec',text:'Sair',onclick:signOutAndWipe})));
    return c;
  }
  const email=el('input',{id:'authEmail',type:'email',autocomplete:'username',inputmode:'email',placeholder:'seu@email.com'});
  const pass=el('input',{id:'authPass',type:'password',autocomplete:'current-password',placeholder:'mínimo 6 caracteres'});
  const msg=el('div',{class:'note'});
  const run=async(mode)=>{
    const e=email.value.trim(), p=pass.value; if(!e||p.length<6){ msg.className='err'; msg.textContent='Preencha o e-mail e uma senha com pelo menos 6 caracteres.'; return; }
    msg.className='note'; msg.textContent= mode==='up'?'Criando conta…':'Entrando…';
    if(run.busy) return; run.busy=true;
    try{
    const redirect=location.origin+location.pathname.replace(/index\.html$/,'');   // precisa estar em Auth → URL Configuration → Redirect URLs
    const {data,error}= mode==='up' ? await Cloud.client.auth.signUp({email:e,password:p,options:{emailRedirectTo:redirect}}) : await Cloud.client.auth.signInWithPassword({email:e,password:p});
    if(error){ msg.className='err'; msg.textContent = /invalid login/i.test(error.message)?'E-mail ou senha incorretos.' : /not confirmed/i.test(error.message)?'Confirme seu e-mail pelo link que enviamos antes de entrar.' : /already registered|already exists/i.test(error.message)?'Este e-mail já tem conta. Toque em Entrar.' : /fetch|network/i.test(error.message)?'Sem conexão com o servidor. Tente de novo.' : 'Não deu certo: '+error.message; return; }
    if(mode==='up' && !data.session){ pass.value=''; msg.className='okline'; msg.textContent='Se este e-mail ainda não tem conta, enviamos um link de confirmação. Abra o link (de preferência no Safari) e depois toque em Entrar aqui.'; return; }
    pass.value='';
    Cloud.user=data.user||data.session?.user; await syncNow(true); toast('Conectado');
    } catch(err){ msg.className='err'; msg.textContent='Sem conexão com o servidor. Tente de novo.'; }
    finally{ run.busy=false; }
  };
  c.append(el('p',{class:'note',text:'Com a conta, seus registros ficam salvos na nuvem e aparecem em qualquer aparelho.'}),
    el('div',{class:'field'},el('label',{for:'authEmail',text:'E-mail'}),email),el('div',{class:'field'},el('label',{for:'authPass',text:'Senha'}),pass),
    el('div',{class:'btns'},el('button',{class:'btn',text:'Entrar',onclick:()=>run('in')}),el('button',{class:'btn sec',text:'Criar conta',onclick:()=>run('up')})),msg,
    el('button',{class:'ghost',text:'Usar sem conta neste aparelho',onclick:()=>{ Local.set('__noAccountOk',true); go('hoje'); }}));
  return c;
}
function listCard(title,emptyText,rows){
  const c=el('div',{class:'card'},el('h2',{text:title}));
  if(!rows.length){ c.append(el('p',{class:'note',style:'margin-top:6px',text:emptyText})); return c; }
  const l=el('div',{class:'list'}); for(const [t,del] of rows) l.append(el('div',{class:'li'},el('span',{text:t}),el('button',{class:'x','aria-label':'Apagar',text:'×',onclick:del})));
  c.append(l); return c;
}

/* ---------- navegação ---------- */
function go(view){ S.view=view;
  for(const b of document.querySelectorAll('nav.tabs .t[data-v]')){ if(b.dataset.v===view) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current'); }
  for(const x of ['hoje','semana','ajustes']) $('#v-'+x).hidden = x!==view;
  $('#datenav').style.visibility = view==='hoje'?'visible':'hidden';
  renderAll(); window.scrollTo(0,0); }
function renderDate(){ const t=todayIso(), d=parseIso(S.date);
  $('#dateLbl').textContent = S.date===t?'Hoje':S.date===addDays(t,-1)?'Ontem':`${WD[d.getDay()]}, ${d.getDate()} ${MES[d.getMonth()]}`;
  $('#nextDay').disabled = S.date>=t; }
function renderAll(){ followToday(); renderDate(); if(S.view==='hoje') renderHoje(); else if(S.view==='semana') renderSemana(); else renderAjustes(); }

/* ---------- registrar ---------- */
const A = { meal:0, items:[] };
function guessMeal(){ const h=new Date().getHours(), n=S.settings.meals.length; return Math.min(n-1, h<10?0:h<15?1:h<18?2:h<22?3:4); }
/* iOS ignora overflow:hidden no body: fixa o body na posição atual e devolve a rolagem ao fechar. */
let lockY=null;
function lockScroll(on){
  const b=document.body;
  if(on && lockY==null){ lockY=window.scrollY; b.style.position='fixed'; b.style.top=(-lockY)+'px'; b.style.left='0'; b.style.right='0'; b.style.overflow='hidden'; }
  else if(!on && lockY!=null){ const y=lockY; lockY=null; b.style.position=''; b.style.top=''; b.style.left=''; b.style.right=''; b.style.overflow=''; window.scrollTo(0,y); }
}
function closeAll(){ for(const id of ['#addSheet','#pickSheet','#scanSheet']) $(id).hidden=true; $('#scrim').hidden=true; lockScroll(false); stopScan(); stopMic(); pickCb=null; }
function openAdd(mi){
  A.meal=mi??guessMeal(); A.items=[];
  $('#dito').value=''; $('#statusBox').replaceChildren(); $('#extraBox').replaceChildren();
  $('#addTitle').textContent = S.date===todayIso()?'Registrar':'Registrar em '+$('#dateLbl').textContent.toLowerCase();
  renderChips(); renderConfirm(); $('#scrim').hidden=false; $('#addSheet').hidden=false; $('#addSheet').scrollTop=0; lockScroll(true);
}
function renderChips(){ $('#mealChips').replaceChildren(...S.settings.meals.map((m,i)=>el('button',{class:'chip'+(i===A.meal?' on':''),text:m,'aria-pressed':String(i===A.meal),onclick:()=>{A.meal=i;renderChips();renderConfirm();}}))); }
function setStatus(text,busy){ const b=$('#statusBox'); b.replaceChildren(); if(!text) return; const row=el('div',{class:busy?'status':'err'}); if(busy) row.append(el('div',{class:'spin'})); row.append(el('span',{text})); b.append(row); }
function renderConfirm(){
  const box=$('#confirmBox'); box.replaceChildren();
  const addManual=el('button',{class:'ghost',text:'+ Buscar alimento',onclick:()=>openPick(f=>{ A.items.push({n:f.n,v:f.v,g:f.porcao||100,src:f.src,ref:f.ref,t:''}); renderConfirm(); })});
  if(!A.items.length){ box.append(addManual); return; }
  const c=el('div',{class:'confirm'}); const tot=el('div',{class:'total num'});
  const upd=()=>{ const t=totals(A.items); tot.replaceChildren(el('span',{text:'Total'}),el('span',{text:`${fmt(r10(t[0]))} kcal · P ${fmt(t[1])} · C ${fmt(t[2])} · G ${fmt(t[3])}`})); };
  A.items.forEach((it,i)=>c.append(itemRow(it,{onGrams:g=>{it.g=g;upd();},onRemove:()=>{A.items.splice(i,1);renderConfirm();},
    onSwap:()=>openPick(f=>{ Object.assign(it,{n:f.n,v:f.v,src:f.src,ref:f.ref}); if(it.t) learnAlias(it.t,f); renderConfirm(); })})));
  upd(); c.append(tot);
  box.append(el('p',{class:'note',text:'Confira as quantidades. Toque no nome para trocar o alimento; o app aprende a troca.'}),c,addManual,
    el('button',{class:'btn wide',text:'Salvar em '+S.settings.meals[A.meal],onclick:commit}));
}
function commit(){
  const items=A.items.filter(i=>i.g>0); if(!items.length){ toast('Informe os gramas'); return; }
  const d=ensureDay(S.date); d.meals[A.meal].push(...items.map(i=>({n:i.n,v:i.v,g:i.g,src:i.src,ref:i.ref||null,t:i.t||'',...(i.est?{est:true}:{})})));
  saveDay(d); S.open[S.date+':'+A.meal]=true; const name=S.settings.meals[A.meal]; closeAll(); toast('Registrado em '+name); go('hoje');
}
function runParse(){
  const text=$('#dito').value.trim(); if(!text){ $('#dito').focus(); setStatus('Escreva ou dite o que você comeu.'); return; }
  syncParser(); const res=PFParser.parse(text);
  if(res.meal!=null){ A.meal=res.meal; renderChips(); }
  const ok=res.items, miss=res.missing||[];
  A.items.push(...ok); renderConfirm(); $('#dito').value='';
  if(miss.length) setStatus('Não encontrei: '+miss.map(m=>'“'+m+'”').join(', ')+'. Use “+ Buscar alimento” para escolher.');
  else if(!ok.length) setStatus('Não entendi. Tente “200 g de arroz, 150 g de frango”.');
  else setStatus('');
}
function showSaved(){
  const box=$('#extraBox'); box.replaceChildren(); const yd=getDay(addDays(S.date,-1)); const rows=[];
  S.settings.meals.forEach((m,i)=>{ const it=yd?.meals?.[i]; if(it?.length) rows.push([m+' de ontem',it]); });
  for(const [k,it] of Object.entries(S.meals)) rows.push([k,it]);
  const c=el('div',{class:'card'},el('div',{class:'eyebrow',text:'Repetir uma refeição'}));
  if(!rows.length) c.append(el('p',{class:'note',style:'margin-top:6px',text:'Ainda não há refeições salvas nem registros de ontem. No cartão de uma refeição, toque em “Salvar como refeição”.'}));
  const l=el('div',{class:'results'});
  for(const [label,it] of rows) l.append(el('button',{onclick:()=>{ A.items.push(...it.map(x=>({...x,v:[...x.v],t:''}))); box.replaceChildren(); renderConfirm(); }},el('span',{text:label}),el('span',{class:'num',text:fmt(r10(totals(it)[0]))+' kcal'})));
  c.append(l); box.append(c);
}

/* ---------- ditado por voz ----------
   Safari (iOS 14.5+) tem webkitSpeechRecognition, mas no app instalado na Tela de Início ele costuma falhar
   ('service-not-allowed' / 'audio-capture') ou nem existir. Nesses casos o botão some e fica a dica do
   microfone do teclado, que funciona em qualquer lugar. */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition; let rec=null, micGen=0;
const IS_STANDALONE = window.navigator.standalone===true || window.matchMedia?.('(display-mode: standalone)').matches;
function stopMic(){ const r=rec; rec=null; micGen++; try{ r?.abort(); }catch(e){} $('#micBtn').classList.remove('rec'); $('#micBtn').setAttribute('aria-pressed','false'); }
function micUnavailable(why){ stopMic(); $('#micBtn').hidden=true; try{ sessionStorage.setItem('pf-nomic','1'); }catch(e){}
  setStatus(why+' Use o microfone do teclado (toque no campo de texto e no ícone de microfone do teclado).'); }
function toggleMic(){
  if(rec){ const r=rec; try{ r.stop(); }catch(e){ stopMic(); } return; }    // stop() entrega o que já foi falado
  let r; try{ r=new SR(); }catch(e){ micUnavailable('O ditado não está disponível aqui.'); return; }
  const gen=++micGen; rec=r; r.lang='pt-BR'; r.interimResults=true; r.continuous=false; r.maxAlternatives=1;
  const base=$('#dito').value.trim(); let finalText='', gotAny=false;
  r.onresult=e=>{ if(gen!==micGen) return; let interim=''; gotAny=true;
    for(let i=e.resultIndex;i<e.results.length;i++){ const t=e.results[i][0].transcript; if(e.results[i].isFinal) finalText+=t+' '; else interim+=t; }
    $('#dito').value=(base?base+', ':'')+(finalText+interim).trim(); };
  r.onerror=e=>{ if(gen!==micGen) return;
    if(e.error==='not-allowed') setStatus('Permita o microfone e o reconhecimento de fala em Ajustes do iPhone › Safari, ou use o microfone do teclado.');
    else if(e.error==='service-not-allowed'||e.error==='audio-capture') { micUnavailable(IS_STANDALONE?'No app da Tela de Início o iPhone não libera o ditado do site.':'O ditado não está disponível agora.'); return; }
    else if(e.error==='network') setStatus('O ditado precisa de internet. Use o microfone do teclado.');
    else if(e.error==='no-speech') setStatus('Não ouvi nada. Toque no microfone e fale de novo.');
    // 'aborted': silencioso
  };
  r.onend=()=>{ if(gen!==micGen) return; const fin=finalText.trim()||(gotAny&&$('#dito').value.trim()!==base); stopMic(); if(fin && $('#dito').value.trim()) runParse(); };
  try{ r.start(); $('#micBtn').classList.add('rec'); $('#micBtn').setAttribute('aria-pressed','true'); setStatus(''); }
  catch(e){ micUnavailable('Não consegui ligar o ditado.'); }
}

/* ---------- código de barras ----------
   html5-qrcode 2.3.8. Uma instância por vez: para ler foto, a câmera é parada antes (a lib não deixa
   ler arquivo com a câmera ligada) e a foto é lida em um elemento separado (#scanFileBox), para não
   disputar o #reader. scanGen invalida inícios atrasados (fechou a folha antes de a câmera abrir). */
let scanner=null, scanBusy=false, scanGen=0, scanStarting=null;
const SCAN_FORMATS = () => { const F=window.Html5QrcodeSupportedFormats||{}; return [F.EAN_13,F.EAN_8,F.UPC_A,F.UPC_E].filter(x=>x!=null); };
function closeScanSheet(){ stopScan(); $('#scanSheet').hidden=true; if($('#addSheet').hidden&&$('#pickSheet').hidden){ $('#scrim').hidden=true; lockScroll(false); } }
async function openScan(){
  if($('#addSheet').hidden){ openAdd(); }
  const gen=++scanGen; scanBusy=false;
  $('#scanSheet').hidden=false; $('#scrim').hidden=false; lockScroll(true); $('#scanType').hidden=true; $('#manualCode').value='';
  $('#scanMsg').textContent='Aponte a câmera para o código de barras.';
  if(!window.Html5Qrcode){ $('#scanMsg').textContent='O leitor não carregou. Verifique a internet ou digite o código.'; return; }
  if(!navigator.mediaDevices?.getUserMedia){ $('#scanMsg').textContent='Este navegador não libera a câmera aqui. Use uma foto ou digite o código.'; return; }
  if(scanStarting) await scanStarting.catch(()=>{});
  await stopScan(true);
  if(gen!==scanGen || $('#scanSheet').hidden) return;
  let s;
  try{
    s=new Html5Qrcode('reader',{formatsToSupport:SCAN_FORMATS(),verbose:false,useBarCodeDetectorIfSupported:true});
    scanner=s;
    scanStarting=s.start({facingMode:'environment'},
      {fps:10, qrbox:(w,h)=>({width:Math.max(60,Math.floor(Math.min(320,w*0.88))),height:Math.max(60,Math.floor(Math.min(170,h*0.55)))}),
       videoConstraints:{facingMode:'environment', width:{ideal:1280}, height:{ideal:720}}},
      code=>{ if(gen===scanGen) onCode(code); },()=>{});
    await scanStarting;
    if(gen!==scanGen || $('#scanSheet').hidden){                     // fechou enquanto a câmera abria
      if(scanner===s) scanner=null; try{ await s.stop(); }catch(e){} try{ s.clear(); }catch(e){} }
  }catch(e){
    if(gen===scanGen){ const m=String(e?.name||e||'');
      $('#scanMsg').textContent=/NotAllowed|Permission/i.test(m)?'Acesso à câmera negado. Permita em Ajustes do iPhone › Safari › Câmera, ou use uma foto.':'Não consegui abrir a câmera. Use uma foto ou digite o código.'; }
    if(scanner===s) scanner=null; try{ if(s?.isScanning) await s.stop(); }catch(e){} try{ s?.clear(); }catch(e){}
  } finally { scanStarting=null; }
}
async function stopScan(keepGen){
  if(!keepGen) scanGen++;
  const s=scanner; scanner=null; if(!s) return;
  try{ if(s.isScanning || s.getState?.()===2 || s.getState?.()===3) await s.stop(); }catch(e){}
  try{ s.clear(); }catch(e){}
}
async function onCode(code){
  if(scanBusy) return; scanBusy=true;
  try{ navigator.vibrate?.(40); }catch(e){}
  await stopScan(); $('#scanSheet').hidden=true; lockScroll(!$('#addSheet').hidden);
  try{ await handleCode(String(code).replace(/\D/g,'')); } finally { scanBusy=false; }
}
async function scanPhoto(f){
  $('#scanMsg').textContent='Lendo a foto…'; await stopScan();
  if(!window.Html5Qrcode){ $('#scanMsg').textContent='O leitor não carregou. Digite os números.'; return; }
  const gen=scanGen;
  const h=new Html5Qrcode('scanFileBox',{formatsToSupport:SCAN_FORMATS(),verbose:false});
  try{ const code=await h.scanFile(f,false); if(gen===scanGen) onCode(code); }
  catch(err){ if(gen===scanGen) $('#scanMsg').textContent='Não achei um código na foto. Tente mais de perto ou digite os números.'; }
  finally{ try{ h.clear(); }catch(e){} }
}
async function handleCode(code){
  if(!/^\d{8}$|^\d{12,14}$/.test(code)){ toast('Código inválido'); return; }
  const box=$('#extraBox'); box.replaceChildren();
  const p=S.products[code];
  if(p){ A.items.push({n:p.n,v:p.v,g:p.porcao||100,src:'prod',ref:'P'+code,t:''}); renderConfirm(); toast(p.n); return; }
  setStatus('Buscando o produto no Open Food Facts…',true);
  let off=navigator.onLine? await lookupOFF(code) : 'net'; setStatus('');
  if(off==='net'){ setStatus('Sem conexão com o Open Food Facts agora. Preencha com a embalagem ou tente de novo depois.'); off=null; }
  if(off && off.complete){ S.products[code]={n:off.n,v:off.v,porcao:off.porcao}; saveProducts();
    A.items.push({n:off.n,v:off.v,g:off.porcao,src:'prod',ref:'P'+code,t:''}); renderConfirm(); toast('Encontrado: '+off.n); return; }
  productForm(code, off);
}
function productForm(code, partial){
  const box=$('#extraBox'); const v=partial?.v||[];
  const f=(id,label,val,mode='decimal')=>el('div',{class:'field'},el('label',{for:id,text:label}),el('input',{id,type:'text',inputmode:mode,value:val?String(val).replace('.',','):''}));
  const name=el('input',{id:'pName',value:partial?.n&&!/^Produto \d/.test(partial.n)?partial.n:'',placeholder:'Ex.: Iogurte natural (marca)'});
  const card=el('div',{class:'card stack'},
    el('div',{class:'eyebrow',text:'Produto novo · '+code}),
    el('p',{class:'note',text:partial?'O produto está no Open Food Facts, mas sem tabela completa. Preencha com a embalagem.':'Não achei esse código. Preencha com a tabela nutricional da embalagem (valores por 100 g). Da próxima vez o código já encontra.'}),
    el('button',{class:'btn sec',text:'Ler a tabela por foto',onclick:()=>$('#labelFile').click()}),
    el('div',{class:'field'},el('label',{for:'pName',text:'Nome'}),name),
    el('div',{class:'grid3'},f('pKcal','kcal',v[0]),f('pProt','Proteína g',v[1]),f('pCarb','Carbo g',v[2]),f('pFat','Gordura g',v[3]),f('pFib','Fibra g',v[4]),f('pNa','Sódio mg',v[5])),
    f('pPorc','Porção da embalagem (g)',partial?.porcao&&partial.porcao!==100?partial.porcao:'', 'numeric'),
    el('div',{id:'ocrMsg',class:'note'}),
    el('button',{class:'btn',text:'Salvar produto',onclick:()=>{
      const num=id=>{ const x=parseFloat(($('#'+id).value||'').replace(/\.(?=\d{3}\b)/g,'').replace(',','.')); return isFinite(x)&&x>=0?x:0; };
      const kcal=num('pKcal'); if(!kcal){ toast('Informe pelo menos as calorias por 100 g'); return; }
      const nm=name.value.trim()||('Produto '+code); const vv=[kcal,num('pProt'),num('pCarb'),num('pFat'),num('pFib'),num('pNa'),...v.slice(6,12).map(x=>Number(x)||0)];
      while(vv.length<12) vv.push(0);
      const porc=Math.round(num('pPorc'))||100; S.products[code]={n:nm,v:vv,porcao:porc}; saveProducts();
      A.items.push({n:nm,v:vv,g:porc,src:'prod',ref:'P'+code,t:''}); box.replaceChildren(); renderConfirm(); toast('Produto salvo'); }}));
  box.replaceChildren(card); requestAnimationFrame(()=>card.scrollIntoView({behavior:'smooth',block:'start'}));
}
async function onLabel(file){
  if(!file) return; const msg=$('#ocrMsg'); if(!msg) return;
  msg.className='status'; msg.replaceChildren(el('div',{class:'spin'}),el('span',{text:'Lendo a tabela… (na primeira vez demora um pouco para carregar o leitor)'}));
  try{
    const r=await ocrLabel(file,pr=>{ const sp=msg.querySelector('span'); if(sp) sp.textContent='Lendo a tabela… '+Math.round(pr*100)+'%'; }); const set=(id,val)=>{ if(val!=null&&isFinite(val)) $('#'+id).value=String(Math.round(val*10)/10).replace('.',','); };
    set('pKcal',r.kcal); set('pProt',r.p); set('pCarb',r.c); set('pFat',r.f); set('pFib',r.fi); set('pNa',r.na);
    const got=['kcal','p','c','f'].filter(k=>r[k]!=null).length;
    if(r.servingG && !$('#pPorc').value) $('#pPorc').value=String(Math.round(r.servingG));
    const basis = r.basis==='serving-converted' ? ` A embalagem só traz valores por porção de ${fmt(r.servingG)} g; converti para 100 g.` : r.basis==='serving' ? ' Atenção: li valores POR PORÇÃO e não achei o tamanho da porção. Converta para 100 g antes de salvar.' : '';
    msg.className=got?'okline':'err'; msg.textContent = got ? `Li ${got} de 4 valores principais.${basis} Confira com a embalagem antes de salvar.` : 'Não consegui ler. Tente uma foto mais de perto, reta e com boa luz, ou digite os valores.';
  }catch(e){ console.warn(e); msg.className='err'; msg.textContent=navigator.onLine?'Não consegui ler a foto. Digite os valores.':'O leitor de texto precisa de internet na primeira vez. Digite os valores.'; }
}

/* ---------- escolher alimento ---------- */
let pickCb=null;
function openPick(cb){ pickCb=cb; $('#pickSheet').hidden=false; $('#scrim').hidden=false; lockScroll(true); $('#pickQ').value=''; renderPick(''); $('#pickQ').focus(); }
function closePick(){ $('#pickSheet').hidden=true; if($('#addSheet').hidden&&$('#scanSheet').hidden) { $('#scrim').hidden=true; lockScroll(false); } }
function renderPick(q){
  const res=searchFoods(q,60), box=$('#pickRes'); box.replaceChildren();
  if(!res.length){ box.append(el('p',{class:'note',text:'Nada encontrado. Tente outra palavra (ex.: “frango”, “pão”).'})); return; }
  for(const r of res) box.append(el('button',{onclick:()=>{ const f=foodFromRef(r.ref), cb=pickCb; pickCb=null; closePick(); if(f) cb?.(f); }},el('span',{text:r.name}),el('span',{class:'num',text:fmt(r.kcal)+' kcal/100 g'})));
}

/* ---------- eventos ---------- */
document.querySelectorAll('nav.tabs .t[data-v]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.v)));
$('#openAdd').addEventListener('click',()=>openAdd());
$('#openScan').addEventListener('click',()=>{ openAdd(); openScan(); });
document.addEventListener('keydown',e=>{ if(e.key==='Escape' && !$('#scrim').hidden){ if(!$('#pickSheet').hidden) closePick(); else if(!$('#scanSheet').hidden) closeScanSheet(); else closeAll(); } });
$('#scrim').addEventListener('click',()=>{ if(!$('#pickSheet').hidden) closePick(); else if(!$('#scanSheet').hidden) closeScanSheet(); else closeAll(); });
document.querySelector('[data-close]').addEventListener('click',closeAll);
document.querySelector('[data-close-pick]').addEventListener('click',closePick);
document.querySelector('[data-close-scan]').addEventListener('click',closeScanSheet);
$('#parseBtn').addEventListener('click',runParse);
$('#scanBtn').addEventListener('click',openScan);
$('#savedBtn').addEventListener('click',showSaved);
$('#scanPhotoBtn').addEventListener('click',()=>$('#scanFile').click());
$('#scanTypeBtn').addEventListener('click',()=>{ stopScan(); $('#scanMsg').textContent='Digite os números embaixo das barras.'; $('#scanType').hidden=false; $('#manualCode').focus(); });
$('#manualCode').addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); $('#manualCodeBtn').click(); } });
$('#manualCodeBtn').addEventListener('click',()=>{ const c=$('#manualCode').value.replace(/\D/g,''); if(!/^\d{8}$|^\d{12,14}$/.test(c)){ toast('O código tem 8 ou 13 dígitos'); return; } $('#manualCode').blur(); stopScan(); $('#scanSheet').hidden=true; handleCode(c); });
$('#scanFile').addEventListener('change',e=>{ const f=e.target.files[0]; e.target.value=''; if(f) scanPhoto(f); });
$('#labelFile').addEventListener('change',e=>{ onLabel(e.target.files[0]); e.target.value=''; });
let pq; $('#pickQ').addEventListener('input',e=>{ clearTimeout(pq); pq=setTimeout(()=>renderPick(e.target.value),120); });
$('#prevDay').addEventListener('click',()=>{ followToday(); S.date=addDays(S.date,-1); renderAll(); });
$('#nextDay').addEventListener('click',()=>{ followToday(); if(S.date<todayIso()){ S.date=addDays(S.date,1); renderAll(); } });
$('#dito').addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); runParse(); } });
let noMic=false; try{ noMic=sessionStorage.getItem('pf-nomic')==='1'; }catch(e){}
if(SR && !noMic){ $('#micBtn').hidden=false; $('#micBtn').addEventListener('click',toggleMic); }

/* ---------- início ---------- */
(async()=>{
  let rows=[]; try{ const r=await fetch('taco.json'); if(!r.ok) throw new Error(r.status); rows=await r.json(); }catch(e){ toast('Não consegui carregar a tabela de alimentos'); }
  PFParser.init(rows);
  loadState(); renderAll();
  if('serviceWorker' in navigator){
    // updateViaCache:'none' faz o iPhone sempre conferir se o sw.js mudou; quando a versão nova assume, recarrega uma vez
    const hadCtl=!!navigator.serviceWorker.controller; let reloaded=false;
    navigator.serviceWorker.addEventListener('controllerchange',()=>{ if(!hadCtl||reloaded) return; reloaded=true; flushDaySoon(); if($('#scrim').hidden) location.reload(); });
    navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(r=>{ document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible') r.update().catch(()=>{}); }); }).catch(()=>{});
  }
  try{ await Cloud.init(); }catch(e){ console.warn(e); }
  if(Cloud.user) await syncNow(true); else renderAll();
})();
