// Free hospital lookup from OpenStreetMap data, run in the browser.
// (These public services block requests from cloud servers such as Supabase,
// so the AI function can't do this step for us.)
// Overpass has the richest data (phone numbers, ER flags, opening hours) but is
// often overloaded, so we ask several mirrors at once. Photon is fast and reliable
// but has fewer details. We use whichever gives a good answer first.

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

function km(lat1, lon1, lat2, lon2) {
  const r = (d) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2
    + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const directionsUrl = (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

function nearestUnique(list, maxKm, limit = 10) {
  const seen = new Set();
  return list
    .filter((h) => {
      const key = h.name.toLowerCase();
      if (h.distance_km > maxKm || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.distance_km - b.distance_km)
    .slice(0, limit);
}

async function overpassMirror(url, lat, lng, signal) {
  const query = `[out:json][timeout:10];
(
  nwr["amenity"~"^(hospital|clinic)$"](around:6000,${lat},${lng});
  nwr["healthcare"~"^(hospital|clinic)$"](around:6000,${lat},${lng});
);
out center tags 60;`;
  const res = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: query }), signal });
  if (!res.ok) throw new Error(`Overpass ${res.status}`);
  const { elements = [] } = await res.json();
  const list = elements.flatMap((el) => {
    const t = el.tags || {};
    const pLat = el.lat ?? el.center?.lat;
    const pLng = el.lon ?? el.center?.lon;
    if (!t.name || pLat == null) return [];
    return [{
      name: t.name,
      type: (t.amenity ?? t.healthcare) === 'clinic' ? 'Clinic' : 'Hospital',
      address: [t['addr:housenumber'], t['addr:street'], t['addr:suburb'], t['addr:city']].filter(Boolean).join(', '),
      phone: t.phone || t['contact:phone'] || t['contact:mobile'] || '',
      hours: t.opening_hours || '',
      has_emergency: t.emergency === 'yes',
      specialties: (t['healthcare:speciality'] || '').split(';').filter(Boolean),
      distance_km: km(lat, lng, pLat, pLng),
      maps_url: directionsUrl(pLat, pLng),
    }];
  });
  if (!list.length) throw new Error('Overpass: no results');
  return nearestUnique(list, 6);
}

async function photon(lat, lng, signal) {
  const d = 0.2; // ~20 km box around the user
  const bbox = [lng - d, lat - d, lng + d, lat + d].join(',');
  const tags = ['amenity:hospital', 'amenity:clinic', 'healthcare:hospital', 'healthcare:clinic']
    .map((t) => `&osm_tag=${t}`).join('');
  const search = async (q) => {
    const res = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lat=${lat}&lon=${lng}&limit=25&bbox=${bbox}${tags}`,
      { signal },
    );
    if (!res.ok) throw new Error(`Photon ${res.status}`);
    const { features = [] } = await res.json();
    return features.flatMap((f) => {
      const p = f.properties || {};
      const [pLng, pLat] = f.geometry?.coordinates || [];
      if (!p.name || pLat == null) return [];
      return [{
        osm_id: p.osm_type && p.osm_id ? `${p.osm_type}${p.osm_id}` : null,
        name: p.name,
        type: p.osm_value === 'clinic' ? 'Clinic' : 'Hospital',
        address: [p.housenumber, p.street, p.district || p.locality, p.city].filter(Boolean).join(', '),
        phone: '', hours: '', has_emergency: false, specialties: [],
        distance_km: km(lat, lng, pLat, pLng),
        maps_url: directionsUrl(pLat, pLng),
      }];
    });
  };
  const results = await Promise.allSettled(['hospital', 'clinic', 'nursing home'].map(search));
  const all = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  if (!all.length) throw new Error('Photon: no results');
  return addOsmDetails(nearestUnique(all, 25), signal);
}

// Photon has no phone numbers, but OpenStreetMap often does. One Nominatim
// lookup by OSM id fills in phone, emergency and opening hours where known.
async function addOsmDetails(list, signal) {
  const ids = list.map((h) => h.osm_id).filter(Boolean);
  if (!ids.length) return list;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/lookup?osm_ids=${ids.join(',')}&extratags=1&format=json`,
      { signal: AbortSignal.any ? AbortSignal.any([signal, AbortSignal.timeout(5000)]) : signal },
    );
    if (!res.ok) return list;
    const details = new Map(
      (await res.json()).map((d) => [`${d.osm_type?.[0]?.toUpperCase()}${d.osm_id}`, d.extratags || {}]),
    );
    return list.map((h) => {
      const t = details.get(h.osm_id);
      if (!t) return h;
      return {
        ...h,
        phone: t.phone || t['contact:phone'] || t['contact:mobile'] || h.phone,
        hours: t.opening_hours || h.hours,
        has_emergency: t.emergency === 'yes' || h.has_emergency,
      };
    });
  } catch {
    return list; // details are a bonus; never fail the search over them
  }
}

// Phone numbers in map data come in many shapes ("033-2555-7656 / 7675",
// "3324980366", "(91-33) 2230-3451"). Turn the first one into something a
// phone can dial. In India, add +91 so landlines work from mobiles too.
// Metros with 8-digit landlines, and their STD codes.
const METRO_STD = [
  { code: '33', lat: 22.5726, lng: 88.3639, radiusKm: 45 }, // Kolkata
  { code: '11', lat: 28.6139, lng: 77.209, radiusKm: 45 },  // Delhi NCR
  { code: '22', lat: 19.076, lng: 72.8777, radiusKm: 45 },  // Mumbai
  { code: '44', lat: 13.0827, lng: 80.2707, radiusKm: 40 }, // Chennai
  { code: '80', lat: 12.9716, lng: 77.5946, radiusKm: 40 }, // Bengaluru
  { code: '40', lat: 17.385, lng: 78.4867, radiusKm: 40 },  // Hyderabad
  { code: '20', lat: 18.5204, lng: 73.8567, radiusKm: 35 }, // Pune
  { code: '79', lat: 23.0225, lng: 72.5714, radiusKm: 35 }, // Ahmedabad
];

export function telHref(raw, { lat, lng } = {}) {
  if (!raw) return null;
  const first = String(raw).split(/[;,/]|or/i)[0];
  let digits = first.replace(/[^\d+]/g, '');
  if (digits.replace(/\D/g, '').length < 6) return null;
  const inIndia = lat >= 6 && lat <= 37.5 && lng >= 68 && lng <= 97.5;
  if (inIndia && !digits.startsWith('+')) {
    digits = digits.replace(/^00/, '');
    if (/^91\d{10}$/.test(digits)) digits = `+${digits}`;
    else if (/^0\d{10}$/.test(digits)) digits = `+91${digits.slice(1)}`;
    else if (/^\d{10}$/.test(digits)) digits = `+91${digits}`;
    else if (/^[2-9]\d{7}$/.test(digits)) {
      // 8-digit landline with no area code: the big metros use 8-digit numbers,
      // so add the code of the metro the user is in (mobiles can't dial without it).
      const metro = METRO_STD.find((m) => km(lat, lng, m.lat, m.lng) <= m.radiusKm);
      if (metro) digits = `+91${metro.code}${digits}`;
    }
  }
  return `tel:${digits}`;
}

// When a place has no listed number, open it on Google Maps, which usually
// shows its phone number with a call button.
export const findNumberUrl = (h) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([h.name, h.address].filter(Boolean).join(', '))}`;

/** Nearby hospitals from OpenStreetMap. Resolves with a list, or throws if every source failed. */
export async function findHospitalsOSM({ lat, lng }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  const photonResult = photon(lat, lng, controller.signal).catch(() => null);
  try {
    // Give Overpass (better data) a short head start, then settle for Photon.
    const overpass = Promise.any(OVERPASS_MIRRORS.map((u) => overpassMirror(u, lat, lng, controller.signal)));
    const quick = await Promise.race([
      overpass.catch(() => null),
      new Promise((resolve) => setTimeout(() => resolve(null), 3000)),
    ]);
    if (quick?.length) return { hospitals: quick, source: 'openstreetmap' };
    const fromPhoton = await photonResult;
    if (fromPhoton?.length) return { hospitals: fromPhoton, source: 'photon' };
    const late = await overpass.catch(() => null);
    if (late?.length) return { hospitals: late, source: 'openstreetmap' };
    throw new Error('No hospital data available right now. In an emergency, call 112 or 108.');
  } finally {
    clearTimeout(timeout);
    controller.abort(); // stop any requests still running
  }
}
