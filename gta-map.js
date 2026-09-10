/**
 * BLACK RIDGE CITY - GTA V TACTICAL LEAFLET MAP MODULE
 * Full integration for GTA V Los Santos Map Overlay & Live Socket Tracking
 */

let gtaMap = null;
let mapMarkers = {};

function initGTAMap() {
  const mapContainer = document.getElementById('gta-map');
  if (!mapContainer) return;

  if (gtaMap !== null) {
    gtaMap.remove();
  }

  gtaMap = L.map('gta-map', {
    crs: L.CRS.Simple,
    minZoom: 1,
    maxZoom: 5,
    zoomControl: true,
    attributionControl: false
  });

  const bounds = L.latLngBounds([0, 0], [8192, 8192]);

  // طبقة خريطة تكتيكية
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 5,
    minZoom: 1,
    noWrap: true,
    bounds: bounds
  }).addTo(gtaMap);

  gtaMap.fitBounds(bounds);
  gtaMap.setView([4096, 4096], 2);

  gtaMap.on('click', function(e) {
    if (!currentUser) {
      alert('يجب تسجيل الدخول أولاً لتحديد موقعك على الخريطة.');
      return;
    }
    const lat = Math.round(e.latlng.lat);
    const lng = Math.round(e.latlng.lng);
    updateMyLocationOnMap(lat, lng);
  });

  renderAllMapMarkers();
  renderHQMarkers();
}

function updateMyLocationOnMap(lat, lng) {
  if (!currentUser) return;

  const userCode = currentUser.publicCode;
  const userName = currentUser.name || ('#' + userCode);
  const status = currentUser.status || 'في الخدمة';

  const locationData = {
    code: userCode,
    name: userName,
    rank: currentUser.rank,
    lat: lat,
    lng: lng,
    status: status,
    updatedAt: new Date().toLocaleTimeString('ar-EG')
  };

  if (typeof ciaSocket !== 'undefined' && ciaSocket && ciaSocket.connected) {
    ciaSocket.emit('map:location:update', locationData);
  }

  mapLocations[userCode] = locationData;
  renderAllMapMarkers();
}

function clearMyMapLocation() {
  if (!currentUser) return;
  const userCode = currentUser.publicCode;

  if (mapLocations[userCode]) {
    delete mapLocations[userCode];

    if (typeof ciaSocket !== 'undefined' && ciaSocket && ciaSocket.connected) {
      ciaSocket.emit('map:location:remove', { code: userCode });
    }

    renderAllMapMarkers();
    alert('تمت إزالة موقعك من الخريطة بنجاح.');
  }
}

function renderAllMapMarkers() {
  if (!gtaMap) return;

  Object.keys(mapMarkers).forEach(code => {
    if (mapMarkers[code]) gtaMap.removeLayer(mapMarkers[code]);
  });
  mapMarkers = {};

  Object.keys(mapLocations).forEach(code => {
    const loc = mapLocations[code];
    if (!loc || loc.lat == null || loc.lng == null) return;

    const isSelf = currentUser && currentUser.publicCode === code;
    const markerColor = isSelf ? '#06b6d4' : (loc.rank === 'CIA CHIEF' ? '#f59e0b' : '#10b981');

    const customIcon = L.divIcon({
      className: 'custom-map-pin',
      html: `<div style="
        background-color: ${markerColor};
        width: 18px;
        height: 18px;
        border-radius: 50%;
        border: 2px solid #fff;
        box-shadow: 0 0 10px ${markerColor};
        display: flex;
        align-items: center;
        justify-content: center;
        color: #000;
        font-size: 10px;
        font-weight: bold;">
        <i class="fa-solid fa-user-secret"></i>
      </div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });

    const marker = L.marker([loc.lat, loc.lng], { icon: customIcon }).addTo(gtaMap);

    const popupContent = `
      <div style="text-align: right; font-family: sans-serif; color: #000; direction: rtl;">
        <strong style="color: #d97706;">#${loc.code} - ${loc.name}</strong><br>
        <small>الرتبة: ${loc.rank}</small><br>
        <small>الحالة: ${loc.status}</small><br>
        <small style="color: #6b7280;">التحديث: ${loc.updatedAt}</small>
      </div>
    `;

    marker.bindPopup(popupContent);
    mapMarkers[code] = marker;
  });
}

function renderHQMarkers() {
  if (!gtaMap) return;

  const defaultHQs = [
    { title: 'مقر CIA الرئيسي (LSIA)', lat: 2100, lng: 3500, icon: 'fa-building-shield', color: '#f59e0b' },
    { title: 'برج الاتصالات والتتبع (FIB Building)', lat: 4200, lng: 4100, icon: 'fa-tower-cell', color: '#06b6d4' },
    { title: 'القاعدة الجوية (Fort Zancudo)', lat: 5500, lng: 2200, icon: 'fa-jet-fighter', color: '#ef4444' }
  ];

  defaultHQs.forEach(hq => {
    const hqIcon = L.divIcon({
      className: 'hq-map-pin',
      html: `<div style="
        background-color: ${hq.color};
        width: 26px;
        height: 26px;
        border-radius: 6px;
        border: 2px solid #fff;
        box-shadow: 0 0 12px ${hq.color};
        display: flex;
        align-items: center;
        justify-content: center;
        color: #000;
        font-size: 14px;">
        <i class="fa-solid ${hq.icon}"></i>
      </div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });

    L.marker([hq.lat, hq.lng], { icon: hqIcon })
      .addTo(gtaMap)
      .bindPopup(`<div style="direction: rtl; text-align: right; color:#000;"><strong>${hq.title}</strong></div>`);
  });
}

document.addEventListener('DOMContentLoaded', function() {
  initGTAMap();
});
