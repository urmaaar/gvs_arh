const DISTRICTS = [
  {id:"lom", name:"Ломоносовский", coords:[[64.56,40.50],[64.57,40.58],[64.53,40.61],[64.50,40.57],[64.51,40.49],[64.56,40.50]]},
  {id:"okt", name:"Октябрьский", coords:[[64.56,40.45],[64.56,40.50],[64.51,40.49],[64.50,40.45],[64.53,40.43],[64.56,40.45]]},
  {id:"sol", name:"Соломбала", coords:[[64.60,40.49],[64.60,40.58],[64.57,40.58],[64.56,40.50],[64.60,40.49]]},
  {id:"may", name:"Майская Горка", coords:[[64.57,40.58],[64.55,40.67],[64.50,40.69],[64.49,40.61],[64.50,40.57],[64.57,40.58]]},
  {id:"var", name:"Варавино-Фактория", coords:[[64.58,40.67],[64.57,40.77],[64.52,40.78],[64.50,40.69],[64.58,40.67]]},
  {id:"isa", name:"Исакогорский", coords:[[64.49,40.50],[64.49,40.61],[64.50,40.69],[64.43,40.68],[64.40,40.55],[64.49,40.50]]},
  {id:"tsig", name:"Цигломень", coords:[[64.47,40.70],[64.48,40.85],[64.42,40.89],[64.39,40.76],[64.43,40.68],[64.47,40.70]]}
];

let selected=null;
const map=L.map("map").setView([64.5393,40.5433],11.6);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
  maxZoom:19,
  attribution:'&copy; OpenStreetMap contributors'
}).addTo(map);

const layers=[];

function loadAll(){try{return JSON.parse(localStorage.getItem("gvs_arh_v1")||"{}")}catch{return {}}}
function saveAll(x){localStorage.setItem("gvs_arh_v1",JSON.stringify(x))}
function data(id){return loadAll()[id]||{yes:0,no:0,comments:[]}}
function status(d){return d.yes>d.no&&d.yes>0?["ok","ВОДА ЕСТЬ"]:d.no>d.yes&&d.no>0?["bad","ВОДЫ НЕТ"]:["","НЕТ ДАННЫХ"]}

function styleFor(d){
  const [c]=status(data(d.id));
  return {color:c==="ok"?"#16a34a":c==="bad"?"#dc2626":"#64748b",weight:3,fillColor:c==="ok"?"#22c55e":c==="bad"?"#ef4444":"#94a3b8",fillOpacity:.28};
}

function refresh(){
  layers.forEach(x=>x.layer.setStyle(styleFor(x.d)));
}

DISTRICTS.forEach(d=>{
  const layer=L.polygon(d.coords,styleFor(d)).addTo(map);
  layer.on("click",()=>{selected=d;render();});
  layer.bindTooltip(d.name,{sticky:true});
  layers.push({layer,d});
});

function render(){
  if(!selected){$("emptyState").classList.remove("hidden");$("districtState").classList.add("hidden");return}
  $("emptyState").classList.add("hidden");$("districtState").classList.remove("hidden");
  const d=data(selected.id), [cls,label]=status(d);
  $("districtName").textContent=selected.name;
  $("yesCount").textContent=d.yes||0;
  $("noCount").textContent=d.no||0;
  $("commentCount").textContent=(d.comments||[]).length;
  $("statusBadge").className="status-badge "+cls;
  $("statusBadge").textContent=label;
  $("comments").innerHTML=(d.comments||[]).length
    ? d.comments.slice().reverse().map(c=>`<div class="comment"><div class="comment-meta">${esc(c.author||"Житель")} · ${esc(c.time||"")}</div><div class="comment-text">${esc(c.text)}</div></div>`).join("")
    : `<div class="comment"><div class="comment-text">Пока нет комментариев. Будьте первым.</div></div>`;
}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function vote(type){
  const all=loadAll(),d=all[selected.id]||{yes:0,no:0,comments:[]};
  d[type]=(d[type]||0)+1;all[selected.id]=d;saveAll(all);
  $("voteNote").textContent="Спасибо! Отметка сохранена.";
  render();refresh();
}
function comment(e){
  e.preventDefault();
  const text=$("commentText").value.trim();if(!text)return;
  const all=loadAll(),d=all[selected.id]||{yes:0,no:0,comments:[]};
  d.comments=d.comments||[];
  d.comments.push({author:$("commentAuthor").value.trim()||"Житель",text,time:new Date().toLocaleString("ru-RU")});
  all[selected.id]=d;saveAll(all);
  $("commentText").value="";$("commentAuthor").value="";
  render();
}
$("yesBtn").onclick=()=>vote("yes");
$("noBtn").onclick=()=>vote("no");
$("commentForm").onsubmit=comment;
$("backBtn").onclick=()=>{selected=null;render();map.setView([64.5393,40.5433],11.6)};
render();
