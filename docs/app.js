const DATA_BASE = './data/';
const state = { data: {}, layers: {}, enabled: { fires: true, risk: true, spread: true, eonet: true } };
const map = L.map('map', { zoomControl: false, worldCopyJump: true, minZoom: 2 }).setView([18, 5], 2);
L.control.zoom({ position: 'bottomright' }).addTo(map);
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap &copy; CARTO' }).addTo(map);

const regions = { global: [[-55,-175],[75,175]], 'north-america': [[5,-170],[75,-50]], 'south-america': [[-58,-85],[15,-30]], europe: [[34,-15],[72,45]], africa: [[-38,-20],[38,55]], asia: [[0,40],[75,180]], oceania: [[-50,105],[5,180]] };
const riskColor = score => score >= .8 ? '#ea3e2b' : score >= .6 ? '#f28b2d' : score >= .35 ? '#d6c93b' : '#5fae58';
const formatAge = iso => { const h = Math.max(0, (Date.now() - new Date(iso).getTime()) / 36e5); return h < 1 ? `${Math.round(h*60)}m ago` : h < 48 ? `${Math.round(h)}h ago` : `${Math.round(h/24)}d ago`; };
const fetchJSON = async name => { const r = await fetch(DATA_BASE + name, { cache: 'no-store' }); if (!r.ok) throw new Error(name); return r.json(); };

function popupFire(f) { return `<div class="popup-title">Thermal detection</div><div class="popup-meta">FRP ${Number(f.frp).toFixed(1)} MW<br>${f.satellite} • ${f.confidence} confidence<br>${new Date(f.acq_datetime).toLocaleString()}</div>`; }
function renderFires() {
  if (state.layers.fires) map.removeLayer(state.layers.fires);
  const maxAge = document.querySelector('#age-filter').value;
  const referenceTime = state.data.fires.metadata.demo
    ? Math.max(...state.data.fires.fires.map(f => new Date(f.acq_datetime).getTime()))
    : Date.now();
  const fires = state.data.fires.fires.filter(f => maxAge === 'all' || (referenceTime - new Date(f.acq_datetime)) / 36e5 <= Number(maxAge));
  state.layers.fires = L.layerGroup(fires.map(f => L.circleMarker([f.lat, f.lon], { radius: Math.max(3, Math.min(11, 3 + Math.sqrt(f.frp || 0) / 2.4)), color: '#ff9b80', weight: .7, fillColor: '#ff4d27', fillOpacity: .74 }).bindPopup(popupFire(f))));
  if (state.enabled.fires) state.layers.fires.addTo(map);
  document.querySelector('#chip-fire-count').textContent = fires.length.toLocaleString();
}
function renderRisk() {
  const cells = state.data.risk.cells || [];
  state.layers.risk = L.layerGroup(cells.map(c => L.rectangle([[c.lat-1,c.lon-1],[c.lat+1,c.lon+1]], { stroke:false, fillColor:riskColor(c.risk_score), fillOpacity:.24 + c.risk_score*.24, interactive:true }).bindPopup(`<div class="popup-title">${c.bucket} regional risk</div><div class="popup-meta">Score ${c.risk_score.toFixed(2)} / 1.00<br>${c.weather.temp_c}°C • ${c.weather.humidity_pct}% RH<br>Wind ${c.weather.wind_ms} m/s • Rain ${c.weather.rain_7d_mm} mm / 7d</div>`)));
  if (state.enabled.risk) state.layers.risk.addTo(map);
}
function renderSpread() {
  const items=[];
  (state.data.spread.projections||[]).forEach(p=>{ items.push(L.polygon(p.cone_24h,{color:'#d6ff43',weight:1,dashArray:'5 6',fillColor:'#d6ff43',fillOpacity:.045}).bindPopup(`<div class="popup-title">24-hour illustrative extent</div><div class="popup-meta">Proxy rate ${p.ros_kmh} km/h<br>Downwind ${p.downwind_dir}°<br>Wind-only estimate</div>`)); items.push(L.polygon(p.cone_6h,{color:'#d6ff43',weight:1.3,fillColor:'#d6ff43',fillOpacity:.1})); });
  state.layers.spread=L.layerGroup(items); if(state.enabled.spread) state.layers.spread.addTo(map);
}
function renderEonet(){ state.layers.eonet=L.layerGroup((state.data.eonet.events||[]).map(e=>L.marker([e.lat,e.lon],{icon:L.divIcon({className:'',html:'<div class="confirmed-marker"></div>',iconSize:[14,14]})}).bindPopup(`<div class="popup-title">${e.title}</div><div class="popup-meta">NASA EONET confirmed event<br>${e.date?new Date(e.date).toLocaleDateString():''}${e.url?`<br><a href="${e.url}" target="_blank" rel="noreferrer">Source ↗</a>`:''}</div>`))); if(state.enabled.eonet)state.layers.eonet.addTo(map); }
function setMetrics(){ const fires=state.data.fires.fires||[], cells=state.data.risk.cells||[], events=state.data.eonet.events||[]; document.querySelector('#fire-count').textContent=fires.length.toLocaleString(); document.querySelector('#high-risk-count').textContent=cells.filter(c=>c.risk_score>=.6).length.toLocaleString(); document.querySelector('#confirmed-count').textContent=events.length.toLocaleString(); const dates=[state.data.fires.metadata.updated_at,state.data.risk.metadata.updated_at].filter(Boolean).map(v=>new Date(v)); const latest=new Date(Math.max(...dates)); const demo=[state.data.fires,state.data.risk].some(d=>d.metadata.demo); document.querySelector('#last-updated').textContent=demo?'DEMO':formatAge(latest); document.querySelector('#system-status').textContent=demo?'Demo dataset loaded':'Global feed online'; }
async function init(){ try{ const [fires,risk,spread,eonet]=await Promise.all(['fires_latest.json','risk_grid_latest.json','spread_projection_latest.json','eonet_latest.json'].map(fetchJSON)); state.data={fires,risk,spread,eonet}; renderRisk(); renderSpread(); renderFires(); renderEonet(); setMetrics(); }catch(err){ document.querySelector('#system-status').textContent='Data feed unavailable'; console.error(err); } }
document.querySelectorAll('.layer-chip').forEach(button=>button.addEventListener('click',()=>{ const key=button.dataset.layer; state.enabled[key]=!state.enabled[key]; button.classList.toggle('active',state.enabled[key]); if(state.layers[key]) state.enabled[key]?state.layers[key].addTo(map):map.removeLayer(state.layers[key]); }));
document.querySelector('#region-filter').addEventListener('change',e=>map.fitBounds(regions[e.target.value],{padding:[20,20]}));
document.querySelector('#age-filter').addEventListener('change',renderFires);
const dialog=document.querySelector('#about-dialog'); document.querySelector('#about-button').addEventListener('click',()=>dialog.showModal()); document.querySelector('#dialog-close').addEventListener('click',()=>dialog.close()); dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
init();
