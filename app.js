/* Obzory Plánovač – logika aplikace.
   Veškerý obsah festivalu (program, plánek budovy, místa na mapě, nastavení) je ve složce data/.
   Pro nový ročník stačí vyměnit data/program.csv a upravit data/festival.json. */
'use strict';

/* typy programu: klíč v CSV → název filtru (barvy jsou ve styles.css, třídy .t-xx) */
const TYPES={
 pr:'Přednášky', ha:'Horo-akademie', ws:'Workshopy a dovednosti', ko:'Konzultace',
 se:'Setkání a večírek', fi:'Filmy', ja:'Jídlo a ochutnávky'};
const TYPE1={pr:'Přednáška',ha:'Horo-akademie',ws:'Workshop',ko:'Konzultace',se:'Setkání',fi:'Film',ja:'Ochutnávka'};

/* naplní se z data/*.json a data/program.csv při startu (boot) */
let FEST={},DAYS=[],HALLS={},ITEMS=[],BY={},PL={},RULES=[],LAND_D='',VENUE={},ZONE={},GROUPS=[],PLACE_RULES=[],ROOM_LABELS={},PUBLIC_URL='',ADDR='',KEY='plan',UIKEY='ui';
const dayOf=k=>DAYS.find(d=>d.k===k)||{};
const dayIdx=k=>DAYS.findIndex(d=>d.k===k);
const toMin=s=>{const [h,m]=s.split(':').map(Number);return h*60+m};
const fmt=m=>Math.floor(m/60)+':'+String(m%60).padStart(2,'0');
const norm=s=>(s||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
function floorOf(p){let m=p.match(/sál (\d)\d\d/i);if(m)return +m[1];m=p.match(/(\d)\. patro/);return m?+m[1]:null}
function roomOf(p){
  if(!p)return {room:'místo neuvedeno',name:''};
  let r=p.replace(/,?\s*\d\. patro$/,'').trim();
  const lk=Object.keys(ROOM_LABELS).find(k=>norm(k)===norm(r));if(lk)r=ROOM_LABELS[lk];
  const m=r.match(/^sál (\d{3})$/i);
  return {room:r,name:m&&HALLS[m[1]]?HALLS[m[1]]:''};
}
const flBadge=f=>f?`<span class="fl" title="${f}. patro">${f}.<small>p</small></span>`:`<span class="fl unk" title="patro neuvedeno">?</span>`;
function locHTML(it){const r=roomOf(it.place);
  return `<span class="loc">${it.place&&!/Praha/.test(it.place)?flBadge(it.floor):''}<span class="room">${esc(r.room)}</span>${r.name?`<span class="hall">${esc(r.name)}</span>`:''}</span>`}
function locText(it){const r=roomOf(it.place);return `${it.floor?it.floor+'. patro, ':''}${r.room}${r.name?' ('+r.name+')':''}`}

const st={day:'',view:'list',q:'',cats:new Set(Object.keys(TYPES)),fit:false,plan:new Set(),open:new Set(),copyText:null};
function save(){try{localStorage.setItem(KEY,JSON.stringify([...st.plan]))}catch(e){}}
function saveUi(){try{localStorage.setItem(UIKEY,JSON.stringify({day:st.day,view:st.view}))}catch(e){}}
const overlap=(a,b)=>a.day===b.day&&a.start<b.end&&b.start<a.end;
function clashes(it){
  if(it.flex)return [];
  return [...st.plan].map(id=>BY[id]).filter(p=>p.id!==it.id&&!p.flex&&overlap(p,it));
}
function toggle(id){
  st.plan.has(id)?st.plan.delete(id):st.plan.add(id);save();render();refreshSheet();
}
const PIN='<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 15s5-4.6 5-8.5A5 5 0 0 0 3 6.5C3 10.4 8 15 8 15z"/><circle cx="8" cy="6.5" r="1.8"/></svg>';

/* sharing + calendar export */
const EMBEDDED=(()=>{try{return window.top!==window}catch(e){return true}})();
function shareURL(){return (EMBEDDED?PUBLIC_URL:location.origin+location.pathname)+'#plan-'+[...st.plan].join('-')}
function copyOut(txt,okMsg){
  const fallback=()=>{st.copyText=txt;render();const c=$('#copybox');if(c){c.focus();c.select()}toast('Kopírování se nepovedlo, text je označený níže')};
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(txt).then(()=>{if(st.copyText!==null){st.copyText=null;render()}toast(okMsg)}).catch(fallback);
  else fallback();
}
const hms=m=>String(Math.floor(m/60)).padStart(2,'0')+String(m%60).padStart(2,'0')+'00';
const ymd=d=>dayOf(d).date.replace(/-/g,'');
const nextYmd=d=>{const t=new Date(dayOf(d).date+'T12:00:00Z');t.setUTCDate(t.getUTCDate()+1);return t.toISOString().slice(0,10).replace(/-/g,'')};
const evLoc=it=>/Praha/.test(it.place)?it.place:`${ADDR} · ${locText(it)}`;
const evDetails=it=>[it.who,it.note,it.flex&&!it.all?'Konzultace: přijď kdykoli během bloku.':'',it.url,FEST.title].filter(Boolean).join('\n');
function gcalURL(it){
  const dates=it.all?`${ymd(it.day)}/${nextYmd(it.day)}`:`${ymd(it.day)}T${hms(it.start)}/${ymd(it.day)}T${hms(it.end)}`;
  const p=new URLSearchParams({action:'TEMPLATE',text:`${it.title} · Obzory`,dates,details:evDetails(it),location:evLoc(it)});
  if(!it.all)p.set('ctz','Europe/Prague');
  return 'https://calendar.google.com/calendar/render?'+p.toString();
}
const icsEsc=v=>String(v).replace(/\\/g,'\\\\').replace(/;/g,'\;').replace(/,/g,'\\,').replace(/\r?\n/g,'\\n');
const icsFold=l=>{const out=[];let r=l;while(r.length>70){out.push(r.slice(0,70));r=' '+r.slice(70)}out.push(r);return out.join('\r\n')};
function planItemsSorted(){return [...st.plan].map(id=>BY[id]).filter(Boolean).sort((a,b)=>dayIdx(a.day)-dayIdx(b.day)||(b.all-a.all)||a.start-b.start)}
function buildICS(){
  const now=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z');
  const L=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Obzory Planovac//CS','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:'+icsEsc(FEST.title+' – můj plán'),'X-WR-TIMEZONE:Europe/Prague',
    'BEGIN:VTIMEZONE','TZID:Europe/Prague',
    'BEGIN:DAYLIGHT','TZOFFSETFROM:+0100','TZOFFSETTO:+0200','TZNAME:CEST','DTSTART:19700329T020000','RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU','END:DAYLIGHT',
    'BEGIN:STANDARD','TZOFFSETFROM:+0200','TZOFFSETTO:+0100','TZNAME:CET','DTSTART:19701025T030000','RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU','END:STANDARD',
    'END:VTIMEZONE'];
  for(const it of planItemsSorted()){
    L.push('BEGIN:VEVENT',`UID:${FEST.storageKey}-${it.id}@obzory-planovac`,`DTSTAMP:${now}`);
    if(it.all)L.push(`DTSTART;VALUE=DATE:${ymd(it.day)}`,`DTEND;VALUE=DATE:${nextYmd(it.day)}`);
    else L.push(`DTSTART;TZID=Europe/Prague:${ymd(it.day)}T${hms(it.start)}`,`DTEND;TZID=Europe/Prague:${ymd(it.day)}T${hms(it.end)}`);
    L.push(`SUMMARY:${icsEsc(it.title+' · Obzory')}`,`LOCATION:${icsEsc(evLoc(it))}`,`DESCRIPTION:${icsEsc(evDetails(it))}`);
    if(it.url)L.push(`URL:${it.url}`);
    if(it.flex)L.push('TRANSP:TRANSPARENT');
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(icsFold).join('\r\n')+'\r\n';
}
function downloadICS(){
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([buildICS()],{type:'text/calendar;charset=utf-8'}));
  a.download=norm(FEST.title).replace(/[^a-z0-9]+/g,'-')+'-muj-plan.ics';document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1500);toast('Soubor .ics stažen');
}
function openCal(){
  openSheetFn('Do kalendáře',()=>{
    const items=planItemsSorted();if(!items.length)return '<p class="hint">Plán je prázdný.</p>';
    const all=EMBEDDED
      ?`<p class="hint">Celý plán jako soubor .ics stáhneš na veřejné verzi stránky: <a href="${shareURL()}" target="_blank" rel="noopener">otevřít veřejnou verzi ↗</a></p>`
      :`<button class="btn" data-act="ics">Stáhnout celý plán (.ics)</button><p class="hint" style="margin-top:6px">Google Kalendář na počítači: Nastavení → Import a export → Importovat. Na telefonu soubor otevři a vyber kalendář. Funguje i v Apple a Outlook kalendáři.</p>`;
    let h=`<div class="calall">${all}</div><div class="flexhead">Nebo po jednom do Google Kalendáře</div>`,lastD;
    for(const it of items){
      if(it.day!==lastD){lastD=it.day;h+=`<div class="calday">${DAYS.find(d=>d.k===it.day).long}</div>`}
      h+=`<div class="calrow"><span class="mark t-${it.t}"></span><div class="calmain"><b class="num">${it.all?'celý den':fmt(it.start)+'–'+fmt(it.end)}</b> ${esc(it.title)}<span>${esc(locText(it))}</span></div><a class="btn ghost small" href="${esc(gcalURL(it))}" target="_blank" rel="noopener">Přidat ↗</a></div>`;
    }
    return h+'<p class="hint">Každé „Přidat“ otevře Google Kalendář s předvyplněnou událostí, stačí ji uložit.</p>';
  });
}

const STAR='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1L3.2 9.6l6.1-.8z"/></svg>';
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function itemHTML(it,opts={}){
  const on=st.plan.has(it.id), cl=on?[]:clashes(it), open=st.open.has(it.id)||opts.open;
  const time=(opts.day?DAYS.find(d=>d.k===it.day).short+' ':'')+(it.all?'celý den':`${fmt(it.start)}–${fmt(it.end)}`);
  return `<article class="item ${on?'on':''} ${cl.length?'clash':''}" data-id="${it.id}">
    <span class="mark t-${it.t}" title="${TYPE1[it.t]}"></span>
    <div class="item-main">
      <button class="item-title" data-act="open" aria-expanded="${open}">${esc(it.title)}</button>
      <div class="meta"><span class="num"><b>${time}</b></span>${locHTML(it)}${it.who?`<span>${esc(it.who)}</span>`:''}</div>
      ${cl.length?`<span class="badge bad">Kolize: ${esc(cl.map(c=>c.title).join(', '))}</span>`:''}
      ${it.flex&&!it.all?'<span class="badge">Přijď kdykoli během bloku</span>':''}
      ${open?`<div class="more">${it.note?esc(it.note)+' ':''}<span style="color:var(--muted)">${TYPE1[it.t]}.</span> ${it.url?`<a href="${it.url}" target="_blank" rel="noopener">Detail na webu festivalu ↗</a>`:''}</div>`:''}
      ${(opts.where||open)&&!opts.nowhere&&it.zones.length?`<button class="wherebtn" data-act="where">${PIN}Kde to je</button>`:''}
    </div>
    <button class="star" data-act="star" aria-pressed="${on}" aria-label="${on?'Odebrat z plánu':'Přidat do plánu'}: ${esc(it.title)}">${STAR}</button>
  </article>`;
}

function matches(it){
  const q=norm(st.q.trim());
  return st.cats.has(it.t)&&(!st.floor||it.floor===st.floor)&&(!q||q.split(/\s+/).every(w=>it.hay.includes(w)))
    &&(!st.fit||st.plan.has(it.id)||!clashes(it).length);
}
function filtered(){return ITEMS.filter(it=>it.day===st.day&&matches(it))}

function renderList(){
  const items=filtered();
  if(!items.length)return `<div class="empty">Nic neodpovídá filtru. Zkus jiné hledání nebo zapni další kategorie.</div>`;
  const groups=new Map();
  items.sort((a,b)=>(b.all-a.all)||a.start-b.start||a.t.localeCompare(b.t)||a.title.localeCompare(b.title,'cs'));
  for(const it of items){const k=it.all?'all':it.start;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(it)}
  let h='<div style="margin-top:6px">';
  for(const [k,arr] of groups){
    h+=`<section class="slot"><div class="slot-time num">${k==='all'?'Celý<small>den</small>':fmt(k)}</div><div class="slot-items">${arr.map(i=>itemHTML(i)).join('')}</div></section>`;
  }
  return h+'</div>';
}

let gridGroups={};
function renderGrid(){
  const items=filtered().filter(i=>!i.all);
  if(!items.length)return `<div class="empty">Nic neodpovídá filtru.</div>`;
  const t0=Math.floor(Math.min(...items.map(i=>i.start))/60)*60, t1=Math.ceil(Math.max(...items.map(i=>i.end))/60)*60;
  // stretch the day across the available width; below a readable minimum the timeline scrolls sideways
  const narrow=innerWidth<560, LW=narrow?92:118, avail=LAY.w-LW-2;
  const PPM=Math.max(narrow?2:1.4,avail/(t1-t0));
  const W=Math.floor((t1-t0)*PPM), fits=W<=avail;
  // rows by place; consultations aggregated per place+slot
  const rows=new Map(); gridGroups={};
  for(const it of items){
    const key=it.place||'— bez místa';
    if(!rows.has(key))rows.set(key,[]);
    if(it.t==='ko'){
      const gk=key+'@'+it.start;
      if(!gridGroups[gk]){gridGroups[gk]={id:'g:'+gk,group:[],start:it.start,end:it.end,t:'ko',place:key};rows.get(key).push(gridGroups[gk])}
      gridGroups[gk].group.push(it);
    } else rows.get(key).push(it);
  }
  const rank=p=>{const m=p.match(/sál (\d{3})/i);return m?+m[1]:(p.startsWith('—')?9999:5000)};
  const fk=p=>floorOf(p)??9;
  const keys=[...rows.keys()].sort((a,b)=>fk(a)-fk(b)||rank(a)-rank(b)||a.localeCompare(b,'cs'));
  let ticks='',heads='';
  for(let t=t0;t<=t1;t+=60){const x=(t-t0)*PPM;ticks+=`<div class="gtick" style="left:${x}px"></div>`;if(t<t1)heads+=`<div style="left:${x}px">${t/60}:00</div>`}
  let h=`<div class="gridwrap bleed${fits?' fits':''}"><div class="gtable" style="width:${W+LW}px;--lw:${LW}px">
    <div class="grow ghead" style="border-top:0;height:28px"><div class="glabel" style="padding:6px 8px"></div><div class="gtrack" style="width:${W}px">${heads}</div></div>`;
  let lastF;
  for(const k of keys){
    const arr=rows.get(k).sort((a,b)=>a.start-b.start||b.end-a.end), lanes=[];
    for(const it of arr){let l=lanes.findIndex(e=>e<=it.start);if(l<0){l=lanes.length;lanes.push(0)}lanes[l]=it.end;it._lane=l}
    const H=lanes.length*40+8;
    const fl=floorOf(k);
    if(fl!==lastF){lastF=fl;h+=`<div class="gfloor" style="width:${W+LW}px"><span>${fl?flBadge(fl)+` ${fl}. patro`:'Patro neuvedeno'}</span></div>`}
    const r=roomOf(k.startsWith('—')?'':k);
    const lab=`${esc(r.room.replace(/^sál/,'Sál'))}${r.name?`<span>${esc(r.name)}</span>`:''}`;
    h+=`<div class="grow" style="height:${H}px"><div class="glabel">${lab}</div><div class="gtrack" style="width:${W}px;height:${H}px">${ticks}`;
    for(const it of arr){
      const x=(it.start-t0)*PPM+2, w=Math.max((it.end-it.start)*PPM-4,24), y=it._lane*40+4;
      const grp=it.group, on=grp?grp.some(g=>st.plan.has(g.id)):st.plan.has(it.id);
      const title=grp?`Konzultace · ${grp.length} ${grp.length===1?'téma':grp.length<5?'témata':'témat'}`:it.title;
      const sub=grp?grp.map(g=>g.title).slice(0,3).join(', '):`${fmt(it.start)}–${fmt(it.end)}${it.who?' · '+it.who:''}`;
      h+=`<button class="gbar t-${it.t} ${on?'on':''}" style="left:${x}px;top:${y}px;width:${w}px" data-act="${grp?'grp':'sheet'}" data-id="${esc(it.id)}" title="${esc(title)}"><b>${on?'★ ':''}${esc(title)}</b><span class="num">${esc(sub)}</span></button>`;
    }
    h+='</div></div>';
  }
  return h+`</div></div><p class="hint">${fits?'':'Posuň do strany pro celý den. '}Ťukni na blok pro detail a přidání do plánu. Celodenní body najdeš v seznamu.</p>`;
}

/* ---------- world map: own simplified SVG (no third-party services) ---------- */
const PRJ=(lon,lat)=>[+(lon+180).toFixed(2),+(90-lat).toFixed(2)];
const WORLD={x:0,y:6,w:360,h:142};
let mapAgg=new Map(),mapVB=null,worldCtl=null;
const TORDER=Object.keys(TYPES);
function typeCounts(arr){const m={};for(const i of arr)m[i.t]=(m[i.t]||0)+1;return TORDER.filter(t=>m[t]).map(t=>[t,m[t]])}
function mapScope(){return ITEMS.filter(it=>(st.mapAll||it.day===st.day)&&matches(it))}
function renderMap(){
  const scope=mapScope();mapAgg=new Map();let none=0;
  for(const it of scope){if(!it.dest.length){none++;continue}for(const k of it.dest){if(!mapAgg.has(k))mapAgg.set(k,[]);mapAgg.get(k).push(it)}}
  const dests=[...mapAgg].sort((a,b)=>b[1].length-a[1].length||PL[a[0]][0].localeCompare(PL[b[0]][0],'cs'));
  const dayName=DAYS.find(d=>d.k===st.day).long;
  let grat='';for(let x=0;x<=360;x+=30)grat+=`M${x} 0V180`;for(let y=30;y<180;y+=30)grat+=`M0 ${y}H360`;
  const [hx,hy]=PRJ(14.42,50.08);
  // smaller pins on top
  // each pin is a small pie: slices = share of event types at that place, colored like the filter chips
  const pins=dests.map(([k,arr])=>{const [x,y]=PRJ(PL[k][2],PL[k][1]),n=arr.length,on=arr.some(i=>st.plan.has(i.id)),R=4+2.6*Math.sqrt(n);
    const tc=typeCounts(arr),C=Math.PI*R;let acc=0,body='';
    if(tc.length===1)body=`<circle class="solid t-${tc[0][0]}" r="${R.toFixed(1)}"/>`;
    else for(const [t,c] of tc){const len=c/n*C;body+=`<circle class="seg t-${t}" r="${(R/2).toFixed(2)}" stroke-width="${R.toFixed(2)}" stroke-dasharray="${len.toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}" transform="rotate(-90)"/>`;acc+=len}
    const lab=`${PL[k][0]}: ${tc.map(([t,c])=>`${c}× ${TYPE1[t].toLowerCase()}`).join(', ')}`;
    return `<g class="pin${on?' on':''}" data-k="${k}" data-x="${x}" data-y="${y}" transform="translate(${x} ${y})" tabindex="0" role="button" aria-label="${esc(lab)}"><title>${esc(lab)}</title>${on?`<circle class="ring" r="${(R+3.5).toFixed(1)}"/>`:''}${body}<circle class="rim" r="${R.toFixed(1)}"/><text x="${(R+(on?6:3)).toFixed(1)}" y="4">${esc(PL[k][0])}</text></g>`}).join('');
  return `<div class="maptools"><div class="seg" role="group" aria-label="Rozsah mapy">
      <button data-act="mapday" aria-pressed="${!st.mapAll}">${dayName}</button><button data-act="mapall" aria-pressed="${!!st.mapAll}">Celý víkend</button></div>
      <span class="hint" style="margin:0">${dests.length} míst · ${scope.length-none} bodů programu</span></div>
    <div class="mapbox bleed">
      <svg id="worldsvg" viewBox="${WORLD.x} ${WORLD.y} ${WORLD.w} ${WORLD.h}" preserveAspectRatio="xMidYMid meet" role="group" aria-label="Mapa světa s místy z programu">
        <rect x="-400" y="-300" width="1160" height="780" class="sea"/>
        <path class="grat" d="${grat}"/>
        <path class="land" d="${LAND_D}"/>
        <g class="pin home" data-x="${hx}" data-y="${hy}" transform="translate(${hx} ${hy})"><rect x="-4" y="-4" width="8" height="8"/><text x="8" y="4">Obzory · Praha</text></g>
        ${pins}
      </svg>
      <div class="mapctl"><button data-act="zin" aria-label="Přiblížit">+</button><button data-act="zout" aria-label="Oddálit">−</button><button data-act="zreset" aria-label="Celý svět">⟲</button></div>
    </div>
    <div class="legend">${[...new Set(scope.filter(i=>i.dest.length).map(i=>i.t))].sort((a,b)=>TORDER.indexOf(a)-TORDER.indexOf(b)).map(t=>`<span><i class="t-${t}"></i>${TYPES[t]}</span>`).join('')}</div>
    <div class="legend"><span><i class="pie"></i>výseče = poměr typů, větší = víc bodů</span><span><i class="ringi"></i>máš v plánu</span><span><i class="sq"></i>Obzory, Praha</span><span>Táhni, kolečkem nebo prsty přibliž, ťukni na bod.</span></div>
    <div class="dests">${dests.map(([k,arr])=>`<button class="dest ${arr.some(i=>st.plan.has(i.id))?'on':''}" data-act="place" data-k="${k}"><span class="tdots">${typeCounts(arr).map(([t])=>`<i class="t-${t}"></i>`).join('')}</span><b>${esc(PL[k][0])}</b><span class="n">${arr.length}</span></button>`).join('')||'<span class="hint">Žádné místo neodpovídá filtru.</span>'}</div>
    <p class="hint">${none} ${none===1?'bod nemá':none<5?'body nemají':'bodů nemá'} konkrétní místo (výbava, první pomoc, setkání…), najdeš je v seznamu. Místa jsou přiřazená podle názvu a jsou orientační, mapa je zjednodušená.</p>`;
}
function setupWorld(){
  const svg=document.getElementById('worldsvg');if(!svg){worldCtl=null;return}
  let vb=mapVB?{...mapVB}:{...WORLD};
  const ppuOf=()=>{const r=svg.getBoundingClientRect();return Math.min(r.width/vb.w,r.height/vb.h)||1};
  const apply=()=>{
    vb.w=Math.min(Math.max(vb.w,10),WORLD.w);vb.h=vb.w*WORLD.h/WORLD.w;
    vb.x=Math.min(Math.max(vb.x,WORLD.x-vb.w*.3),WORLD.x+WORLD.w-vb.w*.7);
    vb.y=Math.min(Math.max(vb.y,WORLD.y-vb.h*.3),WORLD.y+WORLD.h-vb.h*.7);
    svg.setAttribute('viewBox',`${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    const s=1/ppuOf();
    svg.querySelectorAll('.pin').forEach(g=>g.setAttribute('transform',`translate(${g.dataset.x} ${g.dataset.y}) scale(${s})`));
    svg.classList.toggle('zoomed',vb.w<=70);
    mapVB={...vb};
  };
  const toSvg=(cx,cy)=>{const p=svg.createSVGPoint();p.x=cx;p.y=cy;return p.matrixTransform(svg.getScreenCTM().inverse())};
  const zoomAt=(f,cx,cy)=>{
    const p=cx==null?{x:vb.x+vb.w/2,y:vb.y+vb.h/2}:toSvg(cx,cy);
    const nw=Math.min(Math.max(vb.w/f,10),WORLD.w),k=nw/vb.w;
    vb.x=p.x-(p.x-vb.x)*k;vb.y=p.y-(p.y-vb.y)*k;vb.w=nw;apply();
  };
  svg.addEventListener('wheel',e=>{e.preventDefault();zoomAt(e.deltaY<0?1.25:.8,e.clientX,e.clientY)},{passive:false});
  const pts=new Map();let moved=0,downPin=null,pinchD=0;
  const dist=()=>{const [a,b]=[...pts.values()];return Math.hypot(a.x-b.x,a.y-b.y)};
  const mid=()=>{const [a,b]=[...pts.values()];return {x:(a.x+b.x)/2,y:(a.y+b.y)/2}};
  svg.addEventListener('pointerdown',e=>{
    downPin=e.target.closest('.pin:not(.home)');pts.set(e.pointerId,{x:e.clientX,y:e.clientY});moved=0;
    try{svg.setPointerCapture(e.pointerId)}catch(_){}
    if(pts.size===2){pinchD=dist();downPin=null}
  });
  svg.addEventListener('pointermove',e=>{
    if(!pts.has(e.pointerId))return;const prev=pts.get(e.pointerId);pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pts.size===1){const dx=e.clientX-prev.x,dy=e.clientY-prev.y;moved+=Math.abs(dx)+Math.abs(dy);if(moved<4)return;const s=ppuOf();vb.x-=dx/s;vb.y-=dy/s;apply();svg.classList.add('dragging')}
    else if(pts.size===2){const d=dist();if(pinchD){const m=mid();zoomAt(d/pinchD,m.x,m.y)}pinchD=d;moved+=10}
  });
  const end=e=>{
    if(!pts.has(e.pointerId))return;pts.delete(e.pointerId);if(pts.size<2)pinchD=0;svg.classList.remove('dragging');
    if(e.type==='pointerup'&&moved<6&&downPin&&pts.size===0)openPlace([downPin.dataset.k],PL[downPin.dataset.k][0]);
    if(!pts.size)downPin=null;
  };
  svg.addEventListener('pointerup',end);svg.addEventListener('pointercancel',end);
  svg.addEventListener('keydown',e=>{const p=e.target.closest&&e.target.closest('.pin:not(.home)');if(p&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openPlace([p.dataset.k],PL[p.dataset.k][0])}});
  worldCtl={zoomAt,reset:()=>{vb={...WORLD};apply()},apply};
  apply();
}
function openPlace(keys,title){
  const seen=new Set(),items=[];
  for(const k of keys)for(const it of (mapAgg.get(k)||[]))if(!seen.has(it.id)){seen.add(it.id);items.push(it)}
  items.sort((a,b)=>dayIdx(a.day)-dayIdx(b.day)||a.start-b.start);
  openSheet(items,title,!!st.mapAll);
}
let rsT,rsW=innerWidth;
window.addEventListener('resize',()=>{worldCtl&&worldCtl.apply();
  if(innerWidth===rsW){layoutVars();return}
  clearTimeout(rsT);rsT=setTimeout(()=>{rsW=innerWidth;
    if(st.view==='grid'||st.view==='map'){const g=$('.gridwrap'),sl=g?g.scrollLeft:0;render();const n=$('.gridwrap');if(n)n.scrollLeft=sl}
    else layoutVars()},150)});

/* ---------- venue plan (FF UK, nám. Jana Palacha 2), drawn after the festival's floor plan ---------- */
const zoneName=z=>{const Z=ZONE[z];return [].concat(Z.a).join(' ')+(Z.b?' · '+Z.b:'')};
function zonesOf(it){
  const p=norm(it.place);if(!p)return [];
  const m=p.match(/sal (\d{3})(?:\/(\d{3}))?/);
  if(m)return [m[1],m[2]].filter(Boolean).map(n=>'r'+n).filter(z=>ZONE[z]);
  for(const r of PLACE_RULES)if(r.re.test(p))return r.zones.filter(z=>ZONE[z]);
  return [];
}

function floorSVG(f,o={}){
  const V=VENUE[f],hi=o.hi||new Set(),cnt=o.cnt||{},marks=o.marks||[],any=hi.size>0;
  let s=`<svg class="plan" viewBox="0 0 400 310" role="group" aria-label="${f}. patro">`;
  s+=`<path d="${V.outline}" class="pl-floor"/>`;
  if(V.inner)s+=`<path d="${V.inner}" class="pl-court"/>`;
  const [sx,sy]=V.stairs;
  s+=`<g class="pl-stairs" transform="translate(${sx} ${sy})"><path d="M0 26H8V19.5H16V13H24V6.5H32V0"/><circle cx="6" cy="6" r="3"/><path d="M6 9 L9 17 L4 24 M8 12 L14 15"/></g>`;
  for(const [x,y] of V.wc)s+=`<g class="pl-wc"><circle cx="${x}" cy="${y}" r="9"/><text x="${x}" y="${y+3}">WC</text></g>`;
  for(const z of V.z){
    if(z.k==='label'){s+=`<text class="pl-label" x="${z.x}" y="${z.y}">${esc(z.a)}</text>`;continue}
    const on=hi.has(z.id),lines=[].concat(z.a),cx=z.x+z.w/2,cy=z.y+z.h/2;
    const rx=z.k==='room'?6:(z.v?z.w/2:z.h/2);
    const tag=o.interactive?` data-act="zone" data-z="${z.id}" tabindex="0" role="button" aria-label="${esc(zoneName(z.id))}"`:'';
    s+=`<g class="pl-z pl-${z.k}${on?' hi':''}${any&&!on?' dim':''}"${tag}>`;
    if(on)s+=`<rect class="pl-ring" x="${z.x-4}" y="${z.y-4}" width="${z.w+8}" height="${z.h+8}" rx="${rx+4}"/>`;
    s+=`<rect class="pl-fill" x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="${rx}"/>`;
    if(z.v)s+=`<text class="t-zone" transform="translate(${cx} ${cy}) rotate(-90)" y="3">${esc(lines.join(' ').toLocaleUpperCase('cs'))}</text>`;
    else if(z.k==='room'){const n=lines.length+(z.b?1:0),y0=cy-(n-1)*5.5+3.5;
      lines.forEach((l,i)=>s+=`<text class="t-room" x="${cx}" y="${y0+i*11}">${esc(l.toLocaleUpperCase('cs'))}</text>`);
      if(z.b)s+=`<text class="t-sub" x="${cx}" y="${y0+lines.length*11}">${esc(z.b)}</text>`}
    else s+=`<text class="t-zone" x="${cx}" y="${cy+3}">${esc(lines.join(' ').toLocaleUpperCase('cs'))}</text>`;
    if(cnt[z.id])s+=`<g class="pl-cnt"><circle cx="${z.x+z.w-1}" cy="${z.y+1}" r="7.5"/><text x="${z.x+z.w-1}" y="${z.y+4}">${cnt[z.id]}</text></g>`;
    s+='</g>';
  }
  const byZ={};for(const m of marks)if(ZONE[m.z]&&ZONE[m.z].f===+f)(byZ[m.z]=byZ[m.z]||[]).push(m);
  for(const zid in byZ){const Z=ZONE[zid],arr=byZ[zid],cx=Z.x+Z.w/2,cy=Z.y+Z.h/2;
    arr.forEach((m,i)=>{const x=Z.v?cx:Z.x+3+i*19,y=Z.v?Z.y+3+i*19:Z.y+3;
      s+=`<g class="pl-mark"><circle cx="${x}" cy="${y}" r="9"/><text x="${x}" y="${y+3.5}">${m.n}</text></g>`})}
  return s+'</svg>';
}
function renderVenue(){
  const items=filtered(),cnt={};
  for(const it of items)if(it.zones.length){const z=it.zones[0];cnt[z]=(cnt[z]||0)+1}
  const mine=[...st.plan].map(id=>BY[id]).filter(i=>i&&i.day===st.day&&!i.all&&i.zones.length).sort((a,b)=>a.start-b.start);
  const marks=mine.map((it,i)=>({z:it.zones[0],n:i+1}));
  const dayName=DAYS.find(d=>d.k===st.day).long;
  return `<p class="hint">${dayName}: tmavé číslo v rohu = kolik bodů programu (podle filtru) se v místě koná${mine.length?', červené kolečko = pořadí bodů z tvého plánu':''}. Ťukni na sál nebo chodbu pro program.</p>
    <div class="floors">${Object.keys(VENUE).map(Number).map(f=>`<section class="floorcard"><h3>${f}. patro</h3>${floorSVG(f,{cnt,marks,interactive:true})}</section>`).join('')}</div>
    ${mine.length?`<ol class="routelist">${mine.map(it=>`<li><b class="num">${fmt(it.start)}</b> ${esc(it.title)} <span>${esc(zoneName(it.zones[0]))}</span></li>`).join('')}</ol>`:''}
    <p class="hint">Plánek je zjednodušený podle festivalového plánku budovy FF UK. Stánky bez uvedeného patra na plánku nejsou.</p>`;
}
function openZone(zid){
  const group=GROUPS.find(g=>g.includes(zid))||[zid];
  const items=filtered().filter(it=>it.zones.some(z=>group.includes(z))).sort((a,b)=>(b.all-a.all)||a.start-b.start);
  const Z=ZONE[zid];
  openSheetFn(`${Z.f}. patro · ${[].concat(Z.a).join(' ')}${Z.b?' ('+Z.b+')':''}`,()=>
    (items.length?items.map(i=>itemHTML(i,{nowhere:true})).join(''):`<p class="hint">${DAYS.find(d=>d.k===st.day).long}: tady podle filtru nic není.</p>`));
}
function openWhere(id){
  const it=BY[id];
  openSheetFn('Kde to je',()=>{
    const z=it.zones,f=z.length?ZONE[z[0]].f:null;
    return itemHTML(it,{nowhere:true,day:true})+(f?`<div class="floorcard"><h3>${f}. patro <small>${esc(zoneName(z[0]))}</small></h3>${floorSVG(f,{hi:new Set(z)})}</div>
      <p class="hint">Vchod z nám. Jana Palacha, schodiště je uprostřed budovy (ikona schodů).</p>`:`<p class="hint">Tohle místo na plánku budovy není.</p>`);
  });
}
function openRoute(dk){
  const mine=[...st.plan].map(id=>BY[id]).filter(i=>i&&i.day===dk&&!i.all).sort((a,b)=>a.start-b.start);
  openSheetFn(`Trasa po budově · ${DAYS.find(d=>d.k===dk).long}`,()=>{
    const onPlan=mine.filter(i=>i.zones.length),marks=onPlan.map((it,i)=>({z:it.zones[0],n:i+1}));
    const floors=[...new Set(onPlan.map(i=>ZONE[i.zones[0]].f))].sort();
    const hi=new Set(onPlan.flatMap(i=>i.zones));
    return `<ol class="routelist">${onPlan.map(it=>`<li><b class="num">${fmt(it.start)}–${fmt(it.end)}</b> ${esc(it.title)} <span>${ZONE[it.zones[0]].f}. patro · ${esc(zoneName(it.zones[0]))}</span></li>`).join('')}</ol>
      ${mine.length>onPlan.length?`<p class="hint">${mine.length-onPlan.length} ${mine.length-onPlan.length===1?'bod není':'body nejsou'} na plánku (místo neuvedeno nebo mimo budovu).</p>`:''}
      <div class="floors">${floors.map(f=>`<section class="floorcard"><h3>${f}. patro</h3>${floorSVG(f,{hi,marks})}</section>`).join('')}</div>`;
  });
}

function suggestionsFor(day,a,b){
  return ITEMS.filter(i=>i.day===day&&i.t==='ko'&&!i.all&&!st.plan.has(i.id)&&Math.min(i.end,b)-Math.max(i.start,a)>=20);
}
function renderPlan(){
  const all=[...st.plan].map(id=>BY[id]).filter(Boolean);
  if(!all.length)return `<div class="empty">Plán je zatím prázdný.<br>Ťukni na ☆ u čehokoli v seznamu nebo časové ose.</div>`;
  let nClash=0,h='';
  for(const d of DAYS){
    const items=all.filter(i=>i.day===d.k).sort((a,b)=>a.start-b.start);
    if(!items.length)continue;
    const hard=items.filter(i=>!i.flex), flex=items.filter(i=>i.flex);
    const onMap=items.some(i=>!i.all&&i.zones.length);
    h+=`<section class="pday"><div class="pdayhead"><h2>${d.long}</h2>${onMap?`<button class="btn ghost small" data-act="route" data-d="${d.k}">${PIN}Trasa po budově</button>`:''}</div><div class="route">`;
    hard.forEach((it,ix)=>{
      h+=`<div class="stop"><span class="mark t-${it.t}"></span>${itemHTML(it,{where:true})}</div>`;
      const nx=hard[ix+1]; if(!nx)return;
      const gap=nx.start-it.end;
      if(gap<0){nClash++;h+=`<div class="gap bad">Kolize: „${esc(nx.title)}“ začíná ${-gap} min před koncem. Vyber si jedno.</div>`}
      else if(gap<10&&it.floor&&nx.floor&&it.floor!==nx.floor){h+=`<div class="gap warn">Přesun z ${it.floor}. do ${nx.floor}. patra a na to jen ${gap} min. Odejdi o chvilku dřív.</div>`}
      else if(gap>=30){
        const s=suggestionsFor(d.k,it.end,nx.start);
        h+=`<div class="gap"><b class="num">Volno ${fmt(it.end)}–${fmt(nx.start)}</b> (${gap} min)${s.length?`. Konzultace v tu dobu:<div class="sugg">${s.slice(0,8).map(x=>`<button data-act="star" data-id="${x.id}">+ ${esc(x.title)}</button>`).join('')}${s.length>8?`<button data-act="morekons" data-a="${it.end}" data-b="${nx.start}">další (${s.length-8})</button>`:''}</div>`:''}</div>`;
      }
    });
    h+='</div>';
    if(flex.length)h+=`<div class="flexhead">Konzultace a celodenní, přijď kdykoli</div><div class="slot-items">${flex.map(i=>itemHTML(i,{where:true})).join('')}</div>`;
    h+='</section>';
  }
  const head=`<div class="planhead"><strong class="num">${all.length}</strong><span>${all.length===1?'bod':all.length<5?'body':'bodů'} v plánu</span>${nClash?`<span class="badge bad">${nClash} ${nClash===1?'kolize':'kolize'}</span>`:'<span class="badge" style="background:color-mix(in srgb,var(--green) 16%,transparent);color:var(--green)">bez kolizí</span>'}</div>`;
  const acts=`<div class="actions"><button class="btn" data-act="copy">Zkopírovat jako text</button><button class="btn ghost" data-act="share">Sdílet odkazem</button><button class="btn ghost" data-act="cal">Do kalendáře</button><button class="btn danger" data-act="clear">Vymazat plán</button></div>${st.copyText!==null?`<textarea class="copybox" id="copybox" readonly>${esc(st.copyText)}</textarea>`:''}${st.confirmClear?`<div class="banner"><p>Opravdu smazat celý plán?</p><button class="btn" data-act="clearyes">Smazat</button><button class="btn ghost" data-act="clearno">Ponechat</button></div>`:''}`;
  return head+acts+h;
}

function planText(){
  let t=`Můj plán · ${FEST.name} (${FEST.datesText})\n`;
  for(const d of DAYS){
    const items=[...st.plan].map(id=>BY[id]).filter(i=>i&&i.day===d.k).sort((a,b)=>(b.all-a.all)||a.start-b.start);
    if(!items.length)continue;
    t+=`\n${d.long}\n`;
    for(const i of items)t+=`${i.all?'celý den':fmt(i.start)+'–'+fmt(i.end)}  ${i.title}${i.who?' ('+i.who+')':''} · ${locText(i)}\n`;
  }
  return t;
}

/* chrome */
const $=s=>document.querySelector(s);
function renderChrome(){
  $('#days').innerHTML=DAYS.map(d=>`<button data-day="${d.k}" aria-pressed="${st.view!=='plan'&&st.day===d.k}">${d.short}</button>`).join('');
  $('#views').innerHTML=[['list','Seznam'],['grid','Osa'],['venue','Budova'],['map','Mapa'],['plan','Můj plán']].map(([k,l])=>`<button data-view="${k}" aria-pressed="${st.view===k}">${l}${k==='plan'&&st.plan.size?`<span class="cnt num">${st.plan.size}</span>`:''}</button>`).join('');
  $('#cats').innerHTML=Object.entries(TYPES).map(([k,l])=>`<button class="chip" data-cat="${k}" aria-pressed="${st.cats.has(k)}"><span class="mark t-${k}"></span>${l}</button>`).join('');
  $('#floors').innerHTML=`<span class="lbl">Patro</span>`+[[0,'Všechna'],[1,'1. patro'],[2,'2. patro'],[3,'3. patro']].map(([f,l])=>`<button class="chip fchip" data-floor="${f}" aria-pressed="${(st.floor||0)===f}">${l}</button>`).join('');
  $('#filters').hidden=st.view==='plan';
}
/* page geometry: sticky bar height and the full content width between the side gutters */
let LAY={w:900,gl:16,gr:16};
function layoutVars(){
  const root=document.documentElement,b=$('.bar'),cs=getComputedStyle(document.body);
  const gl=parseFloat(cs.paddingLeft)||16,gr=parseFloat(cs.paddingRight)||16,vw=root.clientWidth;
  LAY={w:vw-gl-gr,gl,gr};
  root.style.setProperty('--barh',(b?b.offsetHeight:60)+'px');
  root.style.setProperty('--bleedw',LAY.w+'px');
}
function applyBleed(){
  document.querySelectorAll('.bleed').forEach(el=>{const p=el.parentElement.getBoundingClientRect();
    el.style.width=LAY.w+'px';el.style.marginLeft=(LAY.gl-p.left)+'px'});
}
function render(){
  renderChrome();
  layoutVars();
  const V={list:renderList,grid:renderGrid,venue:renderVenue,map:renderMap,plan:renderPlan};
  document.body.dataset.view=st.view;
  $('#out').innerHTML=(V[st.view]||renderList)();
  applyBleed();
  if(st.view==='map')setupWorld();else worldCtl=null;
}

/* sheet */
let sheetFn=null,sheetTitle='';
function openSheetFn(title,fn){
  const keep=!!sheetFn&&sheetTitle===title, sc=keep?($('#sheetroot .sheet')||{}).scrollTop:0;
  sheetFn=fn;sheetTitle=title;
  $('#sheetroot').innerHTML=`<div class="backdrop" data-act="close"></div><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="sheet-in">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><h3>${esc(title)}</h3><button class="btn ghost" data-act="close">Zavřít</button></div>
    ${fn()}</div></div>`;
  const sh=$('#sheetroot .sheet');
  if(keep&&sh)sh.scrollTop=sc;else $('#sheetroot .sheet button.btn').focus();
}
function openSheet(items,title,showDay){openSheetFn(title,()=>items.map(i=>itemHTML(i,{open:items.length===1,day:showDay})).join(''))}
function refreshSheet(){if(sheetFn)openSheetFn(sheetTitle,sheetFn)}
function closeSheet(){sheetFn=null;$('#sheetroot').innerHTML=''}

function toast(msg){const t=document.createElement('div');t.className='toast';t.textContent=msg;$('#toastroot').replaceChildren(t);setTimeout(()=>t.remove(),2600)}

/* events */
document.addEventListener('click',e=>{
  const b=e.target.closest('button,[data-act]');if(!b)return;
  if(b.dataset.day){st.day=b.dataset.day;if(st.view==='plan')st.view='list';saveUi();render();return}
  if(b.dataset.view){st.view=b.dataset.view;st.copyText=null;st.confirmClear=false;saveUi();render();return}
  if(b.dataset.floor!==undefined){const f=+b.dataset.floor;st.floor=f&&st.floor!==f?f:0;render();return}
  if(b.dataset.cat){
    const k=b.dataset.cat;
    if(st.cats.size===Object.keys(TYPES).length){st.cats=new Set([k])}
    else{st.cats.has(k)?st.cats.delete(k):st.cats.add(k);if(!st.cats.size)st.cats=new Set(Object.keys(TYPES))}
    render();return}
  const act=b.dataset.act;if(!act)return;
  const card=b.closest('[data-id]'), id=b.dataset.id||(card&&card.dataset.id);
  if(act==='star'){toggle(id);return}
  if(act==='open'){st.open.has(id)?st.open.delete(id):st.open.add(id);render();refreshSheet();return}
  if(act==='where'){openWhere(id);return}
  if(act==='route'){openRoute(b.dataset.d);return}
  if(act==='zone'){openZone(b.dataset.z);return}
  if(act==='place'){openPlace([b.dataset.k],PL[b.dataset.k][0]);return}
  if(act==='mapday'||act==='mapall'){st.mapAll=act==='mapall';render();return}
  if(act==='zin'||act==='zout'){worldCtl&&worldCtl.zoomAt(act==='zin'?1.5:1/1.5);return}
  if(act==='zreset'){worldCtl&&worldCtl.reset();return}
  if(act==='sheet'){openSheet([BY[id]],TYPE1[BY[id].t]);return}
  if(act==='grp'){const g=gridGroups[id.slice(2)];openSheet(g.group,`Konzultace ${fmt(g.start)}–${fmt(g.end)} · ${g.place}`);return}
  if(act==='morekons'){const day=[...st.plan].map(x=>BY[x])[0];const a=+b.dataset.a,bb=+b.dataset.b;
    const d=b.closest('.pday');const dk=DAYS.find(x=>d&&d.querySelector('h2').textContent===x.long);
    openSheet(suggestionsFor(dk?dk.k:st.day,a,bb),`Konzultace ${fmt(a)}–${fmt(bb)}`);return}
  if(act==='close'){closeSheet();return}
  if(act==='copy'){copyOut(planText(),'Plán zkopírován jako text');return}
  if(act==='share'){copyOut(shareURL(),'Odkaz na plán zkopírován');return}
  if(act==='cal'){openCal();return}
  if(act==='ics'){downloadICS();return}
  if(act==='clear'){st.confirmClear=true;render();return}
  if(act==='clearno'){st.confirmClear=false;render();return}
  if(act==='clearyes'){st.plan.clear();st.confirmClear=false;st.copyText=null;save();render();toast('Plán smazán');return}
  if(act==='take'||act==='merge'){
    if(act==='take')st.plan=new Set(shared);else shared.forEach(x=>st.plan.add(x));
    save();shared=null;$('#banner').innerHTML='';st.view='plan';
    try{history.replaceState(null,'',location.pathname+location.search)}catch(_){location.hash=''}
    render();toast('Plán načten');return}
  if(act==='dismiss'){shared=null;$('#banner').innerHTML='';return}
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&sheetFn){closeSheet();return}
  const t=e.target;
  if((e.key==='Enter'||e.key===' ')&&t instanceof SVGElement&&t.dataset&&t.dataset.act==='zone'){e.preventDefault();openZone(t.dataset.z)}
});
let qt;$('#q').addEventListener('input',e=>{clearTimeout(qt);qt=setTimeout(()=>{st.q=e.target.value;render()},120)});
$('#fit').addEventListener('change',e=>{st.fit=e.target.checked;render()});

/* shared plan via #plan-… */
let shared=null;
function readHash(){
  const h=location.hash.slice(1);
  if(!h.startsWith('plan-'))return;
  const ids=h.slice(5).split('-').filter(x=>BY[x]);
  if(!ids.length)return;
  const same=ids.length===st.plan.size&&ids.every(x=>st.plan.has(x));
  if(same)return;
  shared=ids;
  $('#banner').innerHTML=`<div class="banner"><p>Někdo ti poslal plán s ${ids.length} body.</p>
    <button class="btn" data-act="merge">Přidat k mému</button><button class="btn ghost" data-act="take">Nahradit můj</button><button class="btn ghost" data-act="dismiss">Ignorovat</button></div>`;
}
window.addEventListener('hashchange',readHash);
/* ---------- načtení dat ---------- */
/* CSV: první řádek = hlavička, oddělovač se pozná automaticky (čárka, středník nebo tabulátor),
   pole v uvozovkách smí obsahovat oddělovač i nový řádek. */
function parseCSV(text){
  text=text.replace(/^﻿/,'');
  const first=text.split(/\r?\n/,1)[0];
  const delim=[',',';','\t'].sort((a,b)=>first.split(b).length-first.split(a).length)[0];
  const rows=[];let row=[],f='',q=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(q){if(c==='"'){if(text[i+1]==='"'){f+='"';i++}else q=false}else f+=c;continue}
    if(c==='"')q=true;
    else if(c===delim){row.push(f);f=''}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(f);f='';if(row.some(v=>v.trim()))rows.push(row);row=[]}
    else f+=c;
  }
  row.push(f);if(row.some(v=>v.trim()))rows.push(row);
  const head=rows.shift().map(h=>norm(h).trim());
  return rows.map((r,n)=>{const o={_line:n+2};head.forEach((h,i)=>o[h]=(r[i]||'').trim());return o});
}
const COLS={den:['den','day'],zacatek:['zacatek','od','start'],konec:['konec','do','end'],typ:['typ','type'],nazev:['nazev','title'],
  kdo:['kdo','who'],misto:['misto','place'],odkaz:['odkaz','url'],poznamka:['poznamka','note'],id:['id']};
const col=(o,k)=>{for(const a of COLS[k])if(o[a]!==undefined)return o[a];return ''};
const timeRe=/^\d{1,2}[:.]\d{2}$/;

function buildItems(rows){
  const bad=[],perDay={};ITEMS=[];BY={};
  for(const r of rows){
    const day=col(r,'den').toLowerCase(),t=col(r,'typ').toLowerCase(),title=col(r,'nazev');
    const s=col(r,'zacatek').replace('.',':'),e=col(r,'konec').replace('.',':');
    const all=!s||s==='*'||/^cel/i.test(s);
    if(dayIdx(day)<0||!TYPES[t]||!title||(!all&&(!timeRe.test(s)||!timeRe.test(e)))){bad.push(r._line);continue}
    const i=perDay[day]=(perDay[day]??-1)+1;
    const place=col(r,'misto'),who=col(r,'kdo'),note=col(r,'poznamka');
    const it={id:col(r,'id')||day[0]+i.toString(36),day,all,start:all?600:toMin(s),end:all?1200:toMin(e),t,title,who,place,url:col(r,'odkaz'),note};
    if(it.end<=it.start&&!all)it.end=it.start+30;
    it.flex=all||t==='ko';it.floor=floorOf(place);
    it.hay=norm([title,who,place,note,TYPES[t]].join(' '));
    ITEMS.push(it);BY[it.id]=it;
  }
  return bad;
}

async function boot(){
  const get=async(u,type)=>{const r=await fetch(u,{cache:'no-cache'});if(!r.ok)throw new Error(u+' ('+r.status+')');return type==='text'?r.text():r.json()};
  let fest,csv,venue,places,world;
  try{[fest,csv,venue,places,world]=await Promise.all([get('data/festival.json'),get('data/program.csv','text'),get('data/venue.json'),get('data/places.json'),get('data/world.json')])}
  catch(err){
    $('#out').innerHTML=`<div class="empty">Data programu se nepodařilo načíst (${esc(err.message)}).<br>Stránka musí běžet z webového serveru (např. GitHub Pages nebo <code>python -m http.server</code>), ne otevřením souboru z disku.</div>`;
    return;
  }
  FEST=fest;HALLS=fest.halls||{};ADDR=fest.address||'';PUBLIC_URL=fest.publicUrl||'';
  KEY=(fest.storageKey||'planovac')+'-plan';UIKEY=(fest.storageKey||'planovac')+'-ui';
  DAYS=fest.days.map(d=>({k:d.key,short:d.short,long:d.long,date:d.date}));
  // header + footer texts
  document.querySelectorAll('[data-fest]').forEach(el=>{const v=fest[el.dataset.fest];if(v!=null)el.textContent=v});
  document.querySelectorAll('[data-fest-href]').forEach(el=>{const v=fest[el.dataset.festHref];if(v)el.href=v});
  if(fest.title)document.title=fest.title.replace(/\s*\d{4}$/,'')+' Plánovač';
  // floor plan
  VENUE={};ZONE={};
  for(const f in venue.floors){const F=venue.floors[f];VENUE[f]={...F,z:F.zones};for(const z of F.zones)if(z.id)ZONE[z.id]={...z,f:+f}}
  GROUPS=venue.groups||[];ROOM_LABELS=venue.roomLabels||{};
  PLACE_RULES=(venue.placeRules||[]).map(r=>({re:new RegExp(r.match),zones:r.zones}));
  // world map + destinations
  PL={};for(const k in places.places){const p=places.places[k];PL[k]=[p.label,p.lat,p.lon]}
  RULES=(places.rules||[]).filter(r=>PL[r.place]).map(r=>[new RegExp(r.match),r.place]);
  LAND_D=world.land.map(p=>'M'+p.map(([lo,la])=>PRJ(lo,la).join(' ')).join('L')+'Z').join('');
  // program
  const bad=buildItems(parseCSV(csv));
  for(const it of ITEMS){const t=norm(it.title);it.dest=[];for(const [re,k] of RULES)if(re.test(t)&&!it.dest.includes(k))it.dest.push(k);it.zones=zonesOf(it)}
  // saved state
  st.day=fest.defaultDay&&dayIdx(fest.defaultDay)>=0?fest.defaultDay:DAYS[0].k;
  try{JSON.parse(localStorage.getItem(KEY)||'[]').forEach(id=>BY[id]&&st.plan.add(id))}catch(e){}
  try{const v=JSON.parse(localStorage.getItem(UIKEY)||'{}');if(dayIdx(v.day)>=0)st.day=v.day;if(v.view)st.view=v.view}catch(e){}
  render();readHash();
  if(bad.length)$('#banner').insertAdjacentHTML('beforeend',`<div class="banner"><p>V data/program.csv ${bad.length===1?'se nepodařilo načíst řádek':'se nepodařilo načíst řádky'} ${bad.slice(0,12).join(', ')}${bad.length>12?'…':''} (neznámý den nebo typ, chybí název nebo čas).</p><button class="btn ghost" data-act="dismiss">Zavřít</button></div>`);
}
boot();
