const $=id=>document.getElementById(id);
const CITY=[64.5393,40.5433];

// ВСТАВЬ СЮДА данные проекта Supabase.
// URL и publishable/anon key безопасно использовать в браузерном коде
// при включённом Row Level Security.
const SUPABASE_URL="";
const SUPABASE_ANON_KEY="";
const sb=(SUPABASE_URL&&SUPABASE_ANON_KEY&&window.supabase)?window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY):null;

const RELS=[
 {id:5843673,name:"Октябрьский"},{id:5843675,name:"Соломбальский"},
 {id:5843671,name:"Маймаксанский"},{id:5843674,name:"Северный"},
 {id:5843669,name:"Исакогорский"},{id:5843676,name:"Цигломенский"},
 {id:5843670,name:"Ломоносовский"},{id:5843668,name:"Варавино-Фактория"},
 {id:5843672,name:"Майская Горка"}
];

const map=L.map("map").setView(CITY,11.5);
L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",{maxZoom:19,attribution:"&copy; OpenStreetMap contributors &copy; CARTO"}).addTo(map);

let selected=null,layers=[];
const CACHE_KEY="gvs_arh_boundaries_v1";
const LOCAL_KEY="gvs_arh_local_v3";

function localDb(){try{return JSON.parse(localStorage.getItem(LOCAL_KEY)||"{}")}catch{return {}}}
function saveLocal(x){localStorage.setItem(LOCAL_KEY,JSON.stringify(x))}
function localDistrict(id){return localDb()[id]||{yes:0,no:0,comments:[]}}
function status(d){return d.yes>d.no&&d.yes?["ok","ВОДА ЕСТЬ","#22c55e"]:d.no>d.yes&&d.no?["bad","ВОДЫ НЕТ","#ef4444"]:["","НЕТ ДАННЫХ","#94a3b8"]}
function styleFor(d){const c=status(d)[2];return{color:c,weight:2,fillColor:c,fillOpacity:.22}}
function esc(x){return String(x).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}

function getVoterId(){
 let id=localStorage.getItem("gvs_arh_voter_id");
 if(!id){id=crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random();localStorage.setItem("gvs_arh_voter_id",id)}
 return id;
}

function joinWays(ways){
 const unused=ways.map(w=>w.slice()),rings=[];
 while(unused.length){
  let ring=unused.pop(),changed=true;
  while(changed){
   changed=false;const end=ring.at(-1),start=ring[0];
   for(let i=unused.length-1;i>=0;i--){
    const w=unused[i],a=w[0],b=w.at(-1);
    if(eq(end,a)){ring=ring.concat(w.slice(1));unused.splice(i,1);changed=true;break}
    if(eq(end,b)){ring=ring.concat(w.slice(0,-1).reverse());unused.splice(i,1);changed=true;break}
    if(eq(start,b)){ring=w.concat(ring.slice(1));unused.splice(i,1);changed=true;break}
    if(eq(start,a)){ring=w.slice().reverse().concat(ring.slice(1));unused.splice(i,1);changed=true;break}
   }
  }
  if(ring.length>=4)rings.push(ring);
 }
 return rings;
}
function eq(a,b){return a[0]===b[0]&&a[1]===b[1]}
function relationRings(el){
 const outer=[];
 (el.members||[]).forEach(m=>{if(m.type==="way"&&m.geometry&&m.role!=="inner")outer.push(m.geometry.map(p=>[p.lat,p.lon]))});
 return joinWays(outer);
}
function geometryCache(){try{return JSON.parse(localStorage.getItem(CACHE_KEY)||"{}")}catch{return {}}}
function saveGeometryCache(x){try{localStorage.setItem(CACHE_KEY,JSON.stringify(x))}catch{}}

function addDistrict(r,rings){
 const d={id:String(r.id),name:r.name},l=L.polygon(rings,styleFor(d)).addTo(map);
 l.bindTooltip(d.name,{permanent:true,direction:"center",className:"district-label"});
 l.on("click",()=>select(d,l));
 l.on("mouseover",()=>l.setStyle({...styleFor(d),weight:3,fillOpacity:.34}));
 l.on("mouseout",()=>l.setStyle(styleFor(d)));
 layers.push({d,l});
}

async function loadBoundaries(){
 const cache=geometryCache();
 const cached=RELS.filter(r=>cache[r.id]?.length);
 if(cached.length===RELS.length){
   RELS.forEach(r=>addDistrict(r,cache[r.id]));
   $("load").textContent="Границы загружены из кэша";
   setTimeout(()=>$("load").classList.add("hidden"),700);
   return;
 }
 const ids=RELS.map(r=>r.id).join(",");
 const q=`[out:json][timeout:40];relation(id:${ids});out geom;`;
 try{
   const res=await fetch("https://overpass-api.de/api/interpreter?data="+encodeURIComponent(q));
   if(!res.ok)throw new Error("Overpass "+res.status);
   const json=await res.json(),newCache={};
   for(const r of RELS){
     const rel=json.elements.find(e=>e.type==="relation"&&String(e.id)===String(r.id));
     if(!rel)continue;
     const rings=relationRings(rel);
     if(!rings.length)continue;
     newCache[r.id]=rings;addDistrict(r,rings);
   }
   saveGeometryCache({...cache,...newCache});
   $("load").textContent=`Границы загружены: ${layers.length}/${RELS.length}`;
   setTimeout(()=>$("load").classList.add("hidden"),900);
 }catch(e){
   console.error(e);
   if(cached.length){
     cached.forEach(r=>addDistrict(r,cache[r.id]));
     $("load").textContent="Использован сохранённый кэш границ";
     setTimeout(()=>$("load").classList.add("hidden"),1200);
   }else $("load").textContent="Не удалось загрузить границы — обновите страницу";
 }
}

async function fetchSharedDistrict(id){
 if(!sb)return null;
 const {data:votes,error:vErr}=await sb.from("votes").select("status").eq("district_id",id);
 if(vErr)throw vErr;
 const {data:comments,error:cErr}=await sb.from("comments").select("author,text,created_at").eq("district_id",id).order("created_at",{ascending:false}).limit(100);
 if(cErr)throw cErr;
 return {
   yes:(votes||[]).filter(v=>v.status==="yes").length,
   no:(votes||[]).filter(v=>v.status==="no").length,
   comments:(comments||[]).map(c=>({author:c.author,text:c.text,time:new Date(c.created_at).toLocaleString("ru-RU")}))
 };
}
async function getDistrictData(id){
 if(sb){
  try{
   const d=await fetchSharedDistrict(id);
   const x=localDb();x[id]=d;saveLocal(x);return d;
  }catch(e){console.warn("Supabase:",e)}
 }
 return localDistrict(id);
}
async function render(){
 const d=await getDistrictData(selected.id),s=status(d);
 $("badge").className="badge "+s[0];$("badge").textContent=s[1];
 $("yesCount").textContent=d.yes;$("noCount").textContent=d.no;$("commentCount").textContent=d.comments.length;
 $("comments").innerHTML=d.comments.length?d.comments.map(c=>`<div class="comment"><div class="meta">${esc(c.author||"Житель")} · ${esc(c.time||"")}</div><div class="ct">${esc(c.text)}</div></div>`).join(""):'<div class="comment"><div class="ct">Пока нет комментариев. Будьте первым.</div></div>';
 refresh();
}
function refresh(){layers.forEach(x=>x.l.setStyle(styleFor(x.d)))}
function select(d,l){selected=d;$("empty").classList.add("hidden");$("district").classList.remove("hidden");$("name").textContent=d.name;$("note").textContent="";map.fitBounds(l.getBounds(),{padding:[60,60],maxZoom:13});render()}
async function vote(statusValue){
 if(!selected)return;
 $("yesBtn").disabled=true;$("noBtn").disabled=true;
 try{
   if(sb){
     const voter=getVoterId();
     const {data:existing}=await sb.from("votes").select("id,status").eq("district_id",selected.id).eq("voter_id",voter).maybeSingle();
     if(existing){
       await sb.from("votes").update({status:statusValue}).eq("id",existing.id);
     }else{
       const {error}=await sb.from("votes").insert({district_id:selected.id,status:statusValue,voter_id:voter});
       if(error)throw error;
     }
     $("note").textContent="Ваш голос сохранён и виден другим пользователям.";
   }else{
     const x=localDb(),d=x[selected.id]||{yes:0,no:0,comments:[]};
     d[statusValue]++;x[selected.id]=d;saveLocal(x);
     $("note").textContent="Сохранено в этом браузере. Для общей базы подключите Supabase.";
   }
   await render();
 }catch(e){console.error(e);$("note").textContent="Не удалось сохранить голос. Проверьте подключение базы."}
 finally{$("yesBtn").disabled=false;$("noBtn").disabled=false}
}
async function addComment(e){
 e.preventDefault();const text=$("text").value.trim();if(!text||!selected)return;
 try{
   if(sb){
     const {error}=await sb.from("comments").insert({district_id:selected.id,author:$("author").value.trim()||"Житель",text});
     if(error)throw error;
   }else{
     const x=localDb(),d=x[selected.id]||{yes:0,no:0,comments:[]};
     d.comments=d.comments||[];d.comments.unshift({author:$("author").value.trim()||"Житель",text,time:new Date().toLocaleString("ru-RU")});x[selected.id]=d;saveLocal(x);
   }
   $("text").value="";$("author").value="";$("note").textContent=sb?"Комментарий опубликован.":"Комментарий сохранён в этом браузере.";
   await render();
 }catch(e){console.error(e);$("note").textContent="Не удалось опубликовать комментарий."}
}
function home(){selected=null;$("district").classList.add("hidden");$("empty").classList.remove("hidden");map.setView(CITY,11.5)}
$("yesBtn").onclick=()=>vote("yes");$("noBtn").onclick=()=>vote("no");$("form").onsubmit=addComment;$("back").onclick=home;$("city").onclick=home;
$("refreshBrand").onclick=()=>location.reload();

loadBoundaries();
