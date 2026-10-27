
(function(){
"use strict";
const $=id=>document.getElementById(id);
const KEY="bilancioFamigliaPWA_v14";
const BACKUP_KEY="bilancioFamigliaPWA_dailyBackups_v16";
const START="2026-01",BASE="2026-09";
const ML=["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const euro=n=>new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR",minimumFractionDigits:2}).format(Number(n||0));

let data;try{data=JSON.parse(localStorage.getItem(KEY)||"null")}catch(e){}
if(!data){data={months:{},rules:{},balance:null};localStorage.setItem(KEY,JSON.stringify(data))}
if(!data.months)data.months={};if(!data.rules)data.rules={};if(!Array.isArray(data.pendingIncome))data.pendingIncome=[];
if(!Object.prototype.hasOwnProperty.call(data,"balance"))data.balance=null;
function mergeOldPolicies(){
  if(!data.months)data.months={};if(!data.rules)data.rules={};
  for(const month of Object.values(data.months)){
    if(!Array.isArray(month.fixed))month.fixed=[];
    if(!Array.isArray(month.policies))month.policies=[];
    if(month.policies.length){
      const ids=new Set(month.fixed.map(x=>x.id));
      for(const item of month.policies){if(!ids.has(item.id)){month.fixed.push(item);ids.add(item.id)}}
      month.policies=[];
    }
  }
  for(const rule of Object.values(data.rules))if(rule.type==="policies")rule.type="fixed";
}
mergeOldPolicies();
// v64: one-time cleanup of v61-generated charges in existing installations.
// Only deterministic generated identifiers are deleted: names/amounts alone
// cannot distinguish user-entered expenses from template-generated ones.
(function removeOldTemplateCharges(){
 const flag='speseFamiglia_v64_templateCleanup';
 if(localStorage.getItem(flag)==='done')return;
 const ids=new Set([
  'v61-recurring-assicurazionegeneralimamma',
  'v61-recurring-mediobancacasa',
  'v61-recurring-canonefisso'
 ]);
 let changed=false;
 for(const id of ids){if(Object.prototype.hasOwnProperty.call(data.rules,id)){delete data.rules[id];changed=true}}
 for(const month of Object.values(data.months||{})){
  if(!month||typeof month!=='object')continue;
  for(const type of ['fixed','policies','needs']){
   if(!Array.isArray(month[type]))continue;
   const before=month[type].length;
   month[type]=month[type].filter(x=>{
    if(!x||typeof x!=='object')return true;
    if(ids.has(x.ruleId))return false;
    // v61 materialization always used this exact generated ID.
    return ![...ids].some(id=>typeof x.id==='string'&&x.id==='i-'+id+'-'+Object.keys(data.months).find(k=>data.months[k]===month));
   });
   if(month[type].length!==before)changed=true;
  }
 }
 // The v61 auto-seeded balance was not tagged as automatic. It is impossible
 // to distinguish it safely from a user-entered 396.35 EUR balance; retain it.
 try{
  if(changed)localStorage.setItem(KEY,JSON.stringify(data));
  localStorage.setItem(flag,'done');
 }catch(e){console.warn('Pulizia dati preimpostati non completata',e)}
})();

const now=new Date();const realKey=now.getFullYear()+"-"+String(now.getMonth()+1).padStart(2,"0");
let cy=Math.max(2026,now.getFullYear()),cm=(cy===now.getFullYear()?now.getMonth():0);
function v75GoToCurrentMonth(){const d=new Date();const y=Math.max(2026,d.getFullYear()),m=d.getFullYear()<2026?0:d.getMonth();if(cy!==y||cm!==m){cy=y;cm=m;render();}}
let pendingEdit=null,pendingDelete=null,lastDetail=null;

function key(y=cy,m=cm){return y+"-"+String(m+1).padStart(2,"0")}
function split(k){const [y,m]=k.split("-").map(Number);return {y,m:m-1}}
function cmp(a,b){return a.localeCompare(b)}
function prev(k){const {y,m}=split(k),d=new Date(y,m-1,1);return key(d.getFullYear(),d.getMonth())}
function blank(){return {income:[],fixed:[],policies:[],needs:[]}}
function ensure(k){if(!data.months[k])data.months[k]=blank();if(!data.months[k].fixed)data.months[k].fixed=[];if(!data.months[k].policies)data.months[k].policies=[];if(!data.months[k].needs)data.months[k].needs=[];if(!data.months[k].income)data.months[k].income=[]}
function label(k=key()){const {y,m}=split(k);return ML[m]+" "+y}
function future(k=key()){return cmp(k,realKey)>0}

function amountForRule(rule,k){const {y,m}=split(k),s=rule.schedule||{kind:"monthly"};if(s.kind==="monthly")return rule.amount;if(s.kind==="annual")return m===s.month?rule.amount:null;if(s.kind==="selectedYearly")return s.amounts&&s.amounts[m]!=null?Number(s.amounts[m]):null;if(s.kind==="selectedOneYear")return y===s.year&&s.amounts&&s.amounts[m]!=null?Number(s.amounts[m]):null;return null}
function ruleActive(rule,k){if(cmp(k,rule.start)<0)return false;if(rule.end&&cmp(k,rule.end)>0)return false;if((rule.skip||[]).includes(k))return false;return amountForRule(rule,k)!=null}
function materialize(k){if(cmp(k,BASE)<0)return;ensure(k);Object.values(data.rules).forEach(rule=>{if(!ruleActive(rule,k))return;const amt=amountForRule(rule,k),a=data.months[k][rule.type];if(!a.some(x=>x.ruleId===rule.id || (rule.id.startsWith("v61-recurring-") && String(x.name).toLowerCase().replace(/[^a-z0-9]/g,"")===String(rule.name).toLowerCase().replace(/[^a-z0-9]/g,"") && Math.abs(Number(x.amount)-amt)<.01)))a.push({id:"i-"+rule.id+"-"+k,name:rule.name,amount:amt,ruleId:rule.id,expenseCategory:rule.expenseCategory||expenseCategory(rule.name),categoryManual:!!rule.categoryManual})})}
function items(type,k=key()){ensure(k);if(cmp(k,BASE)>=0)materialize(k);return data.months[k][type]}
function sum(type){return items(type).reduce((s,x)=>s+Number(x.amount||0),0)}
function expenses(){return sum("fixed")+sum("policies")+sum("needs")}
function netForMonth(k){
  const inc=items("income",k).reduce((s,x)=>s+Number(x.amount||0),0);
  const out=["fixed","policies","needs"].reduce((tot,t)=>tot+items(t,k).reduce((s,x)=>s+Number(x.amount||0),0),0);
  return inc-out;
}
function nextMonthKey(k){const {y,m}=split(k),d=new Date(y,m+1,1);return key(d.getFullYear(),d.getMonth())}
function previousMonthKey(k){const {y,m}=split(k),d=new Date(y,m-1,1);return key(d.getFullYear(),d.getMonth())}
function balanceConfigured(){return !!(data.balance&&Number.isFinite(Number(data.balance.amount))&&data.balance.anchorMonth)}
function projectedBalance(k=key()){
  if(!balanceConfigured())return null;
  const anchor=data.balance.anchorMonth;
  const base=Number(data.balance.amount);
  if(data.balance.anchorIsCurrent){
    if(k===anchor)return base;
    if(cmp(k,anchor)>0){let value=base,cur=nextMonthKey(anchor),guard=0;while(cmp(cur,k)<=0&&guard++<1200){value+=netForMonth(cur);cur=nextMonthKey(cur)}return value;}
    let value=base,cur=anchor,guard=0;while(cmp(cur,k)>0&&guard++<1200){value-=netForMonth(cur);cur=previousMonthKey(cur)}return value;
  }
  if(cmp(k,anchor)>=0){
    let total=base;
    let cur=anchor,guard=0;
    while(cmp(cur,k)<=0&&guard++<1200){total+=netForMonth(cur);cur=nextMonthKey(cur)}
    return total;
  }
  // Per i mesi precedenti mostriamo una stima retroattiva: togliamo i netti
  // dall'ancora fino al mese successivo a quello visualizzato.
  let total=base;
  let cur=previousMonthKey(anchor),guard=0;
  while(cmp(cur,k)>=0&&guard++<1200){total-=netForMonth(cur);cur=previousMonthKey(cur)}
  return total;
}
function save(){try{localStorage.setItem(KEY,JSON.stringify(data))}catch(e){alert("Salvataggio non riuscito: memoria del browser non disponibile o piena. Esporta un backup e libera spazio.");return}try{dailyBackup()}catch(e){console.warn("Backup automatico non disponibile",e)}render()}

function meta(item){if(!item.ruleId)return"Solo questo mese";const r=data.rules[item.ruleId];if(!r)return"Ricorrente";const s=r.schedule||{kind:"monthly"};if(s.kind==="monthly")return"Ogni mese";if(s.kind==="annual")return"Ogni "+ML[s.month];if(s.kind==="selectedYearly")return"Mesi scelti ogni anno";if(s.kind==="selectedOneYear")return"Mesi scelti solo "+s.year;return"Ricorrente"}

function moveIncomeToPending(item){
 const month=key();

 const arr=items('income',month),index=arr.findIndex(x=>x.id===item.id);
 if(index<0)return false;
 const original=arr[index];
 data.pendingIncome.push({id:'waiting-'+Date.now()+'-'+Math.random().toString(36).slice(2),name:original.name,amount:Number(original.amount),originMonth:month,originId:original.id,originRuleId:original.ruleId||null});
 if(original.ruleId&&data.rules[original.ruleId]){
  const rule=data.rules[original.ruleId];if(!Array.isArray(rule.skip))rule.skip=[];
  if(!rule.skip.includes(month))rule.skip.push(month);
 }
 arr.splice(index,1);
 save();
 return true;
}
function renderPending(){
 const el=$("pendingRows");if(!el)return;el.innerHTML="";const total=data.pendingIncome.reduce((sum,x)=>sum+(Number(x.amount)||0),0);if($("pendingSum"))$("pendingSum").textContent=euro(total);
 if(!data.pendingIncome.length){el.innerHTML='<div class="incomeRow"><div class="name">Nessuna entrata in attesa</div></div>';return}
 data.pendingIncome.forEach(x=>{
  const row=document.createElement('div');row.className='pendingRow';
  const info=document.createElement('div');info.innerHTML='<div class="name"></div><small></small>';
  info.querySelector('.name').textContent=x.name;
  info.querySelector('small').textContent=x.originMonth?'Prevista: '+label(x.originMonth):'Data da definire';
  const amount=document.createElement('strong');amount.textContent=euro(x.amount);
  const btn=document.createElement('button');btn.textContent='✓ Ricevuto';
  btn.onclick=()=>{
   const receiptMonth=key();
   if(!confirm('Confermi di aver ricevuto '+euro(x.amount)+'? Verrà registrato in '+label(receiptMonth)+'.'))return;
   ensure(receiptMonth);
   data.months[receiptMonth].income.push({id:'p-'+Date.now()+'-'+Math.random().toString(36).slice(2),name:x.name,amount:Number(x.amount),receivedFromPending:true,originMonth:x.originMonth||null});
   data.pendingIncome=data.pendingIncome.filter(y=>y.id!==x.id);save();
  };
  const del=document.createElement('button');del.textContent='✕';del.title='Elimina';
  del.onclick=()=>{if(confirm('Eliminare definitivamente questa entrata in attesa?')){data.pendingIncome=data.pendingIncome.filter(y=>y.id!==x.id);save()}};
  row.append(info,amount,btn,del);el.appendChild(row);
 });
}
function renderIncome(){
  const el=$("incomeRows"),a=items("income");el.innerHTML="";
  if(!a.length){
    el.innerHTML='<div class="incomeRow"><div class="incomeDay">–</div><div class="name">Nessuna entrata</div><div class="amt">—</div><div></div></div>';
    return;
  }
  a.forEach(x=>{
    const r=document.createElement("div");
    r.className="incomeRow";
    r.innerHTML='<div class="incomeDay"></div><div><div class="name"></div><div class="meta"></div></div><div class="amt"></div><div class="dots">⋮</div>';
    r.querySelector(".incomeDay").textContent=dayOf(x)==null?"–":String(dayOf(x)).padStart(2,"0");
    r.querySelector(".name").textContent=x.name;
    r.querySelector(".meta").textContent=meta(x);
    r.querySelector(".amt").textContent=euro(x.amount);
    r.onclick=e=>{e.stopPropagation();openEdit("income",x)};
    const dots=r.querySelector('.dots');dots.style.cursor='pointer';dots.setAttribute('role','button');dots.setAttribute('aria-label','Opzioni entrata');dots.tabIndex=0;
    const showActions=e=>{e.stopPropagation();openEdit('income',x)};
    dots.onclick=showActions;dots.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();showActions(e)}};
    el.appendChild(r)
  })
}
function dayOf(item){const r=item.ruleId&&data.rules[item.ruleId];const v=item.dueDay??(r&&r.dueDay);return Number.isInteger(Number(v))&&Number(v)>=1&&Number(v)<=31?Number(v):null}
function readDay(id){const v=$(id).value.trim();if(!v)return null;const n=Number(v);if(!Number.isInteger(n)||n<1||n>31)throw new Error("Inserisci un giorno da 1 a 31.");return n}
function shortExpenseName(name){
 const raw=String(name||'').trim(),n=raw.toLowerCase();
 const known=[[/condominio talea/, 'Condominio Talea'],[/condominio vico/, 'Condominio Vico'],[/enel/, 'Enel Energia'],[/agos|suzuki ignis finanziamento/, 'Rata finanziamento'],[/sky italia/, 'Sky'],[/uci matera/, 'Cinema UCI'],[/apple\.com|apple com/, 'Apple'],[/deliveroo/, 'Deliveroo'],[/old wild west/, 'Old Wild West'],[/pellegrino lucia/, 'Alimentari Pellegrino'],[/crai/, 'Supermercato Crai'],[/lindt/, 'Lindt'],[/disposizione di giroconto/, 'Giroconto'],[/agenzia delle entrate/, 'Agenzia Entrate'],[/commissione.*bonifico/, 'Commissione bonifico'],[/commissione.*(cbill|pagopa)/, 'Commissione PagoPA'],[/pagamento tramite pos/, 'Pagamento POS'],[/prelievo sportello/, 'Prelievo contanti'],[/intrend/, 'Intrend'],[/klarna/, 'Klarna'],[/bonifico.*farmacia montesano/, 'Bonifico Farmacia'],[/coin casa|^coin\b/, 'Coin'],[/lavatrice/, 'Lavatrice'],[/polizza/, 'Assicurazione']];
 for(const [re,label] of known)if(re.test(n))return label;
 let clean=raw.replace(/\b(bonifico istantaneo disposto da|bonifico disposto a favore di|addebito diretto disposto a favore di)\b/ig,'').replace(/\b(generi alimentari e supermercato|ristoranti e bar|rate mutuo e finanziamento|domiciliazioni e utenze|altre uscite|bonifici ricevuti|spese condominiali|tempo libero varie|casa varie)\b/ig,'').replace(/\s+/g,' ').trim();
 return clean.length>32?clean.slice(0,29).trim()+'…':clean||'Spesa';
}
const categoryPalette=[['Casa','#15a7e5'],['Alimentari','#48ad54'],['Trasporti','#ff9a12'],['Finanziamenti','#9b6bd4'],['Tempo libero','#e2b900'],['Shopping','#f2463d'],['Commissioni','#77859a'],['Altro','#c6d2df'],['Salute','#e65b86'],['Famiglia e scuola','#e39f38'],['Ristoranti e bar','#e27845'],['Abbonamenti','#6e7ed6'],['Assicurazioni','#5489c0'],['Viaggi','#23a89d'],['Tasse','#ac794e'],['Animali','#a88962']];
// v48: categorie compatibili, correzioni manuali e catalogo condiviso.
const baseExpenseCategories=categoryPalette.map(row=>row.slice());
const customExpenseColors=['#7d8fd1','#49a89b','#bf81b8','#b79752','#7d9e62','#8b91a0'];
function registerExistingCategories(){
  // Le categorie importate restano disponibili con il loro nome originale.
  const known=new Set(baseExpenseCategories.map(([name])=>name)),custom=new Map();
  function add(name,color){
    if(typeof name!=='string'||!name.trim()||known.has(name)||custom.has(name))return;
    let hash=0;for(const ch of name)hash=(hash*31+ch.charCodeAt(0))>>>0;
    custom.set(name,{name,color:typeof color==='string'&&/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(color)?color:customExpenseColors[hash%customExpenseColors.length]});
  }
  function read(value,key){
    if(Array.isArray(value)){add(value[0],value[1]);return}
    if(value&&typeof value==='object'){add(value.name||value.label||value.category||key||value.id,value.color);return}
    if(typeof value==='string'){if(key)add(key,value);else add(value)}
  }
  const extra=data.customCategories;
  if(Array.isArray(extra))extra.forEach(value=>read(value));
  else if(extra&&typeof extra==='object')Object.entries(extra).forEach(([name,value])=>read(value,name));
  for(const rule of Object.values(data.rules||{}))if(rule&&rule.type!=='income')add(rule.expenseCategory);
  for(const month of Object.values(data.months||{}))if(month&&typeof month==='object'){
    for(const type of ['fixed','needs','policies'])if(Array.isArray(month[type])){
      for(const item of month[type])if(item)add(item.expenseCategory);
    }
  }
  for(const category of Object.values(data.categoryLearning||{}))add(category);
  categoryPalette.splice(0,categoryPalette.length,...baseExpenseCategories.map(row=>row.slice()),...[...custom.values()].map(({name,color})=>[name,color]));
  data.customCategories=[...custom.values()];
}
function syncCategoryOptions(){
  registerExistingCategories();
  for(const id of ['newExpenseCategory','editExpenseCategory']){
    const select=$(id);if(!select)continue;
    // Una sincronizzazione della home non interrompe una scelta nel modulo aperto.
    const modal=select.closest('.modal');if(modal&&modal.classList.contains('open'))continue;
    const names=['__v65_create__',...categoryPalette.map(([name])=>name)],existing=[...select.options].map(option=>option.value);
    if(existing.length===names.length&&existing.every((name,index)=>name===names[index]))continue;
    const selected=select.value;
    const options=names.map(name=>{const option=document.createElement('option');option.value=name;option.textContent=name==='__v65_create__'?'＋ Crea categoria':name;return option});
    select.replaceChildren(...options);
    if(names.includes(selected))select.value=selected;
  }
}
syncCategoryOptions();
let v65CategoryTarget=null;
for(const id of ['newExpenseCategory','editExpenseCategory'])$(id).addEventListener('change',e=>{if(e.target.value==='__v65_create__'){v65CategoryTarget=id;e.target.value='Altro';$('v65CreateCategoryModal').classList.add('open');document.activeElement?.blur()}});
$('v65CategorySave').onclick=()=>{const name=$('v65CategoryName').value.trim(),color=$('v65CategoryColor').value;if(!name)return alert('Inserisci un nome.');if(categoryPalette.some(([n])=>n.toLowerCase()===name.toLowerCase()))return alert('Categoria già presente.');data.customCategories=data.customCategories||[];data.customCategories.push({name,color});registerExistingCategories();for(const id of ['newExpenseCategory','editExpenseCategory']){const select=$(id);const opt=document.createElement('option');opt.value=name;opt.textContent=name;select.append(opt)}if(v65CategoryTarget)$(v65CategoryTarget).value=name;if(v65CategoryTarget==='newExpenseCategory')newCategoryTouched=true;$('v65CreateCategoryModal').classList.remove('open');$('v65CategoryName').value='';save()};
// Motore interamente locale: i nomi e gli importi non vengono inviati online.
function normExpense(n){return String(n||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ')}
function learnedCategory(name){const n=normExpense(name),memory=data.categoryLearning||{};return categoryPalette.some(([category])=>category===memory[n])?memory[n]:null}
function learnCategory(name,category){if(!name||!categoryPalette.some(([c])=>c===category))return;data.categoryLearning=data.categoryLearning||{};data.categoryLearning[normExpense(name)]=category}
function inferExpense(name){
  const n=normExpense(name),learned=learnedCategory(name);
  if(learned)return {category:learned,confidence:1,source:'imparato'};
  if(/\bbenzina e spese personali\b/.test(n))return {category:'Altro',confidence:.2,source:'da verificare'};
  const rules=[
    ['Commissioni',/\b(commissione|commissioni|quota carta banca|canone carta|spese bancarie|costo bonifico|canone conto|pagopa commissione|cbill commissione)\b/,.98],
    ['Assicurazioni',/\b(assicurazione|assicurazioni|polizza|polizze|premio assicurativo|rc auto|rca|rc moto|unipol|allianz|generali|genertel|reale mutua)\b/,.97],
    ['Animali',/\b(veterinario|veterinaria|veterinari|clinica veterinaria|farmacia veterinaria|pet shop|arcaplanet|maxi zoo|zooplus|croccantini|crocchette|mangime|lettiera|toelettatura|cibo cane|cibo gatto)\b/,.96],
    ['Salute',/\b(farmacia|farmacie|parafarmacia|farmaco|farmaci|medicinale|medicinali|medico|medica|visita specialistica|dentista|odontoiatra|oculista|analisi cliniche|analisi sangue|ticket sanitario|ospedale|fisioterapia|fisioterapista|psicologo|psicologa|ottico|occhiali|sanitaria)\b/,.96],
    ['Finanziamenti',/\b(agos|prestito|finanziamento|mutuo|leasing|rata prestito|rata finanziamento|creditis|credifarma|klarna)\b/,.97],
    ['Famiglia e scuola',/\b(asilo|nido|scuola(?! guida)|mensa scolastica|mensa scuola|retta scolastica|libri scolastici|universita|istruzione|baby sitter|babysitter|pannolini|materiale scolastico|doposcuola|ripetizioni)\b/,.95],
    ['Tasse',/\b(f24|imu|tari|tasi|irpef|imposta|imposte|tassa|tasse|tributo|tributi|bollo|superbollo|agenzia delle entrate|agenzia entrate|riscossione|multa|multe|sanzione|sanzioni)\b/,.97],
    ['Ristoranti e bar',/\b(ristorante|ristoranti|ristorazione|pizzeria|pizze|pizza|deliveroo|glovo|just eat|old wild west|bar|caffe|caffetteria|colazione|aperitivo|apericena|pub|sushi|trattoria|osteria|gelato|gelateria|cena fuori|pranzo fuori)\b/,.96],
    ['Viaggi',/\b(hotel|albergo|booking|airbnb|bed breakfast|b b|vacanza|vacanze|viaggio|viaggi|voli|volo|ryanair|easyjet|logitravel|villaggio turistico|campeggio|agriturismo)\b/,.95],
    ['Trasporti',/\b(benzina|gasolio|carburante|rifornimento|distributore|eni station|q8|tamoil|ip carburanti|parcheggio|parcheggi|telepass|pedaggio|autostrada|taxi|uber|trenitalia|italo|autobus|metro|metropolitana|scuola guida|5 guide|patente|tagliando|pneumatici|gomme|revisione auto|auto milano|moto|t cross|fz6|hornet|officina|meccanico)\b/,.96],
    ['Abbonamenti',/\b(spotify|netflix|disney|dazn|now tv|sky|icloud|apple icloud|youtube premium|amazon prime|prime video|apple one|microsoft 365|app store abbonamento|abbonamento|abbonamenti)\b/,.95],
    ['Casa',/\b(condominio|enel|energia elettrica|bolletta|bollette|gas domestico|acquedotto|affitto|riscaldamento|utenze|fastweb|fibra|lavatrice|arredamento|ikea|leroy merlin|talea|garage|idraulico|elettricista|acqua luce gas)\b/,.95],
    ['Alimentari',/\b(crai|conad|coop|lidl|eurospin|esselunga|supermercato|supermercati|spesa alimentare|alimentari|macelleria|panificio|fruttivendolo|lindt|cibo roma|cibo|alimentazione|spesa supermercato)\b/,.96],
    ['Shopping',/\b(regalo|regali|natale|san valentino|festa della mamma|intrend|zalando|zara|h m|abbigliamento|scarpe|vestiti|shopping|coin|apple store|iphone nuovo|macbook|ipad nuovo|profumeria)\b/,.94],
    ['Shopping',/\bamazon\b/,.7],
    ['Tempo libero',/\b(cinema|uci|concerto|teatro|museo|palestra|piscina|sport|hobby|videogioco|videogiochi|weekend|fine settimana|uscite milano)\b/,.93]
  ];
  // Prima i beneficiari riconoscibili: anche un "bonifico farmacia" resta Salute.
  for(const [category,re,confidence] of rules)if(re.test(n))return {category,confidence,source:'regola'};
  if(/\b(carta credito|carta di credito|giroconto|prelievo|trasferimento|bonifico|pagamento tramite pos|acquisti vari|spese personali)\b/.test(n))return {category:'Altro',confidence:.2,source:'da verificare'};
  return {category:'Altro',confidence:.1,source:'da verificare'};
}
function expenseCategory(name){return inferExpense(name).category}
function categoryForItem(item){return categoryPalette.some(([name])=>name===item.expenseCategory)?item.expenseCategory:expenseCategory(item.name)}
function backfillExpenseCategories(force=false){
  // La revisione esplicita è l'unica operazione che riclassifica l'archivio.
  if(force!==true)return 0;
  registerExistingCategories();let changed=0;
  function review(item){
    if(!item||item.categoryManual)return;
    const guess=inferExpense(item.name);
    if(item.expenseCategory!==guess.category){item.expenseCategory=guess.category;changed++}
    item.categoryConfidence=guess.confidence;item.categorySource=guess.source==='imparato'?'imparato':'local';
  }
  for(const rule of Object.values(data.rules||{}))if(rule&&rule.type!=='income')review(rule);
  for(const month of Object.values(data.months||{}))if(month&&typeof month==='object'){
    for(const type of ['fixed','needs','policies'])if(Array.isArray(month[type]))month[type].forEach(review);
  }
  return changed;
}
let v59CategoryTimer=null;
function renderCategories(){
 const all=v48CategoryEntries(),totals=new Map(),entries=new Map();
 for(const entry of all){const x=entry.item,value=Number(x.amount)||0;if(value<=0)continue;const c=categoryForItem(x);totals.set(c,(totals.get(c)||0)+value);if(!entries.has(c))entries.set(c,[]);entries.get(c).push(entry)}
 const total=[...totals.values()].reduce((a,b)=>a+b,0),donut=$('categoryDonut'),legend=$('categoryLegend'),center=$('categoryCenter'),swipe=$('categorySwipe');
 $('categoryMonth').textContent=ML[cm]+' '+cy;legend.replaceChildren();swipe.replaceChildren();
 const review=all.filter(({item})=>v48NeedsReview(item)).length;
 $('smartStatus').textContent=totals.size+' categorie'+(review?' · '+review+' da verificare':' · tutto classificato');
 if(v59CategoryTimer){clearTimeout(v59CategoryTimer);v59CategoryTimer=null}
 if(!total){donut.style.background='#e9edf4';center.textContent='Nessuna spesa';return}
 const sorted=[...totals.keys()].map(name=>[name,(categoryPalette.find(x=>x[0]===name)||[name,'#9ca3af'])[1]]).sort((a,b)=>totals.get(b[0])-totals.get(a[0]));
 let start=0;donut.style.background='conic-gradient('+sorted.map(([name,color])=>{const end=start+totals.get(name)/total*100,part=color+' '+start+'% '+end+'%';start=end;return part}).join(',')+')';
 let activeSlide=-1;
 function centerShow(name){center.replaceChildren();const label=document.createElement('div');label.textContent=name||'Mese';const value=document.createElement('strong');value.textContent=euro(name?totals.get(name):total);const hint=document.createElement('div');hint.textContent=name?(totals.get(name)/total*100).toLocaleString('it-IT',{maximumFractionDigits:1})+'%':'Uscite';hint.style.fontSize='9px';center.append(label,value,hint);legend.querySelectorAll('[data-cat]').forEach(x=>x.classList.toggle('active',x.dataset.cat===name))}
 function categoryResetTimer(){if(v59CategoryTimer)clearTimeout(v59CategoryTimer);v59CategoryTimer=setTimeout(()=>{centerShow(null);v59CategoryTimer=null},5000)}
 function preview(name){centerShow(name);categoryResetTimer()}
 function goTo(i){if(v59CategoryTimer){clearTimeout(v59CategoryTimer);v59CategoryTimer=null}activeSlide=i;centerShow(i<0?null:sorted[i][0]);categoryResetTimer();if(i>=0){swipe.children[i]?.scrollIntoView({behavior:'smooth',block:'nearest',inline:'start'})}else{swipe.scrollTo({left:0,behavior:'smooth'})}}
 let expanded=false;
 function drawLegend(){legend.replaceChildren();for(const [i,[name,color]] of sorted.entries()){if(i>=5&&!expanded)continue;const btn=document.createElement('button');btn.type='button';btn.dataset.cat=name;const dot=document.createElement('span');dot.className='categoryDot';dot.style.background=color;const title=document.createElement('span');title.textContent=name;const pct=document.createElement('span');pct.className='categoryPercent';pct.textContent=(totals.get(name)/total*100).toLocaleString('it-IT',{maximumFractionDigits:0})+'%';btn.append(dot,title,pct);btn.onclick=()=>preview(name);legend.append(btn)}if(sorted.length>5){const more=document.createElement('button');more.type='button';more.className='categoryMore';more.textContent=expanded?'− Mostra meno':'＋ Altre '+(sorted.length-5)+' categorie · vedi tutte';more.onclick=()=>{expanded=!expanded;drawLegend();centerShow(activeSlide<0?null:sorted[activeSlide][0])};legend.append(more)}}
 drawLegend();
 sorted.forEach(([name,color],index)=>{const slide=document.createElement('section');slide.className='categorySlide';slide.setAttribute('aria-label','Categoria '+name);const title=document.createElement('div');title.className='categorySlideTitle';const label=document.createElement('span');label.textContent=name;label.style.color=color;const summary=document.createElement('small');summary.textContent=euro(totals.get(name))+' · '+entries.get(name).length+' mov.';title.append(label,summary);slide.append(title);const list=document.createElement('div');slide.append(list);const rows=entries.get(name).slice().sort((a,b)=>(dayOf(a.item)??0)-(dayOf(b.item)??0));let showAll=false;function paint(){list.replaceChildren();for(const {item} of rows.slice(0,showAll?rows.length:6)){const row=document.createElement('div');row.className='categorySlideRow';const day=document.createElement('span');day.className='categorySlideDay';day.textContent=dayOf(item)==null?'—':String(dayOf(item)).padStart(2,'0');const nm=document.createElement('span');nm.className='categorySlideName';nm.textContent=shortExpenseName(item.name);const amt=document.createElement('span');amt.className='categorySlideAmt';amt.textContent=euro(item.amount);row.append(day,nm,amt);list.append(row)}if(rows.length>6){const more=document.createElement('button');more.type='button';more.className='categorySlideMore';more.textContent=showAll?'Mostra solo 6':'Vedi tutte le '+rows.length+' voci';more.onclick=()=>{showAll=!showAll;paint()};list.append(more)}}paint();swipe.append(slide)});
 const hint=document.createElement('div');hint.className='categorySlideHint';hint.textContent='← Scorri le categorie →';swipe.after(hint);const oldHint=swipe.parentElement.querySelectorAll('.categorySlideHint');for(let i=0;i<oldHint.length-1;i++)oldHint[i].remove();
 let scrollTimer=null;swipe.onscroll=()=>{if(scrollTimer)clearTimeout(scrollTimer);scrollTimer=setTimeout(()=>{const width=swipe.children[0]?.getBoundingClientRect().width||1;const gap=10;const idx=Math.max(0,Math.min(sorted.length-1,Math.round(swipe.scrollLeft/(width+gap))));activeSlide=idx;if(v59CategoryTimer){clearTimeout(v59CategoryTimer);v59CategoryTimer=null}centerShow(sorted[idx][0]);categoryResetTimer()},90)};
 centerShow(null);donut.onclick=()=>{if(activeSlide<0){goTo(0)}else{goTo(-1)}};donut.setAttribute('role','button');donut.tabIndex=0;donut.title='Tocca per vedere il totale del mese';donut.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();donut.click()}};
}

let v48SelectedCategory=null;
function v48CategoryEntries(){return ['fixed','needs','policies'].flatMap(type=>items(type).map(item=>({type,item})));}
function v48NeedsReview(x){const guess=inferExpense(x.name);return !x.categoryManual&&(guess.confidence<.9||categoryForItem(x)!==guess.category);}
function renderCol(type,id){
  const el=$(id),a=items(type).slice().sort((x,y)=>(dayOf(x)??32)-(dayOf(y)??32));
  el.innerHTML="";
  if(!a.length){el.innerHTML='<div class="colItem"><div class="colTop"><div class="colName">—</div></div></div>';return}
  a.forEach(x=>{
    const r=document.createElement("div");r.className="colItem";
    r.innerHTML='<div class="colTop"><div class="colDay"></div><div class="colBody"><div class="colName"></div><div class="colAmt"></div><div class="colMeta"></div></div><div class="colDots">⋮</div></div>';
    r.querySelector(".colDay").textContent=dayOf(x)===null?"–":String(dayOf(x)).padStart(2,"0");
    r.querySelector(".colName").textContent=shortExpenseName(x.name);r.querySelector(".colName").title=x.name;
    r.querySelector(".colAmt").textContent=euro(x.amount);
    r.querySelector(".colMeta").textContent=meta(x);
    r.onclick=e=>{e.stopPropagation();v65OpenItem(type,x)};el.appendChild(r);
  });
}
function v48FitTwoRows(){
  const grid=document.querySelector('.cols');
  const lists=[$('fixedRows'),$('needsRows')];
  const positions=lists.map(list=>list.scrollTop);
  grid.style.removeProperty('--v48-two-item-size');
  grid.style.removeProperty('--v48-two-list-size');
  if(!window.matchMedia('(max-width:600px)').matches||document.body.classList.contains('v48Expanded'))return;
  // Keep the approved card size whenever two full rows already fit. If a
  // name wraps, both columns grow just enough to show two complete rows.
  const paddingTop=parseFloat(getComputedStyle(lists[0]).paddingTop)||0;
  const baseline=Math.max(...lists.map(list=>list.getBoundingClientRect().height));
  const natural=Math.max(0,...lists.flatMap(list=>Array.from(list.children).slice(0,2).map(row=>row.getBoundingClientRect().height)));
  const rowHeight=Math.ceil(Math.max((baseline-paddingTop)/2,natural)*64)/64;
  grid.style.setProperty('--v48-two-item-size',rowHeight+'px');
  grid.style.setProperty('--v48-two-list-size',(paddingTop+2*rowHeight)+'px');
  lists.forEach((list,index)=>{list.scrollTop=positions[index]});
}
function renderBalance(){
  const k=key(),v=projectedBalance(k),title=$("balanceTitle"),value=$("balanceTotal"),sub=$("balanceSub");
  if(v===null){title.textContent="SALDO TOTALE";value.textContent="Imposta saldo";sub.textContent="Inserisci il saldo reale del conto per attivare le previsioni";return}
  const anchor=data.balance.anchorMonth;
  title.textContent=k===anchor?"SALDO FINALE PREVISTO":"SALDO PREVISTO";
  value.textContent=euro(v);
  if(k===anchor){
    sub.textContent="Saldo attuale "+euro(data.balance.amount)+" + utile mese "+euro(netForMonth(k))+" · tocca per aggiornare";
  }else if(cmp(k,anchor)>0){
    sub.textContent="Proiezione automatica da "+label(anchor)+" · utile mese "+euro(netForMonth(k));
  }else{
    sub.textContent="Stima retroattiva rispetto al saldo aggiornato · "+label(anchor);
  }
}
function render(){syncCategoryOptions();renderPending();$("monthName").textContent=ML[cm];$("monthYear").textContent=cy;$("futureBanner").style.display=future()?"block":"none";$("incomeTotal").textContent=euro(sum("income"));renderIncome();$("fixedTotal").textContent=euro(sum("fixed"));renderCol("fixed","fixedRows");$("needsTotal").textContent=euro(sum("needs"));renderCol("needs","needsRows");renderCategories();$("expenseTotal").textContent=euro(expenses());$("allExpenses").textContent=euro(expenses());$("savingTotal").textContent=euro(sum("income")-expenses());renderBalance();v48FitTwoRows()}
$("prevMonth").onclick=()=>{const d=new Date(cy,cm-1,1);if(d.getFullYear()<2026)return;cy=d.getFullYear();cm=d.getMonth();render()};
$("nextMonth").onclick=()=>{const d=new Date(cy,cm+1,1);if(d.getFullYear()>2100)return;cy=d.getFullYear();cm=d.getMonth();render()};

function itemNode(type,item){const d=document.createElement("div");d.className="item";d.innerHTML='<div><div class="itemName"></div><div class="itemMeta"></div></div><div class="itemAmount"></div><div class="actions"><button class="edit">Modifica</button><button class="del">Elimina</button></div>';d.querySelector(".itemName").textContent=item.name;d.querySelector(".itemMeta").textContent=meta(item);d.querySelector(".itemAmount").textContent=euro(item.amount);d.querySelector(".edit").onclick=()=>v65OpenItem(type,item);
if(item.bankImported&&(type==='needs'||type==='fixed')){const move=document.createElement('button');move.textContent=type==='needs'?'Sposta in spese fisse':'Sposta in fabbisogno';move.onclick=()=>{const k=item.bankDate?item.bankDate.slice(0,7):key();ensure(k);const source=data.months[k][type],idx=source.findIndex(x=>x.id===item.id);if(idx<0)return;const target=type==='needs'?'fixed':'needs';source.splice(idx,1);data.months[k][target].push(item);save();render();if($('detailModal').classList.contains('open'))openDetail('expenses');};d.querySelector('.actions').prepend(move)}
if(type==='income'){const pending=document.createElement('button');pending.textContent='In attesa';pending.onclick=()=>{moveIncomeToPending(item);openDetail('income')};d.querySelector('.actions').prepend(pending)}d.querySelector(".del").onclick=()=>openDelete(type,item);return d}
function openDetail(which){lastDetail=which;const c=$("detailContent");c.innerHTML="";if(which==="income"){$("detailTitle").textContent="Entrate · "+label();$("detailTotal").textContent=euro(sum("income"));items("income").forEach(x=>c.appendChild(itemNode("income",x)));if(!items("income").length)c.innerHTML='<div class="itemMeta">Nessuna entrata</div>'}else{$("detailTitle").textContent="Uscite · "+label();$("detailTotal").textContent=euro(expenses());[["USCITE FISSE","fixed"],["FABBISOGNO","needs"]].forEach(([n,t])=>{const h=document.createElement("div");h.className="detailSection";h.textContent=n+" · "+euro(sum(t));c.appendChild(h);items(t).forEach(x=>c.appendChild(itemNode(t,x)))})}$("detailModal").classList.add("open")}
$("incomeCard").onclick=e=>{if(e.target.closest("[data-add]")||e.target.closest(".incomeRow"))return;};document.querySelectorAll(".col").forEach(el=>el.onclick=e=>{if(e.target.closest(".colAdd")||e.target.closest(".colItem"))return;});

function buildSelectors(){$("annualMonth").innerHTML=ML.map((x,i)=>'<option value="'+i+'">'+x+"</option>").join("");$("targetYear").innerHTML=Array.from({length:75},(_,i)=>2026+i).map(y=>'<option value="'+y+'">'+y+"</option>").join("");const g=$("monthPickerGrid");g.innerHTML="";ML.forEach((name,i)=>{const b=document.createElement("div");b.className="mp";b.dataset.m=i;b.innerHTML='<div>'+name.slice(0,3)+'</div><input class="hidden" type="number" min="0" step="0.01" placeholder="€">';b.onclick=e=>{if(e.target.tagName==="INPUT")return;b.classList.toggle("sel");b.querySelector("input").classList.toggle("hidden",!b.classList.contains("sel"))};g.appendChild(b)})}
buildSelectors();
function buildEditSelectors(){
  $("editAnnualMonth").innerHTML=ML.map((x,i)=>'<option value="'+i+'">'+x+"</option>").join("");
  $("editTargetYear").innerHTML=Array.from({length:75},(_,i)=>2026+i).map(y=>'<option value="'+y+'">'+y+"</option>").join("");
  const g=$("editMonthPickerGrid");g.innerHTML="";
  ML.forEach((name,i)=>{
    const b=document.createElement("div");
    b.className="mp";b.dataset.m=i;
    b.innerHTML='<div>'+name.slice(0,3)+'</div><input class="hidden" type="number" min="0" step="0.01" placeholder="€">';
    b.onclick=e=>{
      if(e.target.tagName==="INPUT")return;
      b.classList.toggle("sel");
      b.querySelector("input").classList.toggle("hidden",!b.classList.contains("sel"));
    };
    g.appendChild(b);
  });
}
function updateEditFreq(){
  const f=$("editFrequency").value;
  $("editAnnualBox").classList.toggle("hidden",f!=="annual");
  $("editSelectedMonthsBox").classList.toggle("hidden",!(f==="selectedYearly"||f==="selectedOneYear"));
  $("editYearBox").classList.toggle("hidden",f!=="selectedOneYear");
}
function fillEditFrequency(item){
  document.querySelectorAll("#editMonthPickerGrid .mp").forEach(x=>{
    x.classList.remove("sel");
    x.querySelector("input").classList.add("hidden");
    x.querySelector("input").value="";
  });

  if(!item.ruleId || !data.rules[item.ruleId]){
    $("editFrequency").value="once";
    updateEditFreq();
    return;
  }
  const r=data.rules[item.ruleId];
  const s=r.schedule||{kind:"monthly"};
  $("editFrequency").value=s.kind||"monthly";
  if(s.kind==="annual") $("editAnnualMonth").value=s.month;
  if(s.kind==="selectedOneYear") $("editTargetYear").value=s.year;
  if(s.kind==="selectedYearly"||s.kind==="selectedOneYear"){
    Object.entries(s.amounts||{}).forEach(([m,v])=>{
      const mp=document.querySelector('#editMonthPickerGrid .mp[data-m="'+m+'"]');
      if(mp){
        mp.classList.add("sel");
        const inp=mp.querySelector("input");
        inp.classList.remove("hidden");
        inp.value=v;
      }
    });
  }
  updateEditFreq();
}
function collectEditMonthAmounts(baseAmount){
  const out={};
  document.querySelectorAll("#editMonthPickerGrid .mp.sel").forEach(mp=>{
    const m=Number(mp.dataset.m);
    out[m]=Number(mp.querySelector("input").value||baseAmount);
  });
  return out;
}
function scheduleFromEdit(baseAmount){
  const f=$("editFrequency").value;
  if(f==="once") return null;
  if(f==="monthly") return {kind:"monthly"};
  if(f==="annual") return {kind:"annual",month:Number($("editAnnualMonth").value)};
  if(f==="selectedYearly"){
    const amounts=collectEditMonthAmounts(baseAmount);
    if(!Object.keys(amounts).length) throw new Error("Seleziona almeno un mese.");
    return {kind:"selectedYearly",amounts};
  }
  if(f==="selectedOneYear"){
    const amounts=collectEditMonthAmounts(baseAmount);
    if(!Object.keys(amounts).length) throw new Error("Seleziona almeno un mese.");
    return {kind:"selectedOneYear",year:Number($("editTargetYear").value),amounts};
  }
}
buildEditSelectors();
$("editFrequency").onchange=updateEditFreq;

function updateFreq(){const f=$("frequency").value;$("annualBox").classList.toggle("hidden",f!=="annual");$("selectedMonthsBox").classList.toggle("hidden",!(f==="selectedYearly"||f==="selectedOneYear"));$("yearBox").classList.toggle("hidden",f!=="selectedOneYear")}
$("frequency").onchange=updateFreq;
$("newType").addEventListener("change",()=>{$("newDayBox").style.display=""});
let newCategoryTouched=false;
$("newExpenseCategory").addEventListener("change",()=>{newCategoryTouched=true});
function updateNewExpenseCategory(){const visible=$("newType").value!=="income";$("newExpenseCategoryBox").style.display=visible?"":"none";if(visible&&!newCategoryTouched)$("newExpenseCategory").value=expenseCategory($("newName").value)}
$("newName").addEventListener("input",updateNewExpenseCategory);$("newType").addEventListener("change",updateNewExpenseCategory);
function openAdd(type){$("addMonth").textContent="STAI REGISTRANDO SU: "+label().toUpperCase();$("newType").value=type||"fixed";$("newName").value="";newCategoryTouched=false;$('newSubEnabled').checked=false;updateNewExpenseCategory();$("newAmount").value="";$("newDay").value="";$("newDayBox").style.display="";$("frequency").value="once";$("targetYear").value=cy;updateFreq();document.querySelectorAll(".mp").forEach(x=>{x.classList.remove("sel");x.querySelector("input").classList.add("hidden");x.querySelector("input").value=""});$("addModal").classList.add("open")}
document.querySelectorAll("[data-add]").forEach(b=>b.onclick=e=>{e.stopPropagation();openAdd(b.dataset.add)});
function openBalance(){
  $("balanceModalMonth").textContent="SALDO REALE · "+label(realKey).toUpperCase();
  $("balanceAmount").value=balanceConfigured()?Number(data.balance.amount):"";
  $("clearBalanceBtn").style.display=balanceConfigured()?"block":"none";
  $("balanceModal").classList.add("open");
  setTimeout(()=>$("balanceAmount").focus(),120);
}
$("balanceCard").onclick=openBalance;
$("saveBalanceBtn").onclick=()=>{
  const amount=Number($("balanceAmount").value);
  if(!Number.isFinite(amount))return alert("Inserisci un saldo valido.");
  const d=new Date();
  data.balance={amount,anchorMonth:realKey,anchorIsCurrent:true,updatedAt:d.toISOString(),updatedLabel:d.toLocaleDateString("it-IT")};
  $("balanceModal").classList.remove("open");
  save();
};
$("clearBalanceBtn").onclick=()=>{
  if(!confirm("Vuoi rimuovere il saldo impostato? Entrate e uscite non verranno cancellate."))return;
  data.balance=null;
  $("balanceModal").classList.remove("open");
  save();
};

function collectMonthAmounts(baseAmount){const out={};document.querySelectorAll(".mp.sel").forEach(mp=>{const m=Number(mp.dataset.m),v=Number(mp.querySelector("input").value||baseAmount);out[m]=v});return out}
$("addBtn").onclick=()=>{const type=$("newType").value,name=$("newName").value.trim(),expenseCategory=type==="income"?undefined:$("newExpenseCategory").value,amount=Number($("newAmount").value),f=$("frequency").value,k=key();let dueDay;try{dueDay=readDay("newDay")}catch(e){return alert(e.message)}if(!name||!Number.isFinite(amount)||amount<=0)return alert("Inserisci nome e importo valido.");ensure(k);if(type!=="income"&&newCategoryTouched)learnCategory(name,expenseCategory);if(f==="once"){data.months[k][type].push({id:"o-"+Date.now(),name,amount,dueDay,expenseCategory,categoryManual:newCategoryTouched,subEnabled:$("newSubEnabled").checked})}else{const id="r-"+Date.now()+"-"+Math.random().toString(16).slice(2);let schedule;if(f==="monthly")schedule={kind:"monthly"};if(f==="annual")schedule={kind:"annual",month:Number($("annualMonth").value)};if(f==="selectedYearly"){const amounts=collectMonthAmounts(amount);if(Object.values(amounts).some(v=>!Number.isFinite(v)||v<=0))return alert("Inserisci importi validi per i mesi selezionati.");if(!Object.keys(amounts).length)return alert("Seleziona almeno un mese.");schedule={kind:"selectedYearly",amounts}}if(f==="selectedOneYear"){const amounts=collectMonthAmounts(amount);if(Object.values(amounts).some(v=>!Number.isFinite(v)||v<=0))return alert("Inserisci importi validi per i mesi selezionati.");if(!Object.keys(amounts).length)return alert("Seleziona almeno un mese.");schedule={kind:"selectedOneYear",year:Number($("targetYear").value),amounts}}data.rules[id]={id,type,name,start:k,end:null,skip:[],schedule,amount,dueDay,expenseCategory,categoryManual:newCategoryTouched,subEnabled:$("newSubEnabled").checked};if(cmp(k,realKey)<=0&&ruleActive(data.rules[id],k)){const a=amountForRule(data.rules[id],k);data.months[k][type].push({id:"i-"+id+"-"+k,name,amount:a,ruleId:id,dueDay,expenseCategory,categoryManual:newCategoryTouched,subEnabled:$("newSubEnabled").checked})}}$("addModal").classList.remove("open");save()};

function openEdit(type,item){
  pendingEdit={type,item};$("editSubEnabled").checked=!!(item.subEnabled||(item.ruleId&&data.rules[item.ruleId]?.subEnabled));
  $("editMovePending").style.display=type==="income"?"":"none";
  $("editTitle").textContent=item.name;
  $("editMonth").textContent="MESE: "+label().toUpperCase();
  $("editCategory").textContent=type==="income"?"ENTRATA":type==="fixed"?"USCITA FISSA":"USCITA CERTA";
  $("editExpenseCategoryBox").style.display=type==="income"?"none":"";$("editExpenseCategory").value=categoryForItem(item);
  $("editName").value=item.name;
  $("editAmount").value=item.amount;$("editDay").value=dayOf(item)??"";$("editDayBox").style.display="";
  $("editTargetYear").value=cy;
  fillEditFrequency(item);
  $("detailModal").classList.remove("open");
  $("deleteModal").classList.remove("open");
  $("editModal").classList.add("open");
}
function applyEdit(mode){
  if(!pendingEdit)return;
  const {type,item}=pendingEdit,k=key(),name=$("editName").value.trim(),amount=Number($("editAmount").value),expenseCategory=type==="income"?undefined:$("editExpenseCategory").value;
  let dueDay,newSchedule;
  try{
    if(!name||!Number.isFinite(amount)||amount<=0)throw new Error("Inserisci nome e importo valido.");
    dueDay=readDay("editDay");newSchedule=scheduleFromEdit(amount);
    if(newSchedule!==null)newSchedule=v48ArchiveSchedule(newSchedule,amount);
    if(type!=="income"&&!categoryPalette.some(([c])=>c===expenseCategory))throw new Error("Seleziona una categoria valida.");
  }catch(e){return alert(e.message)}
  ensure(k);
  const a=data.months[k][type],idx=a.findIndex(x=>x.id===item.id);
  if(idx<0)return;
  // Learn only after all input has passed validation. Existing rules retain their
  // historical category: monthly exceptions must never rewrite the whole series.
  if(type!=="income")learnCategory(name,expenseCategory);
  const edited={...item,id:"edit-"+Date.now(),name,amount,dueDay,expenseCategory,categoryManual:true,subEnabled:$("editSubEnabled").checked};delete edited.ruleId;
  if(mode==="month"){
    if(item.ruleId&&data.rules[item.ruleId]){
      const old=data.rules[item.ruleId];if(!Array.isArray(old.skip))old.skip=[];if(!old.skip.includes(k))old.skip.push(k);
    }
    if(newSchedule!==null)edited.frequencyLabel=$("editFrequency").value;else delete edited.frequencyLabel;
    a[idx]=edited;
  }else{
    const inherited=item.ruleId&&data.rules[item.ruleId]?JSON.parse(JSON.stringify(data.rules[item.ruleId])):{};
    if(item.ruleId&&data.rules[item.ruleId]){
      data.rules[item.ruleId].end=prev(k);
      Object.keys(data.months).forEach(m=>{if(cmp(m,k)>=0)data.months[m][type]=data.months[m][type].filter(x=>x.ruleId!==item.ruleId)});
    }else a.splice(idx,1);
    if(newSchedule===null){edited.id="o-"+Date.now();delete edited.frequencyLabel;data.months[k][type].push(edited)}
    else{
      const nid="r-edit-"+Date.now()+"-"+Math.random().toString(16).slice(2),nr={...inherited,id:nid,type,name,amount,dueDay,expenseCategory,categoryManual:true,subEnabled:$("editSubEnabled").checked,start:k,end:null,skip:[],schedule:newSchedule};
      data.rules[nid]=nr;
      if(cmp(k,realKey)<=0&&ruleActive(nr,k))data.months[k][type].push({...edited,id:"i-"+nid+"-"+k,amount:amountForRule(nr,k),ruleId:nid});
    }
  }
  // Mantieni le sottovoci del mese anche se la voce cambia identificativo.
  if(data.subentries){const oldKey=k+'|'+type+'|'+(item.ruleId||item.id);const latest=data.months[k][type].find(x=>x.id===edited.id||x.name===name&&x.amount===amount&&x.subEnabled);if(latest){const newKey=k+'|'+type+'|'+(latest.ruleId||latest.id);if(oldKey!==newKey&&data.subentries[oldKey]){data.subentries[newKey]=[...(data.subentries[newKey]||[]),...data.subentries[oldKey]];delete data.subentries[oldKey]}}}
  pendingEdit=null;
  $("editModal").classList.remove("open");$("detailModal").classList.remove("open");$("deleteModal").classList.remove("open");save();window.scrollTo({top:0,behavior:"smooth"});
}
$("editOnly").onclick=()=>applyEdit("month");
$("editForever").onclick=()=>applyEdit("forever");
$("editMovePending").onclick=()=>{if(!pendingEdit||pendingEdit.type!=="income")return;const item=pendingEdit.item;if(moveIncomeToPending(item)){$("editModal").classList.remove("open");pendingEdit=null}};
$("editDelete").onclick=()=>{
  if(!pendingEdit)return;
  const {type,item}=pendingEdit;
  $("editModal").classList.remove("open");
  openDelete(type,item);
};

function openDelete(type,item){pendingDelete={type,item};$("deleteLabel").textContent=item.name+" · "+label();$("deleteForever").style.display=item.ruleId?"block":"none";$("deleteOnly").textContent=item.ruleId?"🗓️ Elimina solo questo mese":"🗑️ Elimina questa voce";$("deleteModal").classList.add("open")}
$("deleteOnly").onclick=()=>{const {type,item}=pendingDelete,k=key();data.months[k][type]=data.months[k][type].filter(x=>x.id!==item.id);if(item.ruleId){const r=data.rules[item.ruleId];if(r&&!r.skip.includes(k))r.skip.push(k)}$("deleteModal").classList.remove("open");$("detailModal").classList.remove("open");$("editModal").classList.remove("open");save();window.scrollTo({top:0,behavior:"smooth"})};
$("deleteForever").onclick=()=>{const {type,item}=pendingDelete,k=key(),r=data.rules[item.ruleId];if(r)r.end=prev(k);Object.keys(data.months).forEach(m=>{if(cmp(m,k)>=0)data.months[m][type]=data.months[m][type].filter(x=>x.ruleId!==item.ruleId)});$("deleteModal").classList.remove("open");$("detailModal").classList.remove("open");$("editModal").classList.remove("open");save();window.scrollTo({top:0,behavior:"smooth"})};

document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>$(b.dataset.close).classList.remove("open"));document.querySelectorAll(".modal").forEach(m=>m.onclick=e=>{if(e.target===m)m.classList.remove("open")});
function dailyBackup(){const d=new Date(),day=d.toISOString().slice(0,10);let b=[];try{b=JSON.parse(localStorage.getItem(BACKUP_KEY)||"[]")}catch(e){}const s={date:day,createdAt:new Date().toISOString(),data:JSON.parse(JSON.stringify(data))},i=b.findIndex(x=>x.date===day);if(i>=0)b[i]=s;else b.push(s);if(b.length>90)b=b.slice(-90);localStorage.setItem(BACKUP_KEY,JSON.stringify(b))}

window.addEventListener("scroll", function(){
  if(window.scrollX !== 0){
    window.scrollTo(0, window.scrollY);
  }
});


window.addEventListener("scroll", function(){
  if(window.scrollX !== 0) window.scrollTo(0, window.scrollY);
});


function getBackupFileName(){
  const d=new Date();
  const stamp=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")+
    "_"+String(d.getHours()).padStart(2,"0")+"-"+String(d.getMinutes()).padStart(2,"0");
  return "Spese_Famiglia_Backup_"+stamp+".json";
}

async function exportBackup(){
  const payload={
    app:"Spese Famiglia",
    version:"v48",
    exportedAt:new Date().toISOString(),
    data:JSON.parse(JSON.stringify(data))
  };

  const text=JSON.stringify(payload,null,2);
  const filename=getBackupFileName();
  const file=new File([text],filename,{type:"application/json"});

  try{
    if(navigator.canShare && navigator.canShare({files:[file]}) && navigator.share){
      await navigator.share({
        title:"Backup Spese Famiglia",
        text:"Backup completo dell'app Spese Famiglia",
        files:[file]
      });
      return;
    }
  }catch(e){
    if(e && e.name==="AbortError") return;
  }

  const blob=new Blob([text],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download=filename;
  a.style.display="none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}


// v48: validate a detached candidate before touching the active archive.
const PRE_IMPORT_BACKUP_KEY=KEY+"_preImport_v48";
function v48ArchiveObject(value){return !!value&&typeof value==="object"&&!Array.isArray(value)}
function v48ArchiveMonth(value,label="Mese"){
  if(typeof value!=="string"||!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)||Number(value.slice(0,4))<1900)throw new Error(label+": usa il formato AAAA-MM (anno da 1900).");
  return value;
}
function v48ArchiveAmount(value,label="Importo",signed=false){
  if((typeof value!=="number"&&typeof value!=="string")||value===""||(typeof value==="string"&&!value.trim()))throw new Error(label+": inserisci un numero valido.");
  const n=Number(value);
  if(!Number.isFinite(n)||(!signed&&n<0)||Math.abs(n)>1e12)throw new Error(label+": deve essere un numero finito"+(signed?"":" e non negativo")+".");
  return n;
}
function v48ArchiveText(value,fallback,max,label){
  if(value==null)return fallback;
  if(typeof value!=="string"&&typeof value!=="number")throw new Error(label+": testo non valido.");
  const s=String(value).trim();if(s.length>max)throw new Error(label+": massimo "+max+" caratteri.");return s||fallback;
}
function v48ArchiveDay(value){
  if(value==null||value==="")return null;
  const n=Number(value);if(!Number.isInteger(n)||n<1||n>31)throw new Error("Giorno di scadenza non valido: usa un valore da 1 a 31.");return n;
}
function v48ArchiveSchedule(source,baseAmount){
  const s=source==null?{kind:"monthly"}:JSON.parse(JSON.stringify(source));
  if(!v48ArchiveObject(s)||!["monthly","annual","selectedYearly","selectedOneYear"].includes(s.kind))throw new Error("Una frequenza ricorrente non è valida.");
  if(s.kind==="annual"){
    const n=Number(s.month);if((typeof s.month!=="number"&&typeof s.month!=="string")||s.month===""||!Number.isInteger(n)||n<0||n>11)throw new Error("Il mese annuale deve essere compreso tra 0 e 11.");s.month=n;
  }
  if(s.kind==="selectedOneYear"){
    const n=Number(s.year);if(!Number.isInteger(n)||n<1900||n>9999)throw new Error("L’anno della ricorrenza non è valido.");s.year=n;
  }
  if(s.kind==="selectedYearly"||s.kind==="selectedOneYear"){
    if(!v48ArchiveObject(s.amounts)||!Object.keys(s.amounts).length||Object.keys(s.amounts).length>12)throw new Error("Seleziona almeno un mese della ricorrenza.");
    for(const m of Object.keys(s.amounts)){
      if(!/^(0|[1-9]|10|11)$/.test(m))throw new Error("Mese selezionato non valido: usa 0–11.");
      s.amounts[m]=v48ArchiveAmount(s.amounts[m],"Importo della ricorrenza");
    }
  }
  return s;
}
function validateImportedArchive(parsed){
  if(!v48ArchiveObject(parsed))throw new Error("Il file non contiene un archivio Spese Famiglia valido.");
  const incoming=parsed.data||parsed.backup?.data||parsed.backup||parsed;
  if(!v48ArchiveObject(incoming)||!v48ArchiveObject(incoming.months))throw new Error("Il backup deve contenere l’oggetto months.");
  const restored=JSON.parse(JSON.stringify(incoming)),groups=["income","fixed","policies","needs"];
  if(Object.keys(restored.months).length>2400)throw new Error("Il backup contiene troppi mesi (massimo 2.400).");
  if(restored.rules==null)restored.rules={};else if(!v48ArchiveObject(restored.rules))throw new Error("Le ricorrenze devono essere un oggetto.");
  if(Object.keys(restored.rules).length>50000)throw new Error("Il backup contiene troppe ricorrenze.");
  if(restored.categoryLearning!=null&&!v48ArchiveObject(restored.categoryLearning))throw new Error("La memoria delle categorie non è valida.");
  let count=0;
  function item(source,label,fallback){
    if(!v48ArchiveObject(source))throw new Error(label+": movimento non valido.");
    const x={...source};x.id=v48ArchiveText(x.id,fallback,256,"ID movimento");x.name=v48ArchiveText(x.name,"Movimento senza nome",500,"Nome movimento");x.amount=v48ArchiveAmount(x.amount,label);x.dueDay=v48ArchiveDay(x.dueDay);
    if(x.ruleId!=null)x.ruleId=v48ArchiveText(x.ruleId,null,256,"ID ricorrenza");
    return x;
  }
  for(const [month,m] of Object.entries(restored.months)){
    v48ArchiveMonth(month);if(!v48ArchiveObject(m))throw new Error("Il mese "+month+" non è valido.");
    for(const group of groups){
      if(m[group]==null)m[group]=[];else if(!Array.isArray(m[group]))throw new Error("Il gruppo "+group+" del mese "+month+" deve essere un elenco.");
      count+=m[group].length;if(m[group].length>50000||count>300000)throw new Error("Il backup contiene troppi movimenti.");
      m[group]=m[group].map((x,i)=>item(x,"Importo nel mese "+month,"v48-import-"+month+"-"+group+"-"+i));
    }
    // Same legacy migration, applied exclusively to the detached candidate.
    const ids=new Set(m.fixed.map(x=>x.id));for(const x of m.policies)if(!ids.has(x.id)){m.fixed.push(x);ids.add(x.id)}m.policies=[];
  }
  for(const [id,r] of Object.entries(restored.rules)){
    if(["__proto__","prototype","constructor"].includes(id)||id.length>256||!v48ArchiveObject(r))throw new Error("Una ricorrenza ha un ID o formato non valido.");
    if(r.id!=null&&r.id!==id)throw new Error("L’ID di una ricorrenza non coincide con il suo riferimento.");r.id=id;
    if(!groups.includes(r.type))throw new Error("Il tipo di una ricorrenza non è valido.");if(r.type==="policies")r.type="fixed";
    r.name=v48ArchiveText(r.name,"Ricorrenza senza nome",500,"Nome ricorrenza");r.amount=v48ArchiveAmount(r.amount,"Importo di «"+r.name+"»");r.dueDay=v48ArchiveDay(r.dueDay);
    r.start=v48ArchiveMonth(r.start||Object.keys(restored.months).sort()[0]||BASE,"Inizio ricorrenza");
    if(r.end!=null&&r.end!=="")v48ArchiveMonth(r.end,"Fine ricorrenza");else r.end=null;
    if(r.skip==null)r.skip=[];else if(!Array.isArray(r.skip)||r.skip.length>2400)throw new Error("I mesi saltati di una ricorrenza non sono validi.");
    r.skip=[...new Set(r.skip.map(m=>v48ArchiveMonth(m,"Mese saltato")))];r.schedule=v48ArchiveSchedule(r.schedule,r.amount);
  }
  if(restored.pendingIncome==null)restored.pendingIncome=[];
  if(!Array.isArray(restored.pendingIncome)||restored.pendingIncome.length>50000)throw new Error("Le entrate in attesa devono essere un elenco valido.");
  restored.pendingIncome=restored.pendingIncome.map((x,i)=>{const p=item(x,"Entrata in attesa","v48-pending-"+i);if(p.originMonth)v48ArchiveMonth(p.originMonth,"Mese di origine");return p});
  if(!Object.prototype.hasOwnProperty.call(restored,"balance"))restored.balance=null;
  if(restored.balance!=null){
    if(!v48ArchiveObject(restored.balance))throw new Error("Il saldo del conto non è valido.");
    restored.balance.amount=v48ArchiveAmount(restored.balance.amount,"Saldo del conto",true);v48ArchiveMonth(restored.balance.anchorMonth,"Mese del saldo");
  }
  return restored;
}

function restoreFromBackup(file){
  if(!file)return;
  if(file.size>15*1024*1024){alert("Il backup supera 15 MB. Seleziona un file JSON più piccolo.");return}
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const restored=validateImportedArchive(JSON.parse(reader.result));
      const snapshot={app:"Spese Famiglia",version:"v48",reason:"pre-import",createdAt:new Date().toISOString(),data:JSON.parse(JSON.stringify(data))};
      // Keep this copy separate from the daily backup that save/render may refresh.
      localStorage.setItem(PRE_IMPORT_BACKUP_KEY,JSON.stringify(snapshot));
      localStorage.setItem(KEY,JSON.stringify(restored));
      data=restored;
      if(typeof syncCategoryOptions==="function")syncCategoryOptions();
      try{dailyBackup()}catch(e){console.warn("Backup automatico non disponibile",e)}
      render();
      $("backupModal").classList.remove("open");
      alert(balanceConfigured()?"Backup ripristinato correttamente, compreso il saldo conto.":"Backup ripristinato correttamente. Puoi impostare il saldo dal riquadro Saldo totale quando vuoi.");
    }catch(e){
      alert("Impossibile importare il backup: "+(e.message||"file non valido"));
    }
  };
  reader.onerror=()=>alert("Impossibile leggere il file selezionato.");
  reader.readAsText(file);
}

function updateBackupBadge(){
  if($("v48PreImportBtn"))$("v48PreImportBtn").classList.toggle("hidden",!localStorage.getItem(PRE_IMPORT_BACKUP_KEY));
  let b=[];
  try{b=JSON.parse(localStorage.getItem(BACKUP_KEY)||"[]")}catch(e){}
  const last=b[b.length-1];
  $("backupStatus").textContent=last
    ? "Backup automatico locale: ultimo "+last.date+" · "+b.length+" copie conservate"
    : "Backup automatico locale attivo";
}


$("backupModal").querySelector(".close").onclick=()=>{
  $("backupModal").classList.remove("open");
};

if($("backupBtn")) $("backupBtn").onclick=()=>{
  updateBackupBadge();
  $("backupModal").classList.add("open");
};
if($("exportBackupBtn")) $("exportBackupBtn").onclick=async()=>{await exportBackup();updateBackupBadge();};
if($("restoreBackupBtn")) $("restoreBackupBtn").onclick=()=>{const i=$("restoreFileInput");i.value="";i.click();};
if($("restoreFileInput")) $("restoreFileInput").onchange=e=>{
  const f=e.target.files&&e.target.files[0];
  if(f) restoreFromBackup(f);
  e.target.value="";
};


// v60: switch panels explicitly. Avoid relying on horizontal scroll offsets,
// which can be reset by iOS Safari and the compact-height layout rules.
let incomePendingVisible=false;
function setIncomePanel(second){
 incomePendingVisible=!!second;
 const area=$("incomeSwipe");
 area.classList.toggle("pendingVisible",incomePendingVisible);
 area.scrollLeft=0;
 updateIncomeTabs(incomePendingVisible);
}
function updateIncomeTabs(second){
 $("backIncomeTab").hidden=!second;
 $("pendingTab").classList.toggle("active",second);
 $("incomeCard").classList.toggle("showPending",second);
 $("pendingTab").hidden=second;
}
$("pendingTab").onclick=()=>setIncomePanel(true);
$("backIncomeTab").onclick=()=>setIncomePanel(false);
// Swipe horizontally from anywhere in the income list, while preserving vertical scrolling.
(()=>{const area=$("incomeSwipe");let startX=0,startY=0,tracking=false;
 area.addEventListener("touchstart",e=>{if(e.touches.length!==1)return;startX=e.touches[0].clientX;startY=e.touches[0].clientY;tracking=true},{passive:true});
 area.addEventListener("touchend",e=>{if(!tracking||!e.changedTouches.length)return;tracking=false;
 const dx=e.changedTouches[0].clientX-startX,dy=e.changedTouches[0].clientY-startY;
 if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.35)setIncomePanel(dx<0);
 },{passive:true});
 area.addEventListener("touchcancel",()=>{tracking=false},{passive:true});
})();
$("addPendingBtn").onclick=()=>{$("pendingName").value="";$("pendingAmount").value="";$("pendingModal").classList.add("open")};
$("savePendingBtn").onclick=()=>{const name=$("pendingName").value.trim(),amount=Number($("pendingAmount").value);if(!name||!Number.isFinite(amount)||amount<=0)return alert("Inserisci nome e importo valido.");data.pendingIncome.push({id:"pending-"+Date.now(),name,amount});$("pendingModal").classList.remove("open");save()};
const NOTIFY_KEY="speseFamiglia_notify_v29";
function notifyPrefs(){try{return JSON.parse(localStorage.getItem(NOTIFY_KEY)||"null")||{enabled:false,advance:1,due:true}}catch(e){return {enabled:false,advance:1,due:true}}}
$("headerNotifyBtn").onclick=()=>$("openNotifyBtn").click();
$("openNotifyBtn").onclick=()=>{const p=notifyPrefs();$("notifyEnabled").checked=p.enabled;$("notifyAdvance").value=String(p.advance);$("notifyDue").checked=p.due;$("notifyModal").classList.add("open")};
$("requestNotifyBtn").onclick=async()=>{if(!("Notification" in window))return alert("Notifiche non supportate in questo browser. Su iPhone installa la web app sulla schermata Home.");try{const permission=await Notification.requestPermission();$("notifyStatus").textContent="Autorizzazione: "+permission+". Le notifiche con app chiusa richiedono un servizio push remoto."}catch(e){alert("Autorizzazione non disponibile: aggiungi l'app alla schermata Home e riprova.")}};
$("saveNotifyBtn").onclick=()=>{localStorage.setItem(NOTIFY_KEY,JSON.stringify({enabled:$("notifyEnabled").checked,advance:Number($("notifyAdvance").value),due:$("notifyDue").checked}));$("notifyModal").classList.remove("open");checkDueAlerts()};
function checkDueAlerts(){const p=notifyPrefs();if(!p.enabled||!("Notification" in window)||Notification.permission!=="granted")return;const now=new Date(),today=new Date(now.getFullYear(),now.getMonth(),now.getDate());const k=key(today.getFullYear(),today.getMonth());let alerts=[];for(const type of ["fixed","needs"]){for(const x of items(type,k)){const d=dayOf(x);if(!d)continue;const due=new Date(today.getFullYear(),today.getMonth(),Math.min(d,new Date(today.getFullYear(),today.getMonth()+1,0).getDate()));const diff=Math.round((due-today)/86400000);if((p.advance>0&&diff===p.advance)||(p.due&&diff===0)||(p.advance===0&&diff===0))alerts.push(x)}}const stamp=today.toISOString().slice(0,10);for(const x of alerts){const token="spese-notified-"+stamp+"-"+x.id;if(localStorage.getItem(token))continue;try{new Notification("Scadenza: "+x.name,{body:euro(x.amount)+" · Controlla il pagamento"});localStorage.setItem(token,"1")}catch(e){}}}
for(const id of ["pendingModal","notifyModal"]){$(id).querySelector("[data-close]").onclick=()=>$(id).classList.remove("open")}

// Riconciliazione Intesa: anteprima obbligatoria, nessuna cancellazione automatica.
let bankRows=[];
const bankModal=$('bankModal');
$('bankBtn').onclick=()=>bankModal.classList.add('open');
$('bankClose').onclick=()=>bankModal.classList.remove('open');
function bankNormalize(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim()}
function bankExisting(k,sign){return (sign>0?['income']:['fixed','needs','policies']).flatMap(t=>items(t,k).map(x=>({...x,type:t})));}
function bankCandidates(r){let k=r.date.slice(0,7);return bankExisting(k,Math.sign(r.amount)).filter(x=>Math.abs(Number(x.amount)-Math.abs(r.amount))<=1.0).map(x=>({x,exact:Math.abs(Number(x.amount)-Math.abs(r.amount))<0.005,sameDay:dayOf(x)===Number(r.date.slice(8)),nameMatch:bankNormalize(x.name).includes(bankNormalize(r.name))||bankNormalize(r.name).includes(bankNormalize(x.name))}));}
function bankSignature(r){return [r.date,r.amount.toFixed(2),bankNormalize(r.rawName||r.name)].join('|')}
function bankStoredCount(signature){
 let count=0;
 for(const month of Object.values(data.months||{}))for(const type of ['income','fixed','needs','policies'])for(const x of (month[type]||[])){
  if(x.bankSignature===signature)count++;
 }
 return count;
}
function bankCents(value){return Math.round(Number(value)*100)}
function bankAudit(rows){
 const seen=new Set(),months=new Map();let income=0,outgoing=0;
 for(const r of rows){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||!Number.isFinite(r.amount)||bankCents(r.amount)===0)throw Error('Data o importo non valido: importazione interrotta.');
  const signature=bankSignature(r)+'#'+r.bankOccurrence;
  if(seen.has(signature))throw Error('Movimento duplicato nella selezione: '+r.date);
  seen.add(signature);
  const cents=bankCents(r.amount),key=r.date.slice(0,7);
  const entry=months.get(key)||{count:0,income:0,outgoing:0};entry.count++;
  if(cents>0){income+=cents;entry.income+=cents}else{outgoing-=cents;entry.outgoing-=cents}
  months.set(key,entry);
 }
 return {count:rows.length,income,outgoing,months};
}
function bankPersistBatch(selected){
 if(selected.some(bankIsGiroconto))throw Error("I giroconti non possono essere importati.");
 // All-or-nothing localStorage write: no partial months if browser storage fails.
 const next=JSON.parse(JSON.stringify(data));next.bankImported=next.bankImported||[];
 for(const r of selected){
  const sig=bankSignature(r)+'#'+r.bankOccurrence;
  if(next.bankImported.includes(sig))throw Error('Movimento gia importato: '+r.date+' '+r.amount);
  const k=r.date.slice(0,7),type=r.amount>0?'income':r.type;
  if(!['income','fixed','needs'].includes(type))throw Error('Destinazione non valida.');
  if(!next.months[k])next.months[k]={income:[],fixed:[],needs:[],policies:[]};
  if(!Array.isArray(next.months[k][type]))next.months[k][type]=[];
  next.months[k][type].push({id:'bank-'+Date.now()+'-'+Math.random().toString(36).slice(2),name:(r.cleanName||bankInterpret(r).name).trim(),amount:Math.abs(r.amount),dueDay:Number(r.date.slice(8)),bankDate:r.date,bankImported:true,bankPosted:r.posted,bankSignature:bankSignature(r),bankOriginalDescription:r.rawName,bankOriginalCategory:r.bankCategory,expenseCategory:type==='income'?undefined:r.importCategory,categoryManual:type!=='income'});
  next.bankImported.push(sig);
 }
 const serialized=JSON.stringify(next);
 localStorage.setItem(KEY,serialized);
 if(localStorage.getItem(KEY)!==serialized)throw Error('Verifica del salvataggio fallita.');
 data=next;
 return selected.length;
}
function bankShortName(raw){const n=bankNormalize(raw);if(n.includes('crai'))return 'Crai Supermercato';if(n.includes('condominio talea'))return 'Condominio Talea';if(n.includes('condominio vico'))return 'Condominio Vico III';if(n.includes('enel'))return 'Enel Energia';if(n.includes('agos'))return 'Rata Agos';if(n.includes('sky'))return 'Sky';if(n.includes('apple'))return 'Apple';if(n.includes('uci matera'))return 'Cinema UCI';if(n.includes('giroconto'))return 'Giroconto';if(n.includes('commissione'))return 'Commissione bancaria';if(n.includes('agenzia delle entrate'))return 'Agenzia Entrate';if(n.includes('farmacia montesano'))return 'Bonifico Farmacia Montesano';if(n.includes('pagamento tramite pos'))return 'Pagamento POS';if(n.includes('pellegrino lucia'))return 'Alimentari Pellegrino';if(n.includes('carta di credito'))return 'Carta di credito';if(n.includes('deliveroo'))return 'Deliveroo';if(n.includes('lindt'))return 'Lindt';if(n.includes('old wild west'))return 'Old Wild West';if(n.includes('intrend'))return 'Intrend';if(n.includes('klarna'))return 'Klarna';if(n.includes('coin'))return 'Coin';if(n.includes('prelievo'))return 'Prelievo';return String(raw||'Movimento bancario').split(/\s+(?:Generi alimentari|Bonifici ricevuti|Domiciliazioni|Ristoranti e bar)/i)[0].slice(0,55)}
function bankCleanName(raw){
 let s=String(raw||'').replace(/\s+/g,' ').trim();
 s=s.replace(/^(?:operazione|descrizione|dettaglio)\s*[:\-]\s*/i,'').replace(/\b(?:Si|No)\s*$/i,'').trim();
 s=s.replace(/\b(?:Generi alimentari|Bonifici ricevuti|Domiciliazioni|Ristoranti e bar|Spese condominiali|Utenze domestiche|Pagamenti e prelievi)\s*$/i,'').trim();
 return s.slice(0,110);
}
function bankInterpret(r){
 const n=bankNormalize(r.rawName||r.name), c=bankNormalize(r.bankCategory||'');
 const has=x=>n.includes(x),cat=x=>c.includes(x);
 let name='Movimento bancario',category='Altro',type=r.amount>0?'income':'needs';
 if(r.amount>0){name=has('farmacia montesano')?'Bonifico Farmacia Montesano':has('palermo maria luisa')?'Bonifico Palermo Maria Luisa':'Bonifico ricevuto';return {name,category,type:'income'};}
 if(has('commissione') && !has('agenzia delle entrate') && !cat('domiciliazioni')){name=has('bonifico')?'Commissione bonifico':has('pagopa')||has('cbill')?'Commissione PagoPA':'Commissione bancaria';category='Commissioni';}
 else if(has('condominio')){name=has('talea')?'Condominio Talea':has('vico')?'Condominio Vico III Cappelluti':'Spese condominiali';category='Casa';}
 else if(has('agos')){name='Rata Agos';category='Finanziamenti';type='fixed';}
 else if(has('enel')){name='Bolletta Enel';category='Casa';}
 else if(has('agenzia delle entrate')){name='Agenzia delle Entrate';category='Tasse';}
 else if(has('sky')){name='Sky';category='Abbonamenti';type='fixed';}
 else if(has('crai')){name='Supermercato CRAI';category='Alimentari';}
 else if(has('pellegrino lucia')){name='Alimentari Pellegrino Lucia';category='Alimentari';}
 else if(has('lindt')){name='Cioccolateria Lindt';category='Alimentari';}
 else if(has('old wild west')){name='Ristorante Old Wild West';category='Ristoranti e bar';}
 else if(has('deliveroo')){name='Consegna cibo Deliveroo';category='Ristoranti e bar';}
 else if(has('intrend')){name='Intrend';category='Shopping';}
 else if(has('coin')){name='Coin';category='Shopping';}
 else if(has('klarna')&&has('logitravel')){name='Klarna Logitravel';category='Viaggi';}
 else if(has('apple')){name='Apple';category='Abbonamenti';type='fixed';}
 else if(has('uci')){name='Cinema UCI';category='Tempo libero';}
 else if(has('prelievo')){name='Prelievo contanti';category='Altro';}
 else if(has('giroconto')){name='Giroconto';category='Altro';}
 else if(has('carta di credito')){name='Saldo carta di credito';category='Altro';}
 else if(cat('alimentari')||cat('supermercato')){name='Supermercato';category='Alimentari';}
 else if(cat('ristoranti')){name='Ristorante';category='Ristoranti e bar';}
 else if(cat('abbigliamento')){name='Abbigliamento';category='Shopping';}
 else if(cat('gas')||cat('energia')||cat('utenze')){name='Bolletta utenze';category='Casa';}
 else if(cat('condominiali')){name='Condominio';category='Casa';}
 else if(cat('commissioni')){name='Commissione bancaria';category='Commissioni';}
 else if(cat('spettacoli')){name='Cinema e svago';category='Tempo libero';}
 else if(cat('prelievi')){name='Prelievo contanti';category='Altro';}
 else if(cat('giroconti')){name='Giroconto';category='Altro';}
 else {const original=bankCleanName(r.rawName||r.name).slice(0,55);const inferred=inferExpense(original);if(inferred.confidence>=.9){name=original||'Spesa da verificare';category=inferred.category;}else{name='Spesa da verificare';category='Altro';}}
 return {name,category,type};
}
function bankSuggestedCategory(r){return bankInterpret(r).category}
function bankSuspicious(r){return bankInterpret(r).name==='Spesa da verificare'||!r.name||r.name.length<3||r.name.length>95||/\b(?:saldo disponibile|pagina \d+|intestazione|totale movimenti|data contabile)\b/i.test(r.name)||/\d{2}\.\d{2}\.\d{4}/.test(r.name)}
let bankFilter='all';
function bankIsGiroconto(r){return /girocont/i.test(String(r.rawName||r.name||'')+' '+String(r.bankCategory||''));}
function bankReviewReasons(r,candidates){const reasons=[];if(bankSuspicious({...r,name:bankInterpret(r).name}))reasons.push('Descrizione non riconosciuta con certezza: controlla nome e categoria.');if(candidates.length)reasons.push('Ci sono '+candidates.length+' movimenti gia registrati con importo uguale o simile. Non significa necessariamente che sia un duplicato.');if(!r.posted)reasons.push('Movimento non ancora contabilizzato dalla banca.');return reasons}
function bankRender(){
 const root=$('bankRows');root.replaceChildren();let nNew=0,nReview=0,nOld=0;const occurrences=new Map();
 bankRows.forEach((r,i)=>{
  if(bankIsGiroconto(r))return;
  const signature=bankSignature(r),occurrence=occurrences.get(signature)||0;occurrences.set(signature,occurrence+1);r.bankOccurrence=occurrence;
  const excluded=bankIsGiroconto(r);r.excluded=excluded;
  const already=(data.bankImported||[]).includes(signature+'#'+occurrence)||bankStoredCount(signature)>occurrence;
  const candidates=bankCandidates(r);r.candidates=candidates;r.already=already;
  const reasons=already?[]:bankReviewReasons(r,candidates);r.review=reasons.length>0;
  if(already)nOld++;else if(r.review)nReview++;else nNew++;
  if(typeof r.selected!=='boolean')r.selected=!already&&!excluded;
  if(already||excluded)r.selected=false;
  if(bankFilter==='review'&&!r.review||bankFilter==='old'&&!already) return;
  const row=document.createElement('div');row.className='bankRow'+(r.review?' warn':'')+(already?' old':'')+(excluded?' excluded':'');
  const top=document.createElement('div');top.className='bankTop';const cb=document.createElement('input');cb.type='checkbox';cb.checked=r.selected;cb.disabled=already||excluded;cb.setAttribute('aria-label','Seleziona movimento '+(i+1));cb.onchange=()=>{r.selected=cb.checked;bankSelectionUpdate()};
  const date=document.createElement('span');date.className='bankDay';date.textContent=r.date.slice(8)+'/'+r.date.slice(5,7);
  const name=document.createElement('span');name.className='bankName';name.textContent=r.cleanName||bankInterpret(r).name;
  const amt=document.createElement('span');amt.className='bankAmt'+(r.amount>0?' positive':'');amt.textContent=(r.amount>0?'+':'−')+euro(Math.abs(r.amount));top.append(cb,date,name,amt);row.append(top);
  const sub=document.createElement('div');sub.className='bankSub';sub.textContent=excluded?'↔ Giroconto escluso automaticamente · non modifica il bilancio':already?'✓ Gia importato · non verra aggiunto di nuovo':r.review?'⚠ Da verificare · gia selezionato per importazione':'✓ Nuovo movimento · selezionato';row.append(sub);
  if(r.review){const reason=document.createElement('div');reason.className='bankReason';const head=document.createElement('strong');head.textContent='Perche e da verificare?';reason.append(head);for(const text of reasons){const line=document.createElement('div');line.textContent='• '+text;reason.append(line)}row.append(reason)}
  if(r.review||already){const original=document.createElement('div');original.className='bankOriginal';original.textContent='Dal PDF: '+(r.rawName||r.name||'Descrizione non disponibile')+' · '+r.date+' · '+(r.amount>0?'+':'−')+euro(Math.abs(r.amount));row.append(original)}
  if(candidates.length&&!already){const btn=document.createElement('button');btn.type='button';btn.textContent='Confronta con '+candidates.length+' movimenti simili ▾';const detail=document.createElement('div');detail.className='bankMatches';detail.hidden=true;for(const c of candidates){const line=document.createElement('div');line.textContent=(c.x.name||'Movimento')+' · '+euro(c.x.amount)+' · '+(c.x.date||c.x.day||'data non disponibile');detail.append(line)}btn.onclick=()=>{detail.hidden=!detail.hidden;btn.textContent=(detail.hidden?'Confronta con ':'Nascondi confronto · ')+candidates.length+' movimenti simili'};row.append(btn,detail)}
  if(!already&&!excluded){const sel=document.createElement('select');[['needs','Fabbisogno / spese variabili'],['fixed','Uscite fisse'],['income','Entrate']].forEach(([v,t])=>{const o=document.createElement('option');o.value=v;o.textContent=t;sel.append(o)});sel.value=r.type||bankInterpret(r).type;sel.onchange=()=>{r.type=sel.value;cat.style.display=sel.value==='income'?'none':''};r.type=sel.value;row.append(sel);
   const edit=document.createElement('input');edit.type='text';edit.value=r.cleanName||bankInterpret(r).name;edit.maxLength=110;edit.setAttribute('aria-label','Nome del movimento');edit.oninput=()=>{r.cleanName=edit.value;name.textContent=edit.value};row.append(edit);
   const cat=document.createElement('select');cat.setAttribute('aria-label','Categoria del movimento');for(const [n] of categoryPalette){const o=document.createElement('option');o.value=n;o.textContent=n;cat.append(o)}cat.value=r.importCategory||bankSuggestedCategory(r);r.importCategory=cat.value;cat.onchange=()=>r.importCategory=cat.value;cat.style.display=r.type==='income'?'none':'';row.append(cat);
  }root.append(row)
 });
 const months=[...new Set(bankRows.map(r=>r.date.slice(0,7)))].sort(),period=months.length?(' · '+months[0]+' → '+months[months.length-1]+' ('+months.length+' mesi)'):'';
 const expected=bankRows.expectedCount,mismatch=expected&&expected!==bankRows.length;
 $('bankStatus').textContent=(mismatch?'⚠ Il PDF indica '+expected+' movimenti, ma ne sono stati letti '+bankRows.length+'. Importazione bloccata. ':'✓ PDF letto: ')+bankRows.length+' movimenti'+period+' · Entrate '+euro(bankRows.filter(r=>r.amount>0).reduce((a,r)=>a+r.amount,0))+' · Uscite '+euro(-bankRows.filter(r=>r.amount<0).reduce((a,r)=>a+r.amount,0))+' · '+nReview+' da verificare · '+nOld+' gia importati · '+bankRows.filter(bankIsGiroconto).length+'.';
 $('bankTools').style.display=bankRows.length?'block':'none';$('bankImport').style.display=bankRows.length&&!mismatch?'block':'none';
 document.querySelectorAll('.bankFilter').forEach(b=>b.classList.toggle('active',b.dataset.filter===bankFilter));bankSelectionUpdate();
}
function bankSelectionUpdate(){const selected=bankRows.filter(r=>r.selected&&!r.already&&!bankIsGiroconto(r));$('bankSelection').textContent=selected.length+' selezionati su '+bankRows.filter(r=>!r.already&&!bankIsGiroconto(r)).length+' importabili · '+selected.filter(r=>r.review).length+' da verificare inclusi';$('bankImport').textContent='Importa '+selected.length+' movimenti selezionati'}
$('bankAll').onclick=()=>{bankRows.forEach(r=>r.selected=!r.already&&!bankIsGiroconto(r));bankRender()};
$('bankNone').onclick=()=>{bankRows.forEach(r=>r.selected=false);bankRender()};
document.querySelectorAll('.bankFilter').forEach(b=>b.onclick=()=>{bankFilter=b.dataset.filter;bankRender()});
async function bankLoadPdf(file){
 if(!window.pdfjsLib){await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';script.onload=resolve;script.onerror=()=>reject(Error('Libreria PDF non caricabile.'));document.head.append(script)})}
 pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
 const doc=await pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
 const result=[];let expectedCount=null;
 for(let pageNo=1;pageNo<=doc.numPages;pageNo++){
  const page=await doc.getPage(pageNo),content=await page.getTextContent(),lines=[];
  for(const it of content.items){if(!it.str.trim())continue;const y=it.transform[5],x=it.transform[4];let line=lines.find(l=>Math.abs(l.y-y)<2.3);if(!line){line={y,parts:[]};lines.push(line)}line.parts.push({x,text:it.str.trim()})}
  for(const line of lines)line.parts.sort((a,b)=>a.x-b.x);
  const join=parts=>parts.map(p=>p.text).join(' ').replace(/\s+/g,' ').trim();
  const pageText=lines.slice().sort((a,b)=>b.y-a.y).map(l=>join(l.parts)).join(' ');const countMatch=pageText.match(/movimenti selezionati sono\s*:?\s*(\d+)/i);if(countMatch)expectedCount=Number(countMatch[1]);
  const anchors=[];let incompleteRows=0;
  // Date and amount may be separate PDF text lines (different baselines).
  // Only dates inside the transaction table's first column qualify as rows.
  const tableHeaders=lines.filter(line=>line.parts.some(p=>/CONTABILE/i.test(p.text)) && line.parts.some(p=>/IMPORTO/i.test(p.text)));
  const tableTop=tableHeaders.length?Math.max(...tableHeaders.map(l=>l.y)):Infinity;
  const dated=[];
  for(const line of lines){
   const datePart=line.parts.find(p=>p.x<125&&/^\s*\d{2}\.\d{2}\.\d{4}\s*$/.test(p.text));
   if(!datePart||line.y>=tableTop)continue;
   const date=datePart.text.match(/(\d{2})\.(\d{2})\.(\d{4})/);
   const parsedDay=new Date(Number(date[3]),Number(date[2])-1,Number(date[1]));
   if(parsedDay.getFullYear()!==Number(date[3])||parsedDay.getMonth()!==Number(date[2])-1||parsedDay.getDate()!==Number(date[1]))continue;
   dated.push({y:line.y,date:date[3]+'-'+date[2]+'-'+date[1]});
  }
  // A valid movement has an amount in the amount column at essentially the
  // same vertical position. The 12pt tolerance handles PDF baseline offsets.
  for(const d of dated){
   const moneyLines=lines.map(line=>({line,dist:Math.abs(line.y-d.y)}))
    .filter(v=>v.dist<=12).sort((a,b)=>a.dist-b.dist);
   let amountMatch=null;
   for(const {line} of moneyLines){
    const moneyPart=line.parts.filter(p=>p.x>=490).map(p=>p.text).join(' ');
    amountMatch=moneyPart.match(/(-?\s*\d{1,3}(?:\.\d{3})*,\d{2})/);
    if(amountMatch)break;
   }
   if(!amountMatch){incompleteRows++;continue}
   anchors.push({y:d.y,date:d.date,amount:Number(amountMatch[1].replace(/\s/g,'').replace(/\./g,'').replace(',','.')),nameParts:[],catParts:[],posted:true});
  }
  anchors.sort((a,b)=>b.y-a.y);
  if(incompleteRows)throw Error('Pagina '+pageNo+': '+incompleteRows+' righe con data ma senza importo. Verifica il formato PDF: importazione bloccata.');
  if(!anchors.length)continue;
  for(const line of lines){
   // The table header is not a transaction, even on pages starting at the top.
   const lineText=join(line.parts);
   if(/\b(?:DATA CONTABILE|CONTABILIZZATO|CATEGORIA|IMPORTO|OPERAZIONE)\b/i.test(lineText) &&
      !/\d{2}\.\d{2}\.\d{4}/.test(lineText))continue;
   if(line.y>anchors[0].y+24||line.y<anchors[anchors.length-1].y-24)continue;
   // A row owns the vertical band halfway to its neighbors, not an arbitrary
   // +/-33 point region that can bleed across two transactions.
   let owner=null;
   for(let i=0;i<anchors.length;i++){
    const row=anchors[i];
    const upper=i===0?row.y+24:(anchors[i-1].y+row.y)/2;
    const lower=i===anchors.length-1?row.y-24:(row.y+anchors[i+1].y)/2;
    if(line.y<=upper && line.y>lower){owner=row;break}
   }
   if(!owner)continue;
   const names=line.parts.filter(p=>p.x>=120&&p.x<300);
   const categories=line.parts.filter(p=>p.x>=390&&p.x<490);
   const status=line.parts.filter(p=>p.x>=300&&p.x<390);
   if(names.length)owner.nameParts.push({y:line.y,text:join(names)});
   if(categories.length)owner.catParts.push({y:line.y,text:join(categories)});
   if(Math.abs(line.y-owner.y)<3&&status.some(p=>/^No$/i.test(p.text)))owner.posted=false;
  }
  for(const row of anchors){
   const sorted=arr=>arr.sort((a,b)=>b.y-a.y).map(x=>x.text).join(' ').replace(/\s+/g,' ').trim();
   const rawName=sorted(row.nameParts),bankCategory=sorted(row.catParts);
   if(!rawName)throw Error('Movimento del '+row.date+' da '+Math.abs(row.amount).toFixed(2)+' euro senza descrizione: importazione bloccata.');
   const r={date:row.date,amount:row.amount,name:rawName,rawName,bankCategory,posted:row.posted};
   const interpreted=bankInterpret(r);r.cleanName=interpreted.name;r.importCategory=interpreted.category;r.type=interpreted.type;
   result.push(r);
  }
 }
 if(expectedCount!==null&&expectedCount!==result.length)throw Error('Movimenti attesi '+expectedCount+', letti '+result.length+'. Nessuna importazione consentita.');
 return Object.assign(result,{expectedCount});
}
$('bankFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;$('bankStatus').textContent='Lettura PDF in corso…';$('bankRows').innerHTML='';$('bankImport').style.display='none';bankRows=[];bankFilter='all';$('bankTools').style.display='none';try{const parsed=await bankLoadPdf(file);bankRows=Object.assign(parsed.filter(r=>!bankIsGiroconto(r)),{expectedCount:null,sourceCount:parsed.length});if(!bankRows.length)throw Error('Nessun movimento riconosciuto: controlla che sia una lista movimenti Intesa in PDF testuale.');bankRender()}catch(err){$('bankStatus').textContent='Errore: '+err.message}};
$('bankImport').onclick=()=>{
 const selected=bankRows.filter(r=>r.selected&&!r.already&&!bankIsGiroconto(r));
 if(!selected.length)return alert('Nessun movimento selezionato.');
 if(selected.some(r=>!(r.cleanName||bankInterpret(r).name).trim()))return alert('Alcuni movimenti selezionati non hanno un nome. Inserisci un nome prima di importare.');
 try{
  const audit=bankAudit(selected);
  const detail=[...audit.months.entries()].sort().map(([month,v])=>month+': '+v.count+' movimenti, entrate '+euro(v.income/100)+', uscite '+euro(v.outgoing/100)).join('\n');
  if(!confirm('Confermi '+audit.count+' movimenti?\nEntrate: '+euro(audit.income/100)+'\nUscite: '+euro(audit.outgoing/100)+'\n\n'+detail+'\n\nControlla i duplicati prima di continuare.'))return;
  bankPersistBatch(selected);
  try{dailyBackup()}catch(e){console.warn('Backup automatico non disponibile',e)}
  render();bankModal.classList.remove('open');bankRows=[];$('bankFile').value='';$('bankRows').innerHTML='';$('bankTools').style.display='none';$('bankStatus').textContent='Nessun file selezionato.';$('bankImport').style.display='none';window.scrollTo({top:0,behavior:'smooth'});alert('Importati '+selected.length+' movimenti. Home aggiornata.');
 }catch(e){alert('Importazione annullata: '+e.message)}
};

$("smartReview").onclick=()=>{const btn=$("smartReview"),status=$("smartStatus");btn.disabled=true;status.textContent="Controllo in corso…";try{const count=backfillExpenseCategories(true);save();render();const pending=new Set();for(const month of Object.values(data.months||{}))for(const type of ['fixed','needs','policies'])for(const x of (month[type]||[])){if(!x.categoryManual&&inferExpense(x.name).confidence<.9)pending.add(normExpense(x.name))}status.textContent=count+" voci aggiornate · "+pending.size+" descrizioni da verificare";}catch(e){console.error(e);status.textContent="Errore: "+e.message}finally{btn.disabled=false}};
$('v48PreImportBtn').onclick=()=>{try{const raw=localStorage.getItem(PRE_IMPORT_BACKUP_KEY);if(!raw)return alert("Nessuna copia precedente disponibile.");const blob=new Blob([raw],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Spese_Famiglia_Prima_Ripristino.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500)}catch(e){alert("Copia non disponibile: "+e.message)}};
// v48: dettaglio categorie e preferenza compatta, con la disposizione originale.
let v48ReviewModal=null;
function v48ReviewRows(){
 if(!v48ReviewModal)return;
 const q=$('v48CategorySearch').value.toLowerCase().trim(),filter=$('v48CategoryFilter').value,root=$('v48CategoryRows');root.replaceChildren();
 const rows=v48CategoryEntries().filter(({item:x})=>(!q||(x.name+' '+categoryForItem(x)).toLowerCase().includes(q))&&(!filter||(filter==='__review'?v48NeedsReview(x):categoryForItem(x)===filter))).sort((a,b)=>Number(b.item.amount)-Number(a.item.amount));
 $('v48CategorySummary').textContent=rows.length+' voci · '+euro(rows.reduce((s,{item})=>s+Number(item.amount||0),0));
 if(!rows.length){const empty=document.createElement('div');empty.className='v48ReviewEmpty';empty.textContent='Nessuna voce per questo filtro.';root.append(empty);return}
 for(const {type,item} of rows){
  const row=document.createElement('div');row.className='v48ReviewRow'+(v48NeedsReview(item)?' warning':'');
  const top=document.createElement('div');top.className='v48ReviewTop';const name=document.createElement('span');name.className='v48ReviewName';name.textContent=item.name;const amount=document.createElement('strong');amount.className='v48ReviewAmount';amount.textContent=euro(item.amount);top.append(name,amount);
  const metaEl=document.createElement('div');metaEl.className='v48ReviewMeta';metaEl.textContent=(type==='needs'?'Fabbisogno':'Uscita fissa')+' · '+meta(item)+(v48NeedsReview(item)?' · verifica categoria':'');
  const select=document.createElement('select');select.setAttribute('aria-label','Categoria di '+item.name);for(const [n] of categoryPalette){const o=document.createElement('option');o.value=n;o.textContent=n;select.append(o)}select.value=categoryForItem(item);select.onchange=()=>{item.expenseCategory=select.value;item.categoryManual=true;item.categoryConfidence=1;learnCategory(item.name,select.value);save();v48ReviewRows()};
  const edit=document.createElement('button');edit.type='button';edit.className='soft';edit.style.cssText='border:0;border-radius:7px;padding:6px 9px;margin-top:6px;font-size:10px;font-weight:800';edit.textContent='Modifica voce e ricorrenza ›';edit.onclick=()=>{v48ReviewModal.classList.remove('open');openEdit(type,item)};
  row.append(top,metaEl,select,edit);root.append(row);
 }
}
function v48OpenReview(category){
 if(!v48ReviewModal){
  v48ReviewModal=document.createElement('div');v48ReviewModal.id='v48CategoriesModal';v48ReviewModal.className='modal';v48ReviewModal.innerHTML='<div class="sheet"><div class="sheetHead"><div class="sheetTitle">📊 Categorie</div><button type="button" class="close" id="v48CategoryClose" aria-label="Chiudi categorie">✕</button></div><div class="badge" id="v48CategorySummary"></div><div class="v48ReviewTools"><input type="search" id="v48CategorySearch" placeholder="Cerca una spesa…" aria-label="Cerca nelle categorie"><select id="v48CategoryFilter" aria-label="Filtra categorie"></select></div><div class="v48ReviewNote">Le correzioni valgono per la voce di questo mese. Per aggiornare una ricorrenza usa «Modifica voce e ricorrenza».</div><div id="v48CategoryRows"></div><div class="v48ReviewActions"><button type="button" class="soft" id="v48AnalyzeCategories">✨ Rianalizza automatiche</button><button type="button" class="soft" id="v48ShowCustom">＋ Nuova categoria</button></div><form id="v48CustomCategory" class="v48CustomForm hidden"><input type="text" id="v48CustomName" placeholder="Nome categoria" maxlength="40" required aria-label="Nome nuova categoria"><input type="color" id="v48CustomColor" value="#6497b1" aria-label="Colore nuova categoria"><button type="submit">Crea</button></form><div class="v48ReviewNote" id="v48CategoryFeedback" aria-live="polite">Riconoscimento locale tramite regole e correzioni memorizzate. Le categorie confermate a mano sono sempre mantenute.</div></div>';
  document.body.append(v48ReviewModal);const v48Sheet=v48ReviewModal.querySelector('.sheet'),v48Rows=$('v48CategoryRows');v48Sheet.insertBefore(v48ReviewModal.querySelector('.v48ReviewActions'),v48Rows);v48Sheet.insertBefore($('v48CustomCategory'),v48Rows);$('v48CategoryClose').onclick=()=>v48ReviewModal.classList.remove('open');v48ReviewModal.onclick=e=>{if(e.target===v48ReviewModal)v48ReviewModal.classList.remove('open')};$('v48CategorySearch').oninput=v48ReviewRows;$('v48CategoryFilter').onchange=v48ReviewRows;
  $('v48AnalyzeCategories').onclick=()=>{const changed=backfillExpenseCategories(true);save();v48ReviewRows();$('v48CategoryFeedback').textContent=changed+' voci automatiche controllate / aggiornate. Le conferme manuali restano conservate.'};
  $('v48ShowCustom').onclick=()=>{$('v48CustomCategory').classList.toggle('hidden');if(!$('v48CustomCategory').classList.contains('hidden'))$('v48CustomName').focus()};
  $('v48CustomCategory').onsubmit=e=>{e.preventDefault();const name=$('v48CustomName').value.trim(),color=$('v48CustomColor').value;if(!name)return;if(categoryPalette.some(([n])=>n.toLowerCase()===name.toLowerCase())){$('v48CategoryFeedback').textContent='Questa categoria esiste già.';return}categoryPalette.push([name,color]);if(!Array.isArray(data.customCategories))data.customCategories=[];data.customCategories.push({name,color});syncCategoryOptions();save();$('v48CustomName').value='';$('v48CustomCategory').classList.add('hidden');v48UpdateReviewOptions('');v48ReviewRows();$('v48CategoryFeedback').textContent='Categoria «'+name+'» creata: ora puoi assegnarla alle tue spese.'};
 }
 $('v48CategorySearch').value='';v48UpdateReviewOptions(category||'');v48ReviewRows();v48ReviewModal.classList.add('open');
}
function v48UpdateReviewOptions(selected){const select=$('v48CategoryFilter');select.replaceChildren();for(const [value,labelText] of [['','Tutte le categorie'],['__review','⚠ Da verificare'],...categoryPalette.map(([n])=>[n,n])]){const o=document.createElement('option');o.value=value;o.textContent=labelText;select.append(o)}select.value=selected||''}
$('smartReview').onclick=()=>v48OpenReview();
const V48_VIEW_KEY='speseFamiglia_v48_compact';
let v48Compact=true;try{v48Compact=localStorage.getItem(V48_VIEW_KEY)!=='false'}catch(e){}
$('v48Compact').checked=v48Compact;document.body.classList.toggle('v48Expanded',!v48Compact);
$('v48Compact').onchange=()=>{v48Compact=$('v48Compact').checked;document.body.classList.toggle('v48Expanded',!v48Compact);v48FitTwoRows();try{localStorage.setItem(V48_VIEW_KEY,String(v48Compact))}catch(e){}};
let v48RowsFrame=0;
function v48ScheduleTwoRows(){cancelAnimationFrame(v48RowsFrame);v48RowsFrame=requestAnimationFrame(v48FitTwoRows)}
window.addEventListener('resize',v48ScheduleTwoRows,{passive:true});
window.addEventListener('pageshow',v48ScheduleTwoRows);
if(document.fonts)document.fonts.ready.then(v48ScheduleTwoRows);
document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('.modal.open').forEach(m=>m.classList.remove('open'))});


// v75: when returning to the app after a month change, show the actual current month.
window.addEventListener('pageshow',()=>{if(!document.querySelector('.modal.open'))v75GoToCurrentMonth()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!document.querySelector('.modal.open'))v75GoToCurrentMonth()});

// v67: menu sempre disponibile per le spese, anche prima di attivare sottovoci.
function v65OpenItem(type,item){
 // La voce senza sottocategorie apre la modifica. Con sottocategorie apre subito il dashboard.
 const rule=item.ruleId&&data.rules[item.ruleId];
 if(!(item.subEnabled||rule?.subEnabled)){openEdit(type,item);return;}
 v65Current={type,item};
 v65OpenDashboard();
}
function v65OpenDashboard(){
 if(!v65Current)return;
 $('v65ChoiceModal').classList.remove('open');
 $('v65SubTitle').textContent=v65Current.item.name;
 $('v65SubModal').classList.add('open');
 try{v71Open()}catch(error){console.error('Errore apertura sottocategorie',error);$('v71Dashboard').textContent='Impossibile visualizzare i movimenti: '+error.message;}
}
$('v65EditChoice').onclick=()=>{
 $('v65ChoiceModal').classList.remove('open');
 if(v65Current)openEdit(v65Current.type,v65Current.item);
};
$('v65ShowSub').onclick=v65OpenDashboard;

// v65: sottovoci sono una ripartizione del budget, mai un'uscita aggiuntiva.
let v65Current=null;
function v65SubKey(type,item){return key()+'|'+type+'|'+(item.ruleId||item.id)}
// Le sottovoci ricorrenti appartengono alla voce madre (regola o movimento), non al singolo mese.
function v66Parent(type,item){return type+'|'+(item.ruleId||item.id)}
function v66Month(){return key()}
function v66MonthNumber(k){return Number(k.slice(5,7))}
function v66Matches(x,k){if(x.frequency==='once'||!x.frequency)return (x.startMonth||x.date?.slice(0,7))===k;const start=x.startMonth||x.date?.slice(0,7)||k;if(k<start)return false;const m=v66MonthNumber(k);if(x.frequency==='monthly')return true;if(x.frequency==='annual')return m===Number(x.annualMonth);if(x.frequency==='selectedYearly')return (x.months||[]).includes(m);if(x.frequency==='selectedOneYear')return Number(k.slice(0,4))===Number(x.year)&&(x.months||[]).includes(m);return false}
function v66AllSubs(){data.subentries=data.subentries||{};const parent=v66Parent(v65Current.type,v65Current.item);const entries=[...(data.subentries['recurring|'+parent]||[])];const old=data.subentries[v65SubKey(v65Current.type,v65Current.item)]||[];for(const x of old)if(!entries.some(z=>z.id===x.id))entries.push({...x,frequency:'once',startMonth:key()});return entries}
function v65SubList(){return v66AllSubs().filter(x=>v66Matches(x,key()))}
function v66FrequencyLabel(x){return {once:'Solo questo mese',monthly:'Ogni mese',annual:'Una volta all’anno',selectedYearly:'Mesi scelti ogni anno',selectedOneYear:'Mesi scelti solo in un anno'}[x.frequency||'once']||'Solo questo mese'}
function v66SetFrequency(){const f=$('v66SubFrequency').value;$('v66SubAnnualBox').classList.toggle('hidden',f!=='annual');$('v66SubMonthsBox').classList.toggle('hidden',!['selectedYearly','selectedOneYear'].includes(f));$('v66SubYearBox').classList.toggle('hidden',f!=='selectedOneYear')}
$('v66SubFrequency').onchange=v66SetFrequency;
const v66MonthNames=['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
for(let i=0;i<12;i++){const o=document.createElement('option');o.value=i+1;o.textContent=v66MonthNames[i];$('v66SubAnnualMonth').append(o);const label=document.createElement('label');label.style.cssText='font-size:12px;display:flex;gap:3px;align-items:center';const c=document.createElement('input');c.type='checkbox';c.value=i+1;c.className='v66SubMonthCheck';label.append(c,document.createTextNode(v66MonthNames[i]));$('v66SubMonths').append(label)}
function v66FillForm(x){$('v65SubName').value=x?.name||'';$('v65SubAmount').value=x?.amount||'';$('v65SubDate').value=x?.date||new Date().toLocaleDateString('en-CA');$('v66SubFrequency').value=x?.frequency||'once';$('v66SubAnnualMonth').value=x?.annualMonth||v66MonthNumber(key());$('v66SubYear').value=x?.year||Number(key().slice(0,4));document.querySelectorAll('.v66SubMonthCheck').forEach(c=>c.checked=!!x?.months?.includes(Number(c.value)));v66SetFrequency()}
let v66Editing=null;
function v66SaveSub(){if(!v65Current)return;const name=$('v65SubName').value.trim(),amount=Number($('v65SubAmount').value),date=$('v65SubDate').value,f=$('v66SubFrequency').value;if(!name||!Number.isFinite(amount)||amount<=0||!date)return alert('Inserisci descrizione, data e importo.');const months=[...document.querySelectorAll('.v66SubMonthCheck:checked')].map(c=>Number(c.value));if(['selectedYearly','selectedOneYear'].includes(f)&&!months.length)return alert('Seleziona almeno un mese.');const parent=v66Parent(v65Current.type,v65Current.item),id='recurring|'+parent;data.subentries=data.subentries||{};data.subentries[id]=data.subentries[id]||[];const old=v66Editing;const entry={id:old?.id||'s-'+Date.now()+'-'+Math.random().toString(16).slice(2),name,amount,date,frequency:f,startMonth:old?.startMonth||key(),annualMonth:Number($('v66SubAnnualMonth').value),year:Number($('v66SubYear').value),months};if(old){data.subentries[id]=data.subentries[id].filter(z=>z.id!==old.id);const legacy=v65SubKey(v65Current.type,v65Current.item);if(data.subentries[legacy])data.subentries[legacy]=data.subentries[legacy].filter(z=>z.id!==old.id)}data.subentries[id].push(entry);v66Editing=null;v66FillForm(null);$('v65SubAdd').textContent='＋ Aggiungi sottovoce';save();v65RenderSubs()}
function v65RenderSubs(){
 const rows=$('v65SubRows');rows.replaceChildren();
 const list=v65SubList(),used=list.reduce((n,x)=>n+Number(x.amount||0),0),budget=Number(v65Current.item.amount||0),remaining=budget-used;
 const pct=budget>0?Math.min(100,Math.max(0,used/budget*100)):0;
 $('v65Budget').innerHTML='<div class="v69BudgetTop"><span>💰 BUDGET DEL MESE</span><strong>'+euro(budget)+'</strong></div><div class="v69Progress" role="progressbar" aria-label="Budget utilizzato" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+Math.round(pct)+'"><div style="width:'+pct+'%"></div></div><div class="v69BudgetBottom"><div class="v69BudgetStat"><small>↗ Utilizzato</small><b>'+euro(used)+'</b></div><div class="v69BudgetStat '+(remaining<0?'over':'available')+'"><small>✓ '+(remaining<0?'Oltre il budget':'Disponibile')+'</small><b>'+euro(Math.abs(remaining))+'</b></div></div>';
 $('v69SubCount').textContent=list.length+' '+(list.length===1?'voce':'voci');
 for(const x of list){const row=document.createElement('div');row.className='v65SubRow';const info=document.createElement('div');info.className='v69SubRowInfo';const name=document.createElement('strong');name.textContent=x.name;const meta=document.createElement('small');meta.textContent=(x.date?new Date(x.date+'T12:00:00').toLocaleDateString('it-IT')+' · ':'')+v66FrequencyLabel(x);info.append(name,meta);const v=document.createElement('b');v.className='v69SubRowAmount';v.textContent=euro(x.amount);const edit=document.createElement('button');edit.textContent='✎';edit.title='Modifica sottovoce';edit.onclick=()=>{v66Editing=x;v66FillForm(x);$('v65SubAdd').textContent='Salva modifiche';$('v65SubName').scrollIntoView({behavior:'smooth',block:'center'})};const del=document.createElement('button');del.textContent='✕';del.className='v69Delete';del.title='Elimina sottovoce';del.onclick=()=>{if(!confirm('Eliminare questa sottovoce?'))return;const id='recurring|'+v66Parent(v65Current.type,v65Current.item);data.subentries[id]=(data.subentries[id]||[]).filter(z=>z.id!==x.id);const legacy=v65SubKey(v65Current.type,v65Current.item);if(data.subentries[legacy])data.subentries[legacy]=data.subentries[legacy].filter(z=>z.id!==x.id);save();v65RenderSubs()};row.append(info,v,edit,del);rows.append(row)}
 if(!list.length){const empty=document.createElement('div');empty.className='v69Empty';empty.innerHTML='<div class="v69EmptyIcon">🧾</div><b>Ancora nessuna sottovoce</b>Inserisci qui sotto la prima spesa per sapere quanto ti rimane del budget.';rows.append(empty)}
}
// v71: form replaced by dashboard; legacy data preserved.
// v65: riepilogo per anno, senza ricontare le sottovoci.
function v65RenderAnnual(){
 const year=Number($('v65AnnualYear').value),body=$('v65AnnualBody');body.replaceChildren();
 const months=[],cats=new Map(),categoryDetails=new Map();let inc=0,out=0;
 for(let m=0;m<12;m++){
  const k=key(year,m);let income=0,expense=0;
  for(const x of items('income',k))income+=Number(x.amount||0);
  for(const type of ['fixed','needs','policies'])for(const x of items(type,k)){
   const v=Number(x.amount||0);expense+=v;const cat=categoryForItem(x);cats.set(cat,(cats.get(cat)||0)+v);if(!categoryDetails.has(cat))categoryDetails.set(cat,[]);categoryDetails.get(cat).push({month:m,day:dayOf(x),name:x.name,amount:v});
  }
  months.push({name:ML[m],income,expense});inc+=income;out+=expense;
 }
 const node=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;return e};
 // Il bilancio annuale e' un saldo cumulativo, non il solo risultato dell'anno.
 // Si utilizza la medesima proiezione della Home al 31 dicembre dell'anno scelto:
 // cosi' il saldo iniziale del 2027 coincide con quello finale del 2026.
 const annualResult=inc-out;
 const yearEnd=key(year,11),previousYearEnd=key(year-1,11);
 const closingBalance=projectedBalance(yearEnd);
 const openingBalance=projectedBalance(previousYearEnd);
 const hero=node('div','v67AnnualHero');
 hero.append(node('div','v67Eyebrow','SALDO FINALE PREVISTO · '+year));
 hero.append(node('div','v67HeroValue',closingBalance===null?'Saldo da impostare':euro(closingBalance)));
 hero.append(node('div','v67HeroLabel',closingBalance===null?'Imposta il saldo reale del conto nella Home per calcolare il saldo cumulativo.':'Saldo complessivo al 31 dicembre '+year+', incluso il saldo degli anni precedenti.'));
 body.append(hero);
 const rollup=node('div','v70AnnualRollup');
 const opening=node('div','v70AnnualRollupRow');opening.append(node('span','','Saldo al 31/12/'+(year-1)),node('strong','',openingBalance===null?'—':euro(openingBalance)));rollup.append(opening);
 const movement=node('div','v70AnnualRollupRow');movement.append(node('span','','Entrate − uscite '+year),node('strong','',euro(annualResult)));rollup.append(movement);
 const ending=node('div','v70AnnualRollupRow v70AnnualRollupTotal');ending.append(node('span','','Saldo al 31/12/'+year),node('strong','',closingBalance===null?'—':euro(closingBalance)));rollup.append(ending);
 body.append(rollup);
 const kpis=node('div','v67YearKpis');for(const [name,value,cls] of [['Entrate',inc,'income'],['Uscite',out,'expense'],['Risultato dell’anno',inc-out,'saving']]){const card=node('div','v67YearKpi '+cls);card.append(node('small','',name),node('strong','',euro(value)));kpis.append(card)}body.append(kpis);
 const head=node('div','v67SectionHeading');head.append(node('h3','', 'Andamento mensile'),node('p','','Confronto tra entrate e uscite'));body.append(head);
 const legend=node('div','v67Legend');legend.innerHTML='<span><i class="v67Blue"></i>Entrate</span><span><i class="v67Orange"></i>Uscite</span>';body.append(legend);
 const max=Math.max(1,...months.flatMap(m=>[m.income,m.expense]));const chart=node('div','v67MonthlyChart');
 for(const m of months){const row=node('div','v67MonthlyRow');row.append(node('span','v67MonthName',m.name.slice(0,3)));const bars=node('div','v67MonthBars');for(const [v,cls] of [[m.income,'income'],[m.expense,'expense']]){const track=node('div','v67BarTrack');const bar=node('div','v67Bar '+cls);bar.style.width=(100*v/max)+'%';track.append(bar);bars.append(track)}row.append(bars);const amounts=node('div','v67MonthAmounts');amounts.append(node('span','',euro(m.income)),node('span','',euro(m.expense)));row.append(amounts);chart.append(row)}body.append(chart);
 const head2=node('div','v67SectionHeading');head2.append(node('h3','','Spese per categoria'),node('p','','Distribuzione annuale'));body.append(head2);
 const sorted=[...cats].filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]);
 if(sorted.length){const wrap=node('div','v67CategoryPanel');const donut=node('div','v67AnnualDonut');const colors=sorted.map(([name],i)=>categoryPalette.find(x=>x[0]===name)?.[1]||['#4d90d6','#e99b69','#66b49d','#9e8ed5'][i%4]);let angle=0;const stops=[];sorted.forEach(([name,v],i)=>{const next=angle+v/out*100;stops.push(colors[i]+' '+angle+'% '+next+'%');angle=next});donut.style.background='conic-gradient('+stops.join(',')+')';const inner=node('div','v67DonutInner');inner.append(node('small','','USCITE'),node('strong','',euro(out)));donut.append(inner);wrap.append(donut);for(const [i,[name,v]] of sorted.entries()){const r=node('div','v67CategoryRow');const dot=node('i','v67CatDot');dot.style.background=colors[i];r.append(dot,node('span','',name),node('strong','',euro(v)+' · '+Math.round(v/out*100)+'%'));r.classList.add('v68CategoryTap');r.setAttribute('role','button');r.tabIndex=0;r.setAttribute('aria-expanded','false');const detail=node('div','v68AnnualDetails');detail.hidden=true;for(const entry of categoryDetails.get(name)||[]){const line=node('div','v68AnnualDetailRow');const date=node('span','v68AnnualDate',String(entry.day||'—').padStart(2,'0')+' '+ML[entry.month].slice(0,3));line.append(date,node('span','v68AnnualName',entry.name),node('strong','',euro(entry.amount)));detail.append(line)}const toggle=()=>{detail.hidden=!detail.hidden;r.setAttribute('aria-expanded',String(!detail.hidden))};r.onclick=toggle;r.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle()}};wrap.append(r,detail)}body.append(wrap)}else body.append(node('p','v67Empty','Nessuna uscita registrata per questo anno.'));
}
const v68Colors=['#6497b1','#1f9f83','#ed994f','#e8b900','#7569d7','#e8698e','#d65050','#455c7a'];
const v68Palette=$('v68ColorChoices');for(const color of v68Colors){const b=document.createElement('button');b.type='button';b.className='v68ColorChip';b.style.background=color;b.setAttribute('aria-label','Seleziona colore '+color);b.onclick=()=>{$('v65CategoryColor').value=color;v68Palette.querySelectorAll('button').forEach(x=>x.classList.remove('selected'));b.classList.add('selected')};v68Palette.append(b)}
$('annualOpen').onclick=e=>{e.stopPropagation();const select=$('v65AnnualYear');select.replaceChildren();const years=new Set([...Array.from({length:51},(_,i)=>2026+i),cy,...Object.keys(data.months||{}).map(k=>Number(k.slice(0,4)))]);for(const y of [...years].filter(Number.isFinite).sort((a,b)=>a-b)){const opt=document.createElement('option');opt.value=y;opt.textContent=y;select.append(opt)}select.value=cy;$('v65AnnualModal').classList.add('open');v75SafeAnnual()};$('v65AnnualYear').onchange=v75SafeAnnual;
function v75SafeAnnual(){try{v65RenderAnnual()}catch(err){console.error('Errore analisi annuale',err);$('v65AnnualBody').textContent='Impossibile calcolare il riepilogo: '+err.message}}

try{dailyBackup()}catch(e){console.warn("Backup automatico non disponibile",e)}v75GoToCurrentMonth();render();checkDueAlerts();
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));

// v71: statement transactions are isolated per budget item; never added to main expenses.
let v71Period=key(),v71Mode='month',v71Filter='categories',v71ImportRows=[];
const v71Months=['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const v71Cats=['Alimentari','Ristoranti e bar','Tempo libero','Shopping','Trasporti','Abbonamenti','Commissioni','Regali','Salute','Casa','Altro'];
const v71Colors=['#fe638b','#8f6cf0','#34c985','#318bff','#ffb21e','#a9b6c7','#ec7c4a','#00a69b','#a276dc','#e7aa23','#7a8a9c'];
function v71Esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function v71Parent(){return v66Parent(v65Current.type,v65Current.item)}
function v71Records(){data.revolutStatements=data.revolutStatements||{};return data.revolutStatements[v71Parent()]||[]}
function v71Budget(k){const parent=v65Current.item;const rule=parent.ruleId&&data.rules[parent.ruleId];const k0=key();if(k===k0)return Number(parent.amount)||0;if(rule){const found=items(v65Current.type,k).find(x=>x.ruleId===parent.ruleId);return Number(found?.amount)||0}const found=items(v65Current.type,k).find(x=>x.id===parent.id);return Number(found?.amount)||0}
function v71Entries(k){const rec=v71Records().filter(x=>x.date?.startsWith(k));const original=v66AllSubs().filter(x=>v66Matches(x,k)).map(x=>({id:x.id,name:x.name,amount:x.amount,date:(x.frequency&&x.frequency!=='once'?k+'-'+String((x.date||'').slice(8,10)||'01').padStart(2,'0'):x.date),category:x.category||'Altro',manual:true,frequency:x.frequency}));return [...rec,...original].sort((a,b)=>(b.date||'').localeCompare(a.date||''))}
function v71Cat(name){const s=name.toLowerCase();if(/crai|supermerc|aliment|market|esselunga|lidl|conad/.test(s))return 'Alimentari';if(/caff|bar|ristoran|pizz|mcdonald|glovo|deliveroo/.test(s))return 'Ristoranti e bar';if(/cinema|uci|teatro|netflix|spotify/.test(s))return /netflix|spotify/.test(s)?'Abbonamenti':'Tempo libero';if(/easypark|parchegg|uber|trenitalia|taxi|benzina|carburante/.test(s))return 'Trasporti';if(/apple|openai|chatgpt|icloud|prime/.test(s))return 'Abbonamenti';if(/commission|canone|fee/.test(s))return 'Commissioni';if(/farmac|dent|medic/.test(s))return 'Salute';if(/fiore|regal|compleanno/.test(s))return 'Regali';if(/amazon|zalando|negozio|shopping/.test(s))return 'Shopping';return 'Altro'}
function v71Stats(rows){const cats={};for(const x of rows)cats[x.category||'Altro']=(cats[x.category||'Altro']||0)+Number(x.amount||0);return cats}
function v71Donut(cats,total){if(!total)return '<div class="v71Empty">Ancora nessuna spesa registrata.</div>';let at=0;const parts=Object.entries(cats).sort((a,b)=>b[1]-a[1]).map(([cat,v])=>{const col=v71Colors[Math.max(0,v71Cats.indexOf(cat))%v71Colors.length];const from=at;at+=v/total*100;return `${col} ${from}% ${at}%`});return `<div class="v71Donut" style="background:conic-gradient(${parts.join(',')})"><div class="v71DonutCenter">Spese<strong>${euro(total)}</strong></div></div>`}
function v71Nav(delta){if(v71Mode==='year'){v71Period=String(Number(v71Period.slice(0,4))+delta)+'-01'}else{const d=new Date(Number(v71Period.slice(0,4)),Number(v71Period.slice(5,7))-1+delta,1);v71Period=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}v71Render()}
function v71Open(){v71Period=key();v71Mode='month';v71Filter='categories';$('v71ImportOverlay').hidden=true;v71Render()}
function v71Render(){if(!v65Current)return;const y=Number(v71Period.slice(0,4)),m=Number(v71Period.slice(5,7))-1,months=v71Mode==='year'?Array.from({length:12},(_,i)=>`${y}-${String(i+1).padStart(2,'0')}`):[v71Period];const rows=months.flatMap(v71Entries);const budget=months.reduce((n,k)=>n+v71Budget(k),0);const used=rows.reduce((n,x)=>n+Number(x.amount||0),0);const remain=budget-used;const pct=budget>0?Math.min(100,Math.max(0,100*used/budget)):0;const cats=v71Stats(rows);const sorted=Object.entries(cats).sort((a,b)=>b[1]-a[1]);$('v71Period').textContent=v71Mode==='year'?String(y):v71Months[m]+' '+y;for(const [id,on] of [['v71TabMonth',v71Mode==='month'],['v71TabYear',v71Mode==='year'],['v71TabMoves',v71Mode==='moves']])$(id).classList.toggle('active',on);const annual=v71Mode==='year';let h=`<div class="v71Summary"><small>💰 Budget ${annual?'annuale':'del mese'}</small><div class="main">${euro(budget)}</div><div class="v71Progress"><div style="width:${pct}%"></div></div><div class="v71Split"><span>Utilizzato<strong>${euro(used)}</strong></span><span>Disponibile<strong class="${remain<0?'red':'green'}">${euro(remain)}</strong></span></div></div>`;
 if(annual){h+='<div class="v71Panel"><h3>📊 Andamento mensile</h3>';for(let i=0;i<12;i++){const k=`${y}-${String(i+1).padStart(2,'0')}`,sp=v71Entries(k).reduce((n,x)=>n+Number(x.amount||0),0),b=v71Budget(k);h+=`<button class="v71Cat" data-v71-month="${k}"><b>${v71Months[i]}</b><span style="color:#cf6643">${euro(sp)}</span><small>di ${euro(b)}</small>›</button>`}h+='</div>'}
 if(v71Mode==='moves'){h+='<div class="v71Panel"><h3>📋 Tutti i movimenti</h3>'+v71RowsHTML(rows)+'</div>'}else{h+=`<div class="v71Panel"><h3>📊 Spese per categoria · ${annual?'anno':'mese'}</h3>${v71Donut(cats,used)}`;if(sorted.length){h+=sorted.map(([cat,v])=>`<button class="v71Cat" data-v71-cat="${v71Esc(cat)}"><span class="v71CatIcon">${v71CatEmoji(cat)}</span><b>${v71Esc(cat)}<small>${rows.filter(x=>x.category===cat).length} movimenti</small></b><strong>${euro(v)}</strong><span>›</span></button>`).join('')}h+='</div><div class="v71Panel"><h3>📂 Dettaglio categorie</h3>';if(sorted.length)h+=sorted.map(([cat,v])=>`<details class="v71Group"><summary class="v71Cat"><span class="v71CatIcon">${v71CatEmoji(cat)}</span><b>${v71Esc(cat)}</b><strong>${euro(v)}</strong></summary>${v71RowsHTML(rows.filter(x=>x.category===cat))}</details>`).join('');else h+='<div class="v71Empty">Importa un estratto conto dall’icona ☁︎ in alto a destra oppure aggiungi una spesa manuale.</div>';h+='</div>'}
 h+=`<div class="v71Panel"><h3>＋ Aggiungi manualmente</h3><p class="v71ImportNote">Per una spesa non presente nell’estratto conto.</p><div class="v69SubForm"><label class="v69Field">Descrizione<input id="v71ManualName" placeholder="Es. Regalo compleanno"></label><div class="v65Inputs"><label class="v69Field">Data<input id="v71ManualDate" type="date" value="${annual?String(y)+'-01-01':v71Period+'-01'}"></label><label class="v69Field">Importo €<input id="v71ManualAmount" type="number" min="0.01" step="0.01"></label></div><label class="v69Field">Categoria<select id="v71ManualCat">${v71Cats.map(c=>`<option>${c}</option>`).join('')}</select></label><label class="v69Field">Frequenza<select id="v71ManualFreq"><option value="once">Solo questo mese</option><option value="monthly">Ogni mese</option><option value="annual">Una volta all’anno</option></select></label><button class="v71FullButton" id="v71ManualAdd">＋ Aggiungi spesa</button></div></div>`;
 $('v71Dashboard').innerHTML=h;
 $('v71Dashboard').querySelectorAll('[data-v71-month]').forEach(b=>b.onclick=()=>{v71Period=b.dataset.v71Month;v71Mode='month';v71Render()});$('v71Dashboard').querySelectorAll('[data-v71-cat]').forEach(b=>b.onclick=()=>{const d=[...$('v71Dashboard').querySelectorAll('details')].find(z=>z.querySelector('summary b')?.textContent===b.dataset.v71Cat);if(d){d.open=true;d.scrollIntoView({behavior:'smooth',block:'center'})}});
 $('v71ManualAdd').onclick=()=>{const name=$('v71ManualName').value.trim(),amount=Number($('v71ManualAmount').value),date=$('v71ManualDate').value,frequency=$('v71ManualFreq').value;if(!name||!date||amount<=0)return alert('Inserisci descrizione, data e importo.');const parent='recurring|'+v71Parent();data.subentries=data.subentries||{};data.subentries[parent]=data.subentries[parent]||[];data.subentries[parent].push({id:'s-'+Date.now(),name,amount,date,category:$('v71ManualCat').value,frequency,startMonth:date.slice(0,7),annualMonth:Number(date.slice(5,7))});save();v71Render()};
 $('v71Dashboard').querySelectorAll('[data-v71-remove]').forEach(b=>b.onclick=()=>{if(!confirm('Eliminare questo movimento?'))return;const id=b.dataset.v71Remove;if(id.startsWith('r-'))data.revolutStatements[v71Parent()]=v71Records().filter(x=>x.id!==id);else{const p='recurring|'+v71Parent();data.subentries[p]=(data.subentries[p]||[]).filter(x=>x.id!==id)}save();v71Render()});
}
function v71CatEmoji(c){return ({'Alimentari':'🛒','Ristoranti e bar':'☕','Tempo libero':'🎬','Shopping':'🛍️','Trasporti':'🚙','Abbonamenti':'🔁','Commissioni':'🏦','Regali':'🎁','Salute':'💊','Casa':'🏠','Altro':'📦'})[c]||'📦'}
function v71RowsHTML(rows){if(!rows.length)return '<div class="v71Empty">Nessun movimento.</div>';return rows.map(x=>`<div class="v71Line"><span class="v71Date">${v71Esc(x.date?.slice(8,10)||'--')}<small style="display:block">${v71Esc(v71Months[Number(x.date?.slice(5,7)||1)-1].slice(0,3))}</small></span><span class="v71LineName"><b>${v71Esc(x.name)}</b><small>${v71Esc(x.category||'Altro')}${x.manual?' · Manuale':''}</small></span><strong>${euro(x.amount)}</strong><button data-v71-remove="${v71Esc(x.id)}" title="Elimina">⋮</button></div>`).join('')}
$('v71Prev').onclick=()=>v71Nav(-1);$('v71Next').onclick=()=>v71Nav(1);$('v71TabMonth').onclick=()=>{v71Mode='month';v71Render()};$('v71TabYear').onclick=()=>{v71Mode='year';v71Render()};$('v71TabMoves').onclick=()=>{v71Mode='moves';v71Render()};$('v71UploadOpen').onclick=()=>{$('v71ImportOverlay').hidden=false};$('v71ImportClose').onclick=()=>{$('v71ImportOverlay').hidden=true};
function v71ParseEuro(s){return Number(String(s).replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,''))}
function v71MakeId(date,name,amount,tid){return 'r-'+(tid||`${date}|${name}|${amount}`)}
async function v71ParsePDF(file){if(!window.pdfjsLib){await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';script.onload=resolve;script.onerror=()=>reject(new Error('Impossibile caricare il lettore PDF: controlla la connessione.'));document.head.append(script)})}pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';const doc=await pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;const found=[];let section='';const mn={gen:1,feb:2,mar:3,apr:4,mag:5,giu:6,lug:7,ago:8,set:9,ott:10,nov:11,dic:12};for(let pi=1;pi<=doc.numPages;pi++){const page=await doc.getPage(pi),tc=await page.getTextContent();const lines=[];for(const x of tc.items){if(!x.str?.trim())continue;const y=x.transform[5],xx=x.transform[4];let line=lines.find(r=>Math.abs(r.y-y)<2.4);if(!line){line={y,items:[]};lines.push(line)}line.items.push({x:xx,text:x.str.trim()})}lines.sort((a,b)=>b.y-a.y);for(const line of lines)line.items.sort((a,b)=>a.x-b.x);let active=null;for(const line of lines){const txt=line.items.map(x=>x.text).join(' ');if(/In sospeso dal|In sospeso da/i.test(txt)){section='pending';active=null;continue}if(/Transazioni del conto dal/i.test(txt)){section='posted';active=null;continue}if(/Condizioni economiche|Attenzione|Altre informazioni importanti|Segnala carta come/i.test(txt)){active=null;continue}const match=txt.match(/\b(\d{1,2})\s+(gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)\s+(20\d{2})\b/i);if(match&&section){const d=`${match[3]}-${String(mn[match[2].toLowerCase()]).padStart(2,'0')}-${match[1].padStart(2,'0')}`;const first=line.items.find(x=>/\b\d{1,2}\s+(gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)\s+20\d{2}/i.test(x.text));const others=line.items.filter(x=>x!==first);const money=others.filter(x=>/^[-+]?\s*[\d.,]+\s*€$/.test(x.text));const desc=others.filter(x=>!money.includes(x)).map(x=>x.text).join(' ').trim();if(!desc||!money.length){active=null;continue}const amount=v71ParseEuro(money[0].text);const isCredit=/ricarica|ricevuto|accredito|bonifico in entrata/i.test(desc)||money[0].x>page.view[2]*0.64;active={id:'',name:desc,date:d,amount,category:v71Cat(desc),credit:isCredit,pending:section==='pending',tid:''};found.push(active)}else if(active&&/ID transazione\s*:/i.test(txt)){active.tid=(txt.match(/ID transazione\s*:\s*([a-z0-9-]+)/i)||[])[1]||''}}
}return found.filter(x=>x.amount>0).map(x=>({...x,id:v71MakeId(x.date,x.name,x.amount,x.tid)}))}
function v71CSVRows(text){const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.trim());if(lines.length<2)throw Error('CSV vuoto');const sep=lines[0].includes(';')?';':',';const parse=l=>{const a=[];let v='',q=false;for(let i=0;i<l.length;i++){const c=l[i];if(c==='"'){if(q&&l[i+1]==='"'){v+='"';i++}else q=!q}else if(c===sep&&!q){a.push(v);v=''}else v+=c}a.push(v);return a};const head=parse(lines[0]).map(x=>x.toLowerCase().trim());const ix=(...terms)=>head.findIndex(x=>terms.some(t=>x.includes(t)));const di=ix('started date','completed date','date','data'),ni=ix('description','descrizione','merchant'),ai=ix('amount','importo'),ti=ix('type','tipo'),idix=ix('transaction id','id transazione'),currency=ix('currency','valuta');if(di<0||ni<0||ai<0)throw Error('CSV non riconosciuto: servono data, descrizione e importo.');return lines.slice(1).map(l=>{const a=parse(l),raw=a[di]||'',iso=/^\d{4}-\d{2}-\d{2}/.test(raw)?raw.slice(0,10):/^\d{2}\/\d{2}\/\d{4}/.test(raw)?raw.slice(6,10)+'-'+raw.slice(3,5)+'-'+raw.slice(0,2):'',value=v71ParseEuro(a[ai]||''),name=a[ni]||'',type=a[ti]||'';return {date:iso,name,amount:Math.abs(value),credit:value>0||/topup|transfer in|deposit|ricarica/i.test(type+' '+name),pending:/pending|in sospeso/i.test(type),category:v71Cat(name),id:v71MakeId(iso,name,Math.abs(value),a[idix]||''),invalid:currency>=0&&a[currency]&&a[currency]!=='EUR'}}).filter(x=>x.date&&x.amount>0&&!x.invalid)}
$('v71ImportFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;$('v71ImportStatus').textContent='Lettura estratto conto…';$('v71ImportPreview').replaceChildren();$('v71ImportConfirm').style.display='none';try{const rows=/\.pdf$/i.test(file.name)?await v71ParsePDF(file):v71CSVRows(await file.text());v71ImportRows=rows.filter(x=>!x.credit&&!x.pending&&!/giroconto|trasferimento tra conti|ricarica|top.?up/i.test(x.name));if(!rows.length)throw Error('Nessun movimento riconosciuto nel PDF. Verifica che sia un estratto Revolut con testo selezionabile.');const ignored=rows.length-v71ImportRows.length;const existing=new Set(v71Records().map(x=>x.id));$('v71ImportStatus').textContent=`${rows.length} movimenti letti · ${v71ImportRows.length} spese · ${ignored} trasferimenti/operazioni sospese esclusi.`;const wrap=$('v71ImportPreview');for(const x of v71ImportRows){const row=document.createElement('div');row.className='v71PreviewRow';const checked=!existing.has(x.id);row.innerHTML=`<input type="checkbox" ${checked?'checked':''} ${checked?'':'disabled'}><div class="v71LineName"><b>${v71Esc(x.name)}</b><small>${v71Esc(x.date)}${checked?'':' · Già importato'}</small></div><b>${euro(x.amount)}</b><select>${v71Cats.map(c=>`<option ${x.category===c?'selected':''}>${c}</option>`).join('')}</select>`;x.check=row.querySelector('input');x.select=row.querySelector('select');wrap.append(row)}$('v71ImportConfirm').style.display=v71ImportRows.some(x=>!existing.has(x.id))?'block':'none';if(!v71ImportRows.length)$('v71ImportStatus').textContent+=' Nessuna nuova spesa da importare.'}catch(err){$('v71ImportStatus').textContent='Errore: '+err.message}e.target.value=''};
$('v71ImportConfirm').onclick=()=>{if(!v65Current)return;const old=v71Records(),known=new Set(old.map(x=>x.id));const add=v71ImportRows.filter(x=>x.check?.checked&&!known.has(x.id)).map(x=>({id:x.id,date:x.date,name:x.name,amount:x.amount,category:x.select.value,source:'revolut'}));data.revolutStatements[v71Parent()]=old.concat(add);save();$('v71ImportOverlay').hidden=true;v71Period=add[0]?.date.slice(0,7)||v71Period;v71Mode='month';v71Render();alert(`${add.length} movimenti importati senza modificare le uscite del bilancio principale.`)};


})();
