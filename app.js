/* Street data is loaded from OpenStreetMap. Historical facts and MP3 files
   are deliberately kept in data/stories.json and assets/audio/ for editorial review. */
const CITY = { center:[49.4216,26.9965], bounds:[[49.35,26.86],[49.49,27.14]] };
const map = L.map('map',{scrollWheelZoom:true}).setView(CITY.center,13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
  maxZoom:19, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);
let streetFeatures=[], visibleFeatures=[], selectedLayer=null, selectedId=null, stories={};
const list=document.getElementById('street-list'), search=document.getElementById('street-search');
const status=document.getElementById('status');
const layerById=new Map();
const styleDefault={color:'#6d9ba6',weight:4,opacity:.76};
const styleSelected={color:'#d18b48',weight:7,opacity:1};
function norm(s){return (s||'').toLocaleLowerCase('uk').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[’'`.,-]/g,'').replace(/\s+/g,' ').trim();}
function featureId(f){return String(f.id || f.properties?.['@id'] || f.properties?.name || Math.random());}
function featureName(f){return f.properties?.name || f.properties?.['name:uk'] || 'Вулиця без назви';}
function showStatus(t){status.textContent=t;}
function storyFor(name){
  const key=norm(name);
  if(stories[key])return stories[key];
  return Object.values(stories).find(s=>[s.name,...(s.aliases||[])].some(a=>norm(a)===key || (key.length>5 && norm(a).includes(key)) || (norm(a).length>5 && key.includes(norm(a))))) || null;
}
function openStreet(f, layer){
  if(selectedLayer) selectedLayer.setStyle(styleDefault);
  selectedLayer=layer || layerById.get(featureId(f));
  if(selectedLayer){selectedLayer.setStyle(styleSelected); selectedLayer.bringToFront?.();}
  selectedId=featureId(f);
  const name=featureName(f), story=storyFor(name);
  document.getElementById('card-title').textContent=name;
  document.getElementById('card-subtitle').textContent='м. Хмельницький';
  document.getElementById('new-name').textContent=story?.newName || name;
  document.getElementById('old-name').textContent=story?.oldName || 'Інформація уточнюється';
  document.getElementById('story-text').textContent=story?.text || 'Історична довідка для цієї вулиці ще готується. Ми додамо перевірену інформацію про попередню назву, дату й причину перейменування, а також про особу або подію, на честь якої названо вулицю.';
  const narrationSection=document.getElementById('narration-section');
  narrationSection.hidden=!story?.narration;
  document.getElementById('narration-text').textContent=story?.narration || '';
  const audio=document.getElementById('street-audio'), unavailable=document.getElementById('audio-unavailable');
  audio.pause(); audio.removeAttribute('src'); audio.load();
  if(story?.audio){
    audio.src=story.audio; audio.hidden=false; unavailable.hidden=true;
  }else{audio.hidden=true; unavailable.hidden=false;}
  const source=document.getElementById('source-link'), empty=document.getElementById('source-empty');
  if(story?.source){source.href=story.source;source.hidden=false;empty.hidden=true;}
  else{source.hidden=true;empty.hidden=false;}
  document.getElementById('street-modal').hidden=false;
  document.getElementById('close-card').focus();
  renderList(search.value);
}
function closeModal(){document.getElementById('street-modal').hidden=true;const a=document.getElementById('street-audio');a.pause();}
document.getElementById('close-card').addEventListener('click',closeModal);
document.getElementById('street-modal').addEventListener('click',e=>{if(e.target.id==='street-modal')closeModal();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});
function renderList(query=''){
  const q=norm(query);
  const matches=streetFeatures.filter(f=>norm(featureName(f)).includes(q) || norm(storyFor(featureName(f))?.oldName).includes(q));
  document.getElementById('result-count').textContent=`${matches.length} із ${streetFeatures.length}`;
  list.innerHTML='';
  if(!matches.length){list.innerHTML='<div class="loading">Нічого не знайдено. Спробуйте іншу назву.</div>';return;}
  matches.slice(0,500).forEach(f=>{
    const id=featureId(f), name=featureName(f), story=storyFor(name);
    const b=document.createElement('button'); b.className='street-item'+(id===selectedId?' active':'');
    const left=document.createElement('span'), strong=document.createElement('strong'), small=document.createElement('small'), chev=document.createElement('span');
    strong.textContent=name; small.textContent=story?.oldName ? `Попередня назва: ${story.oldName}` : 'Історична довідка готується'; chev.className='chev';chev.textContent='›';
    left.append(strong,small);b.append(left,chev);
    b.addEventListener('click',()=>{const l=layerById.get(id);if(l){map.fitBounds(l.getBounds(),{padding:[60,60],maxZoom:16});openStreet(f,l);}else openStreet(f,null);});
    list.appendChild(b);
  });
}
search.addEventListener('input',()=>renderList(search.value));
document.getElementById('clear-search').addEventListener('click',()=>{search.value='';renderList('');search.focus();});
document.getElementById('locate-city').addEventListener('click',()=>map.fitBounds(CITY.bounds));
async function loadStories(){
  try{const r=await fetch('data/stories.json');if(r.ok){const data=await r.json();(data.stories||[]).forEach(s=>{stories[norm(s.name)]=s;(s.aliases||[]).forEach(a=>stories[norm(a)]=s);});}}
  catch(e){console.warn('Historical story data unavailable',e);}
  document.getElementById('story-count').textContent=(data.stories||[]).length;
}
async function loadStreets(){
  const query='[out:json][timeout:45];area["name"="Хмельницький"]["boundary"="administrative"]->.city;(way(area.city)["highway"]["name"];);out geom;';
  const endpoints=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter'];
  let data=null, lastError=null;
  for(const endpoint of endpoints){
    try{const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:'data='+encodeURIComponent(query)});if(!response.ok)throw new Error(`Overpass ${response.status}`);data=await response.json();break;}
    catch(e){lastError=e;}
  }
  if(!data)throw lastError||new Error('Не вдалося отримати геодані');
  const seen=new Set();
  data.elements.forEach(el=>{
    if(!el.geometry || !el.tags?.name)return;
    const key=el.tags.name+'|'+(el.tags.highway||'');
    if(seen.has(key))return;seen.add(key);
    const coords=el.geometry.map(p=>[p.lat,p.lon]);
    const f={type:'Feature',id:'way/'+el.id,properties:{...el.tags,'@id':'way/'+el.id},geometry:{type:'LineString',coordinates:coords.map(p=>[p[1],p[0]])}};
    streetFeatures.push(f);
  });
  // Render every returned named road segment; list is de-duplicated by name below.
  const grouped=new Map();
  streetFeatures.forEach(f=>{const n=featureName(f);if(!grouped.has(norm(n)))grouped.set(norm(n),f);});
  const unique=[...grouped.values()].sort((a,b)=>featureName(a).localeCompare(featureName(b),'uk'));
  const geo=L.geoJSON({type:'FeatureCollection',features:streetFeatures},{
    style:styleDefault,
    onEachFeature:(f,l)=>{
      const name=featureName(f);
      l.bindTooltip(name,{sticky:true,direction:'top',opacity:.95});
      l.on('click',()=>openStreet(f,l));
      // Map list uses first segment for each street name, but map remains fully segmented.
      if(!layerById.has(featureId(f)))layerById.set(featureId(f),l);
    }
  }).addTo(map);
  map.fitBounds(CITY.bounds);
  streetFeatures=unique;
  document.getElementById('street-count').textContent=unique.length.toLocaleString('uk-UA');
  renderList('');
  showStatus(`Завантажено ${unique.length} назв вулиць із OpenStreetMap. Дані карти можуть уточнюватися спільнотою OpenStreetMap.`);
}
(async()=>{await loadStories();try{await loadStreets();}catch(e){console.error(e);list.innerHTML='<div class="loading">Не вдалося завантажити геодані вулиць. Перевірте підключення до інтернету та спробуйте оновити сторінку.</div>';showStatus('Помилка завантаження карти вулиць. Базова карта залишається доступною.');}})();
