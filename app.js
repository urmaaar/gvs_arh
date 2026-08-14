const $=id=>document.getElementById(id);
const CITY=[64.5393,40.5433];
const cfg=window.GVS_CONFIG||{};
const sb=(cfg.SUPABASE_URL&&cfg.SUPABASE_ANON_KEY&&window.supabase)
  ? window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY) : null;

const RELS=[
 {id:5843673,name:"Октябрьский"},{id:5843675,name:"Соломбальский"},
 {id:5843671,name:"Маймаксанский"},{id:5843674,name:"Северный"},
 {id:5843669,name:"Исакогорский"},{id:5843676,name:"Цигломенский"},
 {id:5843670,name:"Ломоносовский"},{id:5843668,name:"Варавино-Фактория"},
 {id:5843672,name:"Майская Горка"}
];

const map=L.map("map").setView(CITY,11.5);
L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",{maxZoom:19,attribution:"&copy; OpenStreetMap contributors &copy; CARTO"}).addTo(map);

let selected=null,layers=[],shared={};
const CACHE_KEY="gvs_arh_boundaries_v2";
const LOCAL_KEY="gvs_arh_local_v4";

function localDb(){try{return JSON.parse(localStorage.getItem(LOCAL_KEY)||"{}")}catch{return {}}}
function saveLocal(x){localStorage.setItem(LOCAL_KEY,JSON.stringify(x))}
function localDistrict(id){return localDb()[id]||{yes:0,no:0,comments:[]}}
function status(d){
  return d.yes>d.no&&d.yes?["ok","ВОДА ЕСТЬ","#22c55e"]:
         d.no>d.yes&&d.no?["bad","ВОДЫ НЕТ","#ef4444"]:
         ["","НЕТ ДАННЫХ","#94a3b8"];
}
function styleFor(d){const c=status(d)[2];return{color:c,weight:2,fillColor:c,fillOpacity:.24}}
function esc(x){return String(x).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}

function getVoterId(){
  let id=localStorage.getItem("gvs_arh_voter_id");
  if(!id){
    id=(crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random());
    localStorage.setItem("gvs_arh_voter_id",id);
  }
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
  (el.members||[]).forEach(m=>{
    if(m.type==="way"&&m.geometry&&m.role!=="inner")outer.push(m.geometry.map(p=>[p.lat,p.lon]));
  });
  return joinWays(outer);
}
function geometryCache(){try{return JSON.parse(localStorage.getItem(CACHE_KEY)||"{}")}catch{return {}}}
function saveGeometryCache(x){try{localStorage.setItem(CACHE_KEY,JSON.stringify(x))}catch{}}

function addDistrict(r,rings){
  const d={id:String(r.id),name:r.name};
  const l=L.polygon(rings,styleFor(d)).addTo(map);
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
    $("load").textContent="Границы загружены";
    setTimeout(()=>$("load").classList.add("hidden"),500);
    await loadAllSharedData();
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
      newCache[r.id]=rings;
      addDistrict(r,rings);
    }
    saveGeometryCache({...cache,...newCache});
    $("load").textContent=`Границы загружены: ${layers.length}/${RELS.length}`;
    setTimeout(()=>$("load").classList.add("hidden"),700);
    await loadAllSharedData();
  }catch(e){
    console.error(e);
    if(cached.length){
      cached.forEach(r=>addDistrict(r,cache[r.id]));
      $("load").textContent="Использован сохранённый кэш";
      await loadAllSharedData();
      setTimeout(()=>$("load").classList.add("hidden"),900);
    }else{
      $("load").textContent="Не удалось загрузить границы — обновите страницу";
    }
  }
}

async function loadAllSharedData(){
  if(!sb){
    shared=localDb();
    refreshPolygons();
    return;
  }
  try{
    // Получаем ВСЕ голоса одним запросом.
    const {data:votes,error:vErr}=await sb.from("votes").select("district_id,status");
    if(vErr)throw vErr;
    // Получаем комментарии одним запросом.
    const {data:comments,error:cErr}=await sb.from("comments")
      .select("district_id,author,text,created_at")
      .order("created_at",{ascending:false}).limit(1000);
    if(cErr)throw cErr;

    const out={};
    RELS.forEach(r=>out[String(r.id)]={yes:0,no:0,comments:[]});
    (votes||[]).forEach(v=>{
      const d=out[String(v.district_id)]||(out[String(v.district_id)]={yes:0,no:0,comments:[]});
      if(v.status==="yes")d.yes++; if(v.status==="no")d.no++;
    });
    (comments||[]).forEach(c=>{
      const d=out[String(c.district_id)]||(out[String(c.district_id)]={yes:0,no:0,comments:[]});
      d.comments.push({author:c.author,text:c.text,time:new Date(c.created_at).toLocaleString("ru-RU")});
    });
    shared=out;
    saveLocal(out);
    refreshPolygons();
  }catch(e){
    console.error("Supabase:",e);
    shared=localDb();
    refreshPolygons();
  }
}

async function getDistrictData(id){
  if(shared[id])return shared[id];
  return localDistrict(id);
}

function refreshPolygons(){
  layers.forEach(x=>x.l.setStyle(styleFor(x.d)));
}

async function render(){
  const d=await getDistrictData(selected.id),s=status(d);
  $("badge").className="badge "+s[0];
  $("badge").textContent=s[1];
  $("yesCount").textContent=d.yes||0;
  $("noCount").textContent=d.no||0;
  $("commentCount").textContent=(d.comments||[]).length;
  $("comments").innerHTML=d.comments?.length
    ?d.comments.map(c=>`<div class="comment"><div class="meta">${esc(c.author||"Житель")} · ${esc(c.time||"")}</div><div class="ct">${esc(c.text)}</div></div>`).join("")
    :'<div class="comment"><div class="ct">Пока нет комментариев. Будьте первым.</div></div>';
  refreshPolygons();
}

function select(d,l){
  selected=d;
  $("empty").classList.add("hidden");
  $("district").classList.remove("hidden");
  $("name").textContent=d.name;
  $("note").textContent="";
  map.fitBounds(l.getBounds(),{padding:[60,60],maxZoom:13});
  render();
}

async function vote(value){
  if(!selected)return;
  $("yesBtn").disabled=true;$("noBtn").disabled=true;
  try{
    if(sb){
      const voter=getVoterId();
      const {data:existing,error:findErr}=await sb.from("votes")
        .select("id,status").eq("district_id",selected.id).eq("voter_id",voter).maybeSingle();
      if(findErr)throw findErr;
      if(existing){
        if(existing.status!==value){
          const {error}=await sb.from("votes").update({status:value}).eq("id",existing.id);
          if(error)throw error;
        }
      }else{
        const {error}=await sb.from("votes").insert({district_id:selected.id,status:value,voter_id:voter});
        if(error)throw error;
      }
      $("note").textContent="Голос сохранён для всех посетителей.";
      await loadAllSharedData();
    }else{
      const x=localDb(),d=x[selected.id]||{yes:0,no:0,comments:[]};
      d[value]=(d[value]||0)+1;x[selected.id]=d;saveLocal(x);shared=x;
      $("note").textContent="Сейчас сохранено только на этом устройстве. Подключите Supabase для общей базы.";
      refreshPolygons();render();
    }
  }catch(e){
    console.error(e);
    $("note").textContent="Не удалось сохранить голос.";
  }finally{$("yesBtn").disabled=false;$("noBtn").disabled=false}
  await render();
}

async function addComment(e){
  e.preventDefault();
  const text=$("text").value.trim();
  if(!text||!selected)return;
  try{
    const author=$("author").value.trim()||"Житель";
    if(sb){
      const {error}=await sb.from("comments").insert({district_id:selected.id,author,text});
      if(error)throw error;
      $("note").textContent="Комментарий опубликован для всех посетителей.";
      $("text").value="";$("author").value="";
      await loadAllSharedData();
    }else{
      const x=localDb(),d=x[selected.id]||{yes:0,no:0,comments:[]};
      d.comments=d.comments||[];
      d.comments.unshift({author,text,time:new Date().toLocaleString("ru-RU")});
      x[selected.id]=d;saveLocal(x);shared=x;
      $("text").value="";$("author").value="";
      $("note").textContent="Сейчас комментарий сохранён только на этом устройстве. Подключите Supabase.";
    }
    await render();
  }catch(e){console.error(e);$("note").textContent="Не удалось опубликовать комментарий."}
}

function home(){
  selected=null;
  $("district").classList.add("hidden");
  $("empty").classList.remove("hidden");
  map.setView(CITY,11.5);
}

$("refreshBrand").onclick=e=>{e.preventDefault();location.reload()};
$("yesBtn").onclick=()=>vote("yes");
$("noBtn").onclick=()=>vote("no");
$("form").onsubmit=addComment;
$("back").onclick=home;
$("city").onclick=home;

loadBoundaries();
