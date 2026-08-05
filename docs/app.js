const DATA_BASE = './data/';
const MAX_FIRE_MARKERS = 1800;
const MAX_EONET_MARKERS = 120;
const DETAIL_ZOOM = 6;

const state = {
  data: {},
  layers: {},
  enabled: { fires: true, risk: true, spread: false, eonet: true },
  renderTimer: null,
  sortedFires: [],
  fireReferenceTime: Date.now(),
};

const canvasRenderer = L.canvas({ padding: 0.35 });
const map = L.map('map', {
  zoomControl: false,
  worldCopyJump: true,
  minZoom: 1,
  zoomSnap: 0.25,
  preferCanvas: true,
  renderer: canvasRenderer,
}).setView([10, 0], 1.5);

L.control.zoom({ position: 'bottomright' }).addTo(map);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap &copy; CARTO',
}).addTo(map);

map.createPane('riskPane').style.zIndex = 360;
map.createPane('spreadPane').style.zIndex = 390;
map.createPane('firePane').style.zIndex = 430;
map.createPane('eventPane').style.zIndex = 450;

const regions = {
  global: [[-55, -175], [75, 175]],
  'north-america': [[5, -170], [75, -50]],
  'south-america': [[-58, -85], [15, -30]],
  europe: [[34, -15], [72, 45]],
  africa: [[-38, -20], [38, 55]],
  asia: [[0, 40], [75, 180]],
  oceania: [[-50, 105], [5, 180]],
};

const riskColor = score => score >= 0.8 ? '#c9261c' : score >= 0.6 ? '#e36f17' : score >= 0.35 ? '#d1aa16' : '#4f9c57';
const fireColor = frp => frp >= 150 ? '#9d120d' : frp >= 70 ? '#df3b1f' : frp >= 25 ? '#ff7a2f' : '#f5c54a';
const formatAge = iso => {
  const h = Math.max(0, (Date.now() - new Date(iso).getTime()) / 36e5);
  return h < 1 ? `${Math.round(h * 60)}m ago` : h < 48 ? `${Math.round(h)}h ago` : `${Math.round(h / 24)}d ago`;
};
const fetchJSON = async name => {
  const r = await fetch(DATA_BASE + name, { cache: 'no-store' });
  if (!r.ok) throw new Error(name);
  return r.json();
};

function popupFire(f) {
  return `<div class="popup-title">Thermal detection</div><div class="popup-meta">FRP ${Number(f.frp || 0).toFixed(1)} MW<br>${f.satellite} - ${f.confidence} confidence<br>${new Date(f.acq_datetime).toLocaleString()}</div>`;
}

function fireAgeHours(f, referenceTime) {
  return (referenceTime - new Date(f.acq_datetime).getTime()) / 36e5;
}

function visibleFires() {
  const maxAge = document.querySelector('#age-filter').value;
  const fires = state.sortedFires.length ? state.sortedFires : (state.data.fires.fires || []);
  const referenceTime = state.data.fires.metadata.demo ? state.fireReferenceTime : Date.now();
  const bounds = map.getBounds().pad(0.12);
  return fires.filter(f => {
    if (maxAge !== 'all' && fireAgeHours(f, referenceTime) > Number(maxAge)) return false;
    return map.getZoom() < DETAIL_ZOOM || bounds.contains([f.lat, f.lon]);
  });
}

function sampledFires(fires) {
  const zoom = map.getZoom();
  const limit = zoom >= DETAIL_ZOOM ? MAX_FIRE_MARKERS : Math.floor(MAX_FIRE_MARKERS * 0.55);
  if (fires.length <= limit) return fires;
  return fires.slice(0, limit);
}

function aggregateFires(fires) {
  const zoom = map.getZoom();
  const step = zoom <= 3 ? 8 : 5;
  const bins = new Map();
  fires.forEach(f => {
    const lat = Math.round(f.lat / step) * step;
    const lon = Math.round(f.lon / step) * step;
    const key = `${lat}:${lon}`;
    const existing = bins.get(key);
    const frp = Number(f.frp || 0);
    if (!existing) {
      bins.set(key, { lat, lon, count: 1, frp, maxFrp: frp, latest: f.acq_datetime });
      return;
    }
    existing.count += 1;
    existing.frp += frp;
    existing.maxFrp = Math.max(existing.maxFrp, frp);
    if (new Date(f.acq_datetime) > new Date(existing.latest)) existing.latest = f.acq_datetime;
  });
  return [...bins.values()].sort((a, b) => b.count - a.count).slice(0, MAX_FIRE_MARKERS);
}

function popupFireBin(bin) {
  return `<div class="popup-title">Fire activity cluster</div><div class="popup-meta">${bin.count.toLocaleString()} detections nearby<br>Max FRP ${bin.maxFrp.toFixed(1)} MW<br>Latest ${new Date(bin.latest).toLocaleString()}</div>`;
}

function renderFires() {
  if (!state.data.fires) return;
  if (state.layers.fires) map.removeLayer(state.layers.fires);

  const filtered = visibleFires();
  const zoom = map.getZoom();
  let renderedCount = 0;
  let mode = 'detections';

  if (zoom < DETAIL_ZOOM) {
    const bins = aggregateFires(filtered);
    renderedCount = bins.length;
    mode = 'clusters';
    state.layers.fires = L.layerGroup(bins.map(bin => {
      const size = Math.max(12, Math.min(34, 8 + Math.sqrt(bin.count) * 2.1));
      return L.marker([bin.lat, bin.lon], {
        pane: 'markerPane',
        icon: L.divIcon({
          className: '',
          html: `<span class="fire-cluster" style="--cluster-size:${size}px;--cluster-color:${fireColor(bin.maxFrp)}"></span>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        }),
      }).bindPopup(popupFireBin(bin));
    }));
  } else {
    const fires = sampledFires(filtered);
    renderedCount = fires.length;
    state.layers.fires = L.layerGroup(fires.map(f => L.circleMarker([f.lat, f.lon], {
      renderer: canvasRenderer,
      pane: 'firePane',
      radius: Math.max(4.2, Math.min(8, 4.2 + Math.sqrt(Number(f.frp || 0)) / 7)),
      color: '#2a0b07',
      weight: 0.8,
      fillColor: fireColor(Number(f.frp || 0)),
      fillOpacity: 0.82,
    }).bindPopup(popupFire(f))));
  }

  if (state.enabled.fires) state.layers.fires.addTo(map);
  document.querySelector('#chip-fire-count').textContent = filtered.length.toLocaleString();
  document.querySelector('#map-readout').textContent =
    `Showing ${renderedCount.toLocaleString()} ${mode} from ${filtered.length.toLocaleString()} filtered fire detections`;
}

function renderRisk() {
  if (state.layers.risk) map.removeLayer(state.layers.risk);
  const cells = state.data.risk.cells || [];
  state.layers.risk = L.layerGroup(cells.map(c => L.rectangle([[c.lat - 1, c.lon - 1], [c.lat + 1, c.lon + 1]], {
    pane: 'riskPane',
    stroke: true,
    color: '#ffffff',
    weight: 0.35,
    opacity: 0.35,
    fillColor: riskColor(c.risk_score),
    fillOpacity: 0.28 + c.risk_score * 0.22,
    interactive: true,
  }).bindPopup(`<div class="popup-title">${c.bucket} regional risk</div><div class="popup-meta">Score ${c.risk_score.toFixed(2)} / 1.00<br>${c.weather.temp_c} C - ${c.weather.humidity_pct}% RH<br>Wind ${c.weather.wind_ms} m/s - Rain ${c.weather.rain_7d_mm} mm / 7d</div>`)));
  if (state.enabled.risk) state.layers.risk.addTo(map);
}

function renderSpread() {
  if (state.layers.spread) map.removeLayer(state.layers.spread);
  const items = [];
  (state.data.spread.projections || []).slice(0, 100).forEach(p => {
    items.push(L.polygon(p.cone_24h, {
      pane: 'spreadPane',
      color: '#192114',
      weight: 2,
      dashArray: '6 7',
      fillColor: '#d6ff43',
      fillOpacity: 0.055,
    }).bindPopup(`<div class="popup-title">24-hour illustrative extent</div><div class="popup-meta">Proxy rate ${p.ros_kmh} km/h<br>Downwind ${p.downwind_dir} deg<br>Wind-only estimate</div>`));
    items.push(L.polygon(p.cone_6h, {
      pane: 'spreadPane',
      color: '#12170d',
      weight: 1.5,
      fillColor: '#d6ff43',
      fillOpacity: 0.12,
    }));
  });
  state.layers.spread = L.layerGroup(items);
  if (state.enabled.spread) state.layers.spread.addTo(map);
}

function renderEonet() {
  if (state.layers.eonet) map.removeLayer(state.layers.eonet);
  const events = (state.data.eonet.events || []).slice(0, MAX_EONET_MARKERS);
  state.layers.eonet = L.layerGroup(events.map(e => L.circleMarker([e.lat, e.lon], {
    renderer: canvasRenderer,
    pane: 'eventPane',
    radius: 5,
    color: '#132018',
    weight: 2,
    fillColor: '#ffffff',
    fillOpacity: 0.92,
  }).bindPopup(`<div class="popup-title">${e.title}</div><div class="popup-meta">NASA EONET confirmed event<br>${e.date ? new Date(e.date).toLocaleDateString() : ''}${e.url ? `<br><a href="${e.url}" target="_blank" rel="noreferrer">Source</a>` : ''}</div>`)));
  if (state.enabled.eonet) state.layers.eonet.addTo(map);
}

function setMetrics() {
  const fires = state.data.fires.fires || [];
  const cells = state.data.risk.cells || [];
  const events = state.data.eonet.events || [];
  document.querySelector('#fire-count').textContent = fires.length.toLocaleString();
  document.querySelector('#high-risk-count').textContent = cells.filter(c => c.risk_score >= 0.6).length.toLocaleString();
  document.querySelector('#confirmed-count').textContent = events.length.toLocaleString();
  const dates = [state.data.fires.metadata.updated_at, state.data.risk.metadata.updated_at].filter(Boolean).map(v => new Date(v));
  const latest = new Date(Math.max(...dates));
  const demo = [state.data.fires, state.data.risk].some(d => d.metadata.demo);
  document.querySelector('#last-updated').textContent = demo ? 'DEMO' : formatAge(latest);
  document.querySelector('#system-status').textContent = demo ? 'Demo dataset loaded' : 'Global feed online';
}

function scheduleFireRender() {
  clearTimeout(state.renderTimer);
  state.renderTimer = setTimeout(renderFires, 120);
}

async function init() {
  try {
    const [fires, risk, spread, eonet] = await Promise.all(
      ['fires_latest.json', 'risk_grid_latest.json', 'spread_projection_latest.json', 'eonet_latest.json'].map(fetchJSON),
    );
    state.data = { fires, risk, spread, eonet };
    state.sortedFires = [...(fires.fires || [])].sort((a, b) =>
      (Number(b.frp || 0) - Number(a.frp || 0)) || (new Date(b.acq_datetime) - new Date(a.acq_datetime)),
    );
    const fireTimes = (fires.fires || []).map(f => new Date(f.acq_datetime).getTime()).filter(Number.isFinite);
    state.fireReferenceTime = fires.metadata.demo && fireTimes.length ? Math.max(...fireTimes) : Date.now();
    renderRisk();
    renderSpread();
    renderFires();
    renderEonet();
    setMetrics();
  } catch (err) {
    document.querySelector('#system-status').textContent = 'Data feed unavailable';
    console.error(err);
  }
}

document.querySelectorAll('.layer-chip').forEach(button => button.addEventListener('click', () => {
  const key = button.dataset.layer;
  state.enabled[key] = !state.enabled[key];
  button.classList.toggle('active', state.enabled[key]);
  if (state.layers[key]) state.enabled[key] ? state.layers[key].addTo(map) : map.removeLayer(state.layers[key]);
}));

document.querySelector('[data-layer="spread"]').classList.remove('active');
document.querySelector('#region-filter').addEventListener('change', e => map.fitBounds(regions[e.target.value], { padding: [20, 20] }));
document.querySelector('#age-filter').addEventListener('change', renderFires);
map.on('moveend zoomend', scheduleFireRender);

const dialog = document.querySelector('#about-dialog');
document.querySelector('#about-button').addEventListener('click', () => dialog.showModal());
document.querySelector('#dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });

init();
