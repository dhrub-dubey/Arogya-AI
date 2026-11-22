import React, { useState, useEffect } from 'react';
import { runAI } from '@/api/ai';
import { findHospitalsOSM, telHref, findNumberUrl } from '@/api/hospitals';
import { motion } from 'framer-motion';
import { MapPin, Phone, Clock, Navigation, Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import GlassCard from '@/components/ui/GlassCard';
import { useLang } from '@/lib/LanguageContext';

// The list is kept for this browser tab's session: switching pages and coming back
// shows it instantly. It refreshes on the ↻ button, when location is turned off,
// when you've moved more than MOVED_KM, or after the tab/browser is closed.
const CACHE_KEY = 'arogya_hospitals_v1';
const MOVED_KM = 1;

function readCache() {
  try {
    return JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
  } catch {
    return null;
  }
}
function writeCache(value) {
  try {
    if (value) sessionStorage.setItem(CACHE_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(CACHE_KEY);
  } catch { /* storage full or blocked: just skip caching */ }
}
function distanceKm(a, b) {
  const r = (d) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2
    + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export default function NearbyHospitals() {
  const { t } = useLang();
  const [cached] = useState(readCache);
  const [location, setLocation] = useState(cached?.location ?? null);
  const [locationError, setLocationError] = useState(null);
  const [hospitals, setHospitals] = useState(cached?.hospitals ?? []);
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isFindingPhones, setIsFindingPhones] = useState(false);

  // Remember the list (including phone numbers found later) for this session.
  useEffect(() => {
    if (location && hospitals.length) writeCache({ location, hospitals });
  }, [location, hospitals]);

  // force = true: always search again (refresh button / Try again).
  // force = false: keep the saved list unless location is off or we've moved.
  const getLocation = (force = true) => {
    const quiet = !force && hospitals.length > 0; // no spinner when we already have a list
    if (!quiet) setIsLocating(true);
    setLocationError(null);
    if (!navigator.geolocation) {
      writeCache(null);
      setHospitals([]);
      setLocationError('Geolocation is not supported by your browser.');
      setIsLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setIsLocating(false);
        const saved = readCache();
        const stillHere = saved?.location && saved.hospitals?.length && distanceKm(saved.location, coords) < MOVED_KM;
        if (!force && stillHere) {
          // Same area: keep the list. Fill in any phone numbers that were still being
          // looked up when the user left the page (served from the shared cache).
          if (saved.hospitals.some((h) => !h.phone)) fillMissingPhones(saved.hospitals);
          return;
        }
        setLocation(coords);
        fetchNearbyHospitals(coords);
      },
      () => {
        // Location is off or blocked: the old list may no longer be near the user.
        writeCache(null);
        setHospitals([]);
        setLocationError('Unable to get your location. Please allow location access and try again.');
        setIsLocating(false);
      },
      { timeout: 10000, enableHighAccuracy: true, maximumAge: 120000 } // reuse a fix from the last 2 minutes
    );
  };

  const fetchNearbyHospitals = async (coords) => {
    setIsSearching(true);
    setLocationError(null);
    let list = [];
    try {
      // Free OpenStreetMap data: real places, shown straight away.
      ({ hospitals: list } = await findHospitalsOSM(coords));
      setHospitals(list);
      if (!list.length) setLocationError('No hospitals found near you. Try again in a moment.');
    } catch (err) {
      setLocationError(err.message || 'Could not load nearby hospitals.');
    } finally {
      setIsSearching(false);
    }
    fillMissingPhones(list);
  };

  // Many places have no number in the map data. Ask the AI to look them up on the
  // web (it only returns numbers it found on a real page) and fill them in.
  const fillMissingPhones = async (list) => {
    const missing = list
      .map((h, index) => ({ h, index }))
      .filter(({ h }) => !h.phone)
      .slice(0, 8); // cached numbers come back instantly; new ones are searched 6 at a time
    if (!missing.length) return;
    setIsFindingPhones(true);
    try {
      const area = [...new Set(list.map((h) => h.address?.split(',').slice(-2).join(',').trim()).filter(Boolean))][0] || '';
      const { results = [] } = await runAI('hospital_phones', {
        area,
        hospitals: missing.map(({ h }) => ({ name: h.name, address: h.address })),
      });
      if (!results.length) return;
      setHospitals((current) => current.map((h) => {
        const pos = missing.findIndex((m) => m.h.name === h.name);
        const found = results.find((r) => r.index === pos);
        return found ? { ...h, phone: found.phone, phone_source: found.source } : h;
      }));
    } catch (err) {
      console.warn('Could not look up phone numbers:', err.message);
    } finally {
      setIsFindingPhones(false);
    }
  };

  useEffect(() => {
    getLocation(false); // reuse this session's list if we're still in the same place
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="p-4 space-y-5 pb-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <MapPin className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="font-heading font-bold text-xl">{t('nearbyHospitalsTitle')}</h2>
              <p className="text-sm text-muted-foreground">{t('nearbyHospitalsSubtitle')}</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="icon"
            className="rounded-xl"
            onClick={() => getLocation(true)}
            aria-label="Refresh"
            disabled={isLocating || isSearching}
          >
            <RefreshCw className={`h-4 w-4 ${(isLocating || isSearching) ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </motion.div>

      {/* Location status card */}
      <GlassCard delay={0.05}>
        {locationError ? (
          <div className="flex items-center gap-3 py-2">
            <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-destructive">{locationError}</p>
              <Button variant="link" className="p-0 h-auto text-xs" onClick={() => getLocation(true)}>Try again</Button>
            </div>
          </div>
        ) : isLocating ? (
          <div className="flex items-center gap-3 py-2">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">{t('gettingLocation')}</p>
          </div>
        ) : location ? (
          <div className="flex items-center gap-3 py-2">
            <div className="h-9 w-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <MapPin className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-sm font-medium">{t('locationDetected')}</p>
              <p className="text-xs text-muted-foreground">{location.lat.toFixed(5)}, {location.lng.toFixed(5)}</p>
            </div>
            {(isSearching || isFindingPhones) && (
              <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                {isSearching ? 'Searching...' : 'Finding phone numbers...'}
              </div>
            )}
          </div>
        ) : null}
      </GlassCard>

      {/* Hospital results */}
      {isSearching && hospitals.length === 0 && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="glass-card rounded-2xl p-4 animate-pulse">
              <div className="h-4 bg-muted rounded w-3/4 mb-2" />
              <div className="h-3 bg-muted rounded w-1/2" />
            </div>
          ))}
        </div>
      )}

      {hospitals.length > 0 && (
        <div className="space-y-3">
          {[...hospitals]
            .sort((a, b) => a.distance_km - b.distance_km)
            .map((h, i) => (
              <GlassCard key={i} delay={i * 0.05}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm">{h.name}</p>
                      {h.has_emergency && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 font-semibold flex-shrink-0">{t('er')}</span>
                      )}
                    </div>
                    {h.type && <p className="text-xs text-primary mt-0.5">{h.type}</p>}
                    {h.address && <p className="text-xs text-muted-foreground mt-1 truncate">{h.address}</p>}
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <Navigation className="h-3 w-3 flex-shrink-0" />
                        {typeof h.distance_km === 'number' ? `${h.distance_km.toFixed(1)} km` : ''}
                      </span>
                      {h.hours && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3 flex-shrink-0" />
                          {h.hours}
                        </span>
                      )}
                    </div>
                    {h.specialties?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {h.specialties.slice(0, 3).map((s, j) => (
                          <span key={j} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{s}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    {telHref(h.phone, location) ? (
                      <Button asChild size="sm" className="rounded-xl gap-1 bg-emerald-600 hover:bg-emerald-700 text-white">
                        <a href={telHref(h.phone, location)}>
                          <Phone className="h-3.5 w-3.5" />
                          {t('callBtn')}
                        </a>
                      </Button>
                    ) : (
                      <Button asChild variant="outline" size="sm" className="rounded-xl gap-1">
                        <a href={findNumberUrl(h)} target="_blank" rel="noopener noreferrer" title="Opens this place on Google Maps, where its phone number is usually listed">
                          <Phone className="h-3.5 w-3.5" />
                          {t('getNumberBtn')}
                        </a>
                      </Button>
                    )}
                    {h.maps_url && (
                      <Button asChild variant="ghost" size="sm" className="rounded-xl gap-1">
                        <a href={h.maps_url} target="_blank" rel="noopener noreferrer">
                          <Navigation className="h-3.5 w-3.5" />
                          {t('directionsBtn')}
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              </GlassCard>
            ))}
        </div>
      )}
    </div>
  );
}