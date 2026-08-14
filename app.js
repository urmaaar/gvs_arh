const CITY=[64.5393,40.5433];
const DISTRICTS=[
 {id:"severny",name:"Северный",center:[64.59,40.59],coords:[[64.585,40.48],[64.63,40.50],[64.65,40.61],[64.62,40.68],[64.56,40.66],[64.54,40.60],[64.585,40.48]]},
 {id:"sol",name:"Соломбальский",center:[64.58,40.54],coords:[[64.56,40.48],[64.61,40.47],[64.63,40.54],[64.62,40.61],[64.57,40.60],[64.54,40.55],[64.56,40.48]]},
 {id:"maym",name:"Маймаксанский",center:[64.64,40.54],coords:[[64.62,40.47],[64.72,40.48],[64.77,40.57],[64.72,40.65],[64.64,40.64],[64.62,40.61],[64.62,40.47]]},
 {id:"okt",name:"Октябрьский",center:[64.535,40.515],coords:[[64.54,40.46],[64.56,40.50],[64.55,40.56],[64.52,40.59],[64.48,40.55],[64.47,40.49],[64.54,40.46]]},
 {id:"lom",name:"Ломоносовский",center:[64.535,40.57],coords:[[64.55,40.56],[64.57,40.60],[64.55,40.65],[64.50,40.66],[64.47,40.61],[64.48,40.55],[64.52,40.59],[64.55,40.56]]},
 {id:"may",name:"Майская Горка",center:[64.50,40.63],coords:[[64.47,40.61],[64.50,40.66],[64.55,40.65],[64.55,40.71],[64.49,40.73],[64.44,40.68],[64.43,40.62],[64.47,40.61]]},
 {id:"var",name:"Варавино-Фактория",center:[64.45,40.62],coords:[[64.43,40.62],[64.44,40.68],[64.49,40.73],[64.48,40.78],[64.40,40.77],[64.36,40.69],[64.38,40.62],[64.43,40.62]]},
 {id:"isa",name:"Исакогорский",center:[64.39,40.56],coords:[[64.43,40.62],[64.38,40.62],[64.35,40.56],[64.38,40.48],[64.45,40.47],[64.47,40.49],[64.48,40.55],[64.43,40.62]]},
 {id:"tsig",name:"Цигломенский",center:[64.34,40.69],coords:[[64.36,40.69],[64.38,40.62],[64.40,40.77],[64.35,40.83],[64.28,40.79],[64.27,40.70],[64.36,40.69]]}
];

const map=L.map("map",{zoomControl:true}).setView(CITY,11.6);
L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",{
 maxZoom:19,
 attribution:'&copy; OpenStreetMap contributors &copy; CARTO'
}).addTo(map);

let selected=null; const layers=[];
const storeKey="gvs_arh_v2";
function all(){try{return JSON.parse(localStorage.getItem(storeKey)||"{}")}catch{return {}}}
function save(x){localStorage.setItem(storeKey,JSON.stringify(x))}
function get(id){return all()[id]||{yes:0,no:0,comments:[]}}
function status(d){return d.yes>d.no&&d.yes?["ok","ВОДА ЕСТЬ"]:d.no>d.yes&&d.no?["bad","ВОДЫ НЕТ"]:["","НЕТ ДАННЫХ"]}
function color(d){const [s]=status(get(d.id));return s==="ok"?"#22c55e":s==="bad"?"#ef4444":"#94a3b8"}
function style(d){const c=color(d);return{color:c,weight:2,fillColor:c,fillOpacity:.23}}
function refresh(){layers.forEach(x=>x.layer.setStyle(style(x.d)))}

DISTRICTS.forEach(d=>{
 const layer=L.polygon(d.coords,style(d),{bubblingMouseEvents:false}).addTo(map);
 layer.bindTooltip(d.name,{permanent:true,direction:"center",className:"district-label",opacity:.95});
 layer.on("click",()=>select(d));
 layer.on("mouseover",()=>layer.setStyle({...style(d),weight:3,fillOpacity:.34}));
 layer.on("mouseout",()=>layer.setStyle(style(d)));
 layers.push({layer,d});
});

function select(d){selected=d;document.getElementById("empty").classList.add("hidden");document.getElementById("district").classList.remove("hidden");document.getElementById("note").textContent="";render();map.fitBounds(layers.find(x=>x.d.id===d.id).layer.getBounds(),{padding:[70,70],maxZoom:13})}
function render(){
 const d=get(selected.id),[cls,label]=status(d);
 $("name").textContent=selected.name;$("yes").textContent=d.yes||0;$("no").textContent=d.no||0;$("commentsCount").textContent=(d.comments||[]).length;
 $("badge").className="badge "+cls;$("badge").textContent=label;
 $("comments").innerHTML=d.comments?.length?d.comments.slice().reverse().map(c=>`<div class="comment"><div class="meta">${esc(c.author||"Житель")} · ${esc(c.time||"")}</div><div class="ct">${esc(c.text)}</div></div>`).join(""):`<div class="comment"><div class="ct">Пока нет комментариев. Будьте первым.</div></div>`;
}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function vote(type){const x=all(),d=x[selected.id]||{yes:0,no:0,comments:[]};d[type]=(d[type]||0)+1;x[selected.id]=d;save(x);$("note").textContent="Отметка сохранена. Спасибо!";render();refresh()}
$("yesBtn").onclick=()=>vote("yes");$("noBtn").onclick=()=>vote("no");
$("form").onsubmit=e=>{e.preventDefault();const t=$("text").value.trim();if(!t)return;const x=all(),d=x[selected.id]||{yes:0,no:0,comments:[]};d.comments=d.comments||[];d.comments.push({author:$("author").value.trim()||"Житель",text:t,time:new Date().toLocaleString("ru-RU")});x[selected.id]=d;save(x);$("text").value="";$("author").value="";render()};
$("back").onclick=()=>{selected=null;$("district").classList.add("hidden");$("empty").classList.remove("hidden");map.setView(CITY,11.6)};
$("cityBtn").onclick=()=>{selected=null;$("district").classList.add("hidden");$("empty").classList.remove("hidden");map.setView(CITY,11.6)};
