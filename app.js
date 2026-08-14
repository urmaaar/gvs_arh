/*
  gvs_arh — MVP.
  1) Получите API-ключ Яндекс Карт и замените YOUR_YANDEX_API_KEY в index.html.
  2) Для общего хранения включите Supabase в config ниже.
  3) Пока Supabase не настроен, данные сохраняются в localStorage этого браузера.
*/

const CONFIG = {
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: ""
};

// Приближённые демонстрационные зоны. Для запуска публичной версии
// замените координаты на точные границы районов/территорий в GeoJSON.
const DISTRICTS = [
  {id:"lom", name:"Ломоносовский", center:[40.545,64.545], coords:[[40.50,64.56],[40.58,64.57],[40.61,64.53],[40.57,64.50],[40.49,64.51],[40.50,64.56]]},
  {id:"okt", name:"Октябрьский", center:[40.525,64.535], coords:[[40.45,64.56],[40.50,64.56],[40.49,64.51],[40.45,64.50],[40.43,64.53],[40.45,64.56]]},
  {id:"sol", name:"Соломбала", center:[40.54,64.585], coords:[[40.49,64.60],[40.58,64.60],[40.58,64.57],[40.50,64.56],[40.49,64.60]]},
  {id:"may", name:"Майская Горка", center:[40.61,64.53], coords:[[40.58,64.57],[40.67,64.55],[40.69,64.50],[40.61,64.49],[40.57,64.50],[40.58,64.57]]},
  {id:"var", name:"Варавино-Фактория", center:[40.67,64.53], coords:[[40.67,64.58],[40.77,64.57],[40.78,64.52],[40.69,64.50],[40.67,64.58]]},
  {id:"isa", name:"Исакогорский", center:[40.62,64.45], coords:[[40.50,64.49],[40.61,64.49],[40.69,64.50],[40.68,64.43],[40.55,64.40],[40.50,64.49]]},
  {id:"tsig", name:"Цигломень", center:[40.79,64.43], coords:[[40.70,64.47],[40.85,64.48],[40.89,64.42],[40.76,64.39],[40.68,64.43],[40.70,64.47]]}
];

let selected = null;
let map = null;
let supabase = null;

const $ = id => document.getElementById(id);

function localKey(){ return "gvs_arh_v1"; }
function loadLocal(){
  try { return JSON.parse(localStorage.getItem(localKey()) || "{}"); }
  catch { return {}; }
}
function saveLocal(data){ localStorage.setItem(localKey(), JSON.stringify(data)); }

function districtData(id){
  const all = loadLocal();
  return all[id] || {yes:0,no:0,comments:[],lastStatus:null};
}

async function dbReady(){
  return CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY && window.supabase;
}

function statusFor(d){
  if(d.yes > d.no && d.yes > 0) return ["ok","ВОДА ЕСТЬ"];
  if(d.no > d.yes && d.no > 0) return ["bad","ВОДЫ НЕТ"];
  return ["","НЕТ ДАННЫХ"];
}

function renderPanel(){
  if(!selected){
    $("emptyState").classList.remove("hidden");
    $("districtState").classList.add("hidden");
    return;
  }
  $("emptyState").classList.add("hidden");
  $("districtState").classList.remove("hidden");

  const d = districtData(selected.id);
  $("districtName").textContent = selected.name;
  $("yesCount").textContent = d.yes || 0;
  $("noCount").textContent = d.no || 0;
  $("commentCount").textContent = (d.comments || []).length;

  const [cls,label] = statusFor(d);
  $("statusBadge").className = "status-badge " + cls;
  $("statusBadge").textContent = label;
  $("modeLabel").textContent = CONFIG.SUPABASE_URL ? "общая база" : "демо-режим";

  const comments = d.comments || [];
  $("comments").innerHTML = comments.length
    ? comments.slice().reverse().map(c => `<div class="comment"><div class="comment-meta">${escapeHtml(c.author || "Житель")} · ${escapeHtml(c.time || "")}</div><div class="comment-text">${escapeHtml(c.text)}</div></div>`).join("")
    : `<div class="comment"><div class="comment-text">Пока нет комментариев. Будьте первым.</div></div>`;
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

function vote(type){
  if(!selected) return;
  const all = loadLocal();
  const d = all[selected.id] || {yes:0,no:0,comments:[]};
  d[type] = (d[type] || 0) + 1;
  d.lastStatus = type;
  all[selected.id] = d;
  saveLocal(all);
  $("voteNote").textContent = "Спасибо! Отметка сохранена в этом браузере.";
  renderPanel();
  recolorDistricts();
}

function addComment(e){
  e.preventDefault();
  if(!selected) return;
  const text = $("commentText").value.trim();
  if(!text) return;
  const author = $("commentAuthor").value.trim() || "Житель";
  const all = loadLocal();
  const d = all[selected.id] || {yes:0,no:0,comments:[]};
  d.comments = d.comments || [];
  d.comments.push({author,text,time:new Date().toLocaleString("ru-RU")});
  all[selected.id] = d;
  saveLocal(all);
  $("commentText").value = "";
  $("commentAuthor").value = "";
  $("voteNote").textContent = "Комментарий добавлен.";
  renderPanel();
}

const features = [];

function showArkhangelsk() {
  if (map) {
    map.update({
      location: {
        center: [40.5433, 64.5393],
        zoom: 11.6
      }
    });
  }
}

function districtStyle(d){
  const data = districtData(d.id);
  const [cls] = statusFor(data);
  const fill = cls === "ok" ? "#22c55e" : cls === "bad" ? "#ef4444" : "#94a3b8";
  return {fill:[{color:fill,opacity:0.28}],stroke:[{color:fill,width:3,opacity:0.9}]};
}

function recolorDistricts(){
  // Rebuild features to update colors.
  if(!map) return;
  features.forEach(x => x.update({style:districtStyle(x.d)}));
}

async function initMap(){
  await ymaps3.ready;
  const {YMap, YMapDefaultSchemeLayer, YMapDefaultFeaturesLayer, YMapFeature} = ymaps3;

  map = new YMap(document.getElementById("map"), {
    location:{center:[40.5433,64.5393], zoom:11.6}
  }, [
    new YMapDefaultSchemeLayer({}),
    new YMapDefaultFeaturesLayer({})
  ]);

  // При каждом открытии сайта камера начинается с Архангельска.
  showArkhangelsk();

  DISTRICTS.forEach(d => {
    const feature = new YMapFeature({
      id:d.id,
      geometry:{type:"Polygon", coordinates:[d.coords]},
      style:districtStyle(d),
      onClick:() => {
        selected = d;
        $("voteNote").textContent = "";
        renderPanel();
      },
      onMouseEnter:() => document.body.style.cursor = "pointer",
      onMouseLeave:() => document.body.style.cursor = ""
    });
    feature.d = d;
    features.push(feature);
    map.addChild(feature);
  });
}

$("yesBtn").addEventListener("click",()=>vote("yes"));
$("noBtn").addEventListener("click",()=>vote("no"));
$("commentForm").addEventListener("submit",addComment);
$("backBtn").addEventListener("click",()=>{selected=null;renderPanel();});

renderPanel();
initMap().catch(err => {
  console.error(err);
  $("map").innerHTML = `<div style="padding:30px;font:16px system-ui;color:#b42318">
    Не удалось загрузить Яндекс Карту. Проверьте API-ключ в index.html.
  </div>`;
});


$("cityBtn").addEventListener("click", showArkhangelsk);
