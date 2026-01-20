import { useEffect, useMemo, useState, useCallback } from 'react';
import { Paper } from '@mui/material';
import { MapContainer, TileLayer, useMap, Polyline, CircleMarker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './MapView.css';
import type { Device, Location } from '../types';
import { API_URL } from '../services/api';
import SpeedRounded from '@mui/icons-material/SpeedRounded';
import SatelliteAltRounded from '@mui/icons-material/SatelliteAltRounded';
import BatteryChargingFullRounded from '@mui/icons-material/BatteryChargingFullRounded';
import Battery0BarRounded from '@mui/icons-material/Battery0BarRounded';
import Battery2BarRounded from '@mui/icons-material/Battery2BarRounded';
import Battery4BarRounded from '@mui/icons-material/Battery4BarRounded';
import Battery6BarRounded from '@mui/icons-material/Battery6BarRounded';
import BatteryFullRounded from '@mui/icons-material/BatteryFullRounded';

const DEFAULT_COORDINATES: [number, number] = [106.816666, -6.2]; // Jakarta as default center

interface MapViewProps {
  device?: Device | null;
  devices?: Device[];
  locations: Location[];
  height?: number | string;
  bare?: boolean;
  latestOnly?: boolean;
  showAllDevices?: boolean;
  autoFit?: boolean;
  onMapReady?: (map: L.Map) => void;
  from?: Date | string | null;
  to?: Date | string | null;
  statsLatest?: any | null;
  forceTick?: number;
  activeId?: string;
  allowCacheLatest?: boolean;
  geofence?: any | null;
}

const PersistView: React.FC<{ onReady?: (map: L.Map) => void }> = ({ onReady }) => {
  const map = useMap();
  useEffect(() => {
    // Emit map instance once on mount
    if (onReady) onReady(map);

    const save = () => {
      const center = map.getCenter();
      const zoom = map.getZoom();
      try {
        localStorage.setItem('mapView', JSON.stringify({ center: [center.lat, center.lng], zoom }));
      } catch {}
    };
    map.on('moveend', save);
    map.on('zoomend', save);
    return () => {
      map.off('moveend', save);
      map.off('zoomend', save);
    };
  }, [map, onReady]);
  return null;
};

const MapView: React.FC<MapViewProps> = ({ device, devices, locations, height = 420, bare = false, latestOnly = true, showAllDevices = false, autoFit = false, onMapReady, from, to, statsLatest = null, forceTick, activeId, allowCacheLatest = false, geofence = null }) => {
  // Load persisted view
  const persisted = useMemo(() => {
    try {
      const raw = localStorage.getItem('mapView');
      if (!raw) return null;
      return JSON.parse(raw) as { center: [number, number]; zoom: number };
    } catch {
      return null;
    }
  }, []);
  // Helpers for coordinate validation and normalization (auto-swap if obviously reversed)
  const isValid = (lat: number, lng: number) => isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
  // Optional in-bounds guard for Indonesia region to avoid sea/outlier points during fallback
  const isInBoundsID = (lat: number, lng: number) => lat >= -11 && lat <= 6.5 && lng >= 95 && lng <= 141;
  const haversineMeters = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };
  const normalize = useCallback((lng: number, lat: number): [number, number] | null => {
    if (isValid(lat, lng)) return [lng, lat];
    // try swap if likely given as [lat,lng]
    if (isValid(lng, lat)) return [lat, lng];
    return null;
  }, []);

  const shortAddress = useCallback((addr: string) => {
    const parts = addr
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);

    const stop = new Set([
      'Indonesia',
      'Jawa',
      'Jawa Barat',
      'Jawa Tengah',
      'Jawa Timur',
      'Daerah Khusus Ibukota Jakarta',
      'DKI Jakarta',
    ]);

    const head: string[] = [];
    for (const p of parts) {
      if (stop.has(p)) break;
      if (/^\d{5}$/.test(p)) break; // postal code
      head.push(p);
      if (head.length >= 4) break;
    }

    return head.length > 0 ? head.join(', ') : addr;
  }, []);

  // Reverse geocoding state: cache human-readable addresses by rounded coordinates
  const [addressCache, setAddressCache] = useState<Record<string, string>>({});
  const [addressLoading, setAddressLoading] = useState<Record<string, boolean>>({});

  const addressKeyFor = useCallback((lat: number, lng: number) => {
    // Round to ~5 decimal places (~1m precision) to avoid too many unique keys
    return `${lat.toFixed(5)},${lng.toFixed(5)}`;
  }, []);

  const ensureAddress = useCallback(
    (lat: number, lng: number) => {
      const key = addressKeyFor(lat, lng);
      if (addressCache[key] || addressLoading[key]) return;

      setAddressLoading((prev) => ({ ...prev, [key]: true }));

      const base = (API_URL || '').replace(/\/+$/, '');
      const url = `${base}/reverse-geocode?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`;

      fetch(url, {
        headers: {
          Accept: 'application/json',
        },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data || !data.success) return;
          const display = typeof data.address === 'string' && data.address.trim().length > 0
            ? data.address.trim()
            : 'Alamat tidak tersedia';
          setAddressCache((prev) => ({ ...prev, [key]: display }));
        })
        .catch(() => {
          // swallow network/parse errors; we simply won't show an address
        })
        .finally(() => {
          setAddressLoading((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
        });
    },
    [addressCache, addressKeyFor, addressLoading],
  );
  const pointInPolygon = useCallback((lng: number, lat: number, fence: any | null): boolean => {
    if (!fence) return true; // treat as inside if no geofence
    try {
      const polyRings: number[][][] = (() => {
        if (fence.type === 'Polygon' && Array.isArray(fence.coordinates)) return fence.coordinates as number[][][];
        if (fence.type === 'MultiPolygon' && Array.isArray(fence.coordinates)) {
          // flatten first polygon ring set
          return (fence.coordinates as number[][][][])[0] as unknown as number[][][];
        }
        if (Array.isArray(fence?.geometry?.coordinates)) return fence.geometry.coordinates as number[][][];
        return [] as number[][][];
      })();
      if (!polyRings.length) return true;
      // Use only outer ring for inclusion test
      const ring = polyRings[0] as number[][];
      // Ray casting algorithm
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        const intersect = ((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi + 1e-12) + xi);
        if (intersect) inside = !inside;
      }
      return inside;
    } catch {
      return true;
    }
  }, []);
  const colorFor = useCallback((lng: number, lat: number, active: boolean): string => {
    if (!active) return '#dc2626'; // red for inactive
    const inside = pointInPolygon(lng, lat, geofence);
    return inside ? '#16a34a' : '#eab308'; // green inside, yellow outside
  }, [geofence, pointInPolygon]);
  // Determine latest location only
  const latest = useMemo(() => {
    // 1) Gather candidates from all available server sources and choose the one with max timestamp
    const pickTs = (v: any): number => {
      const raw = v?.timestamp;
      const t = raw ? new Date(raw).getTime() : Number.NEGATIVE_INFINITY;
      return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
    };

    const candidates: Array<{ src: string; loc: Location; ts: number }> = [];

    if (locations && locations.length > 0) {
      for (const l of locations) {
        const coords = l.location?.coordinates as [number, number] | undefined;
        if (!coords || coords.length < 2) continue;
        const [lng, lat] = coords;
        const n = normalize(lng, lat);
        if (!n) continue;
        const ts = pickTs(l as any);
        candidates.push({ src: 'locations', loc: { ...l, location: { type: 'Point', coordinates: n } } as Location, ts });
      }
    }

    if (statsLatest && statsLatest.location && Array.isArray(statsLatest.location.coordinates)) {
      const [lng, lat] = (statsLatest.location.coordinates as [number, number]);
      const n = normalize(lng, lat);
      if (n) {
        const loc = {
          _id: 'stats-latest',
          device: (device as any)?.id || (device as any)?._id || (device as any)?.deviceId,
          location: { type: 'Point', coordinates: n },
          timestamp: (statsLatest as any).timestamp || (device as any)?.lastSeen,
        } as unknown as Location;
        candidates.push({ src: 'statsLatest', loc, ts: pickTs(loc as any) });
      }
    }

    if (device?.currentLocation?.coordinates) {
      const [lng, lat] = (device.currentLocation.coordinates as [number, number]);
      const n = normalize(lng, lat);
      if (n) {
        const loc = {
          _id: 'current',
          device: (device as any).id || (device as any)._id || device?.deviceId,
          location: { type: 'Point', coordinates: n },
          timestamp: (device as any).currentLocation?.timestamp || (device as any).lastSeen,
        } as unknown as Location;
        candidates.push({ src: 'currentLocation', loc, ts: pickTs(loc as any) });
      }
    }

    if (candidates.length > 0) {
      const best = candidates.reduce((a, b) => (b.ts > a.ts ? b : a));
      console.debug('[MapView] latest source =', best.src);
      return best.loc;
    }
    // 4) Fallback to localStorage cached lastPoint per device (optional)
    if (allowCacheLatest) try {
      const devKey = (device as any)?.deviceId || (device as any)?.id || (device as any)?._id;
      if (devKey) {
        const raw = localStorage.getItem(`lastPoint:${devKey}`);
        if (raw) {
          const cached = JSON.parse(raw) as { lat: number; lng: number; timestamp?: string; speed?: number; accuracy?: number; satellites?: number; battery?: { level?: number; isCharging?: boolean } };
          const { lat, lng } = cached;
          const n = normalize(lng, lat);
          // If we have a better reference (statsLatest/currentLocation), ensure cache is not far away (>5km)
          let withinProximity = true;
          try {
            const ref = (() => {
              if (statsLatest?.location?.coordinates) return statsLatest.location.coordinates as [number, number];
              if (device?.currentLocation?.coordinates) return device.currentLocation.coordinates as [number, number];
              return null;
            })();
            if (ref && Array.isArray(ref) && ref.length >= 2) {
              const [refLng, refLat] = ref;
              if (isFinite(refLat) && isFinite(refLng)) {
                withinProximity = haversineMeters(lat, lng, refLat, refLng) <= 5000;
              }
            }
          } catch {}
          if (n && isInBoundsID(lat, lng) && withinProximity) {
            console.debug('[MapView] latest source = cache');
            return {
              _id: 'cached-last',
              device: devKey,
              location: { type: 'Point', coordinates: n },
              timestamp: cached.timestamp || new Date().toISOString(),
              speed: cached.speed,
              accuracy: cached.accuracy,
              satellites: cached.satellites,
              battery: cached.battery,
            } as unknown as Location;
          }
        }
      }
    } catch {}
    return null;
  }, [locations, device, statsLatest, allowCacheLatest, normalize]);

  // Persist latest to localStorage as lastPoint for the device to avoid marker flicker on inactive devices
  useEffect(() => {
    try {
      const devKey = (device as any)?.deviceId || (device as any)?.id || (device as any)?._id;
      if (!devKey || !latest) return;
      const [lng, lat] = (latest.location.coordinates as [number, number]);
      if (!(isFinite(lat) && isFinite(lng))) return;
      const payload: any = {
        lat,
        lng,
        timestamp: (latest as any).timestamp || new Date().toISOString(),
      };
      if ((latest as any).speed != null) payload.speed = (latest as any).speed;
      if ((latest as any).accuracy != null) payload.accuracy = (latest as any).accuracy;
      if ((latest as any).satellites != null) payload.satellites = (latest as any).satellites;
      if ((latest as any).battery != null) payload.battery = (latest as any).battery;
      localStorage.setItem(`lastPoint:${devKey}`, JSON.stringify(payload));
    } catch {}
  }, [latest, device]);

  // Keep last non-null latest to prevent marker disappearing during loading
  const [stickyLatest, setStickyLatest] = useState<Location | null>(null);
  useEffect(() => {
    if (latest) setStickyLatest(latest);
  }, [latest]);

  // Realtime: if device.currentLocation updates (via WebSocket), promote it immediately
  useEffect(() => {
    if (!device?.currentLocation?.coordinates) return;
    const [lng, lat] = device.currentLocation.coordinates as [number, number];
    const n = normalize(lng, lat);
    if (!n) return;
    const currTs = (() => {
      const raw = (device as any).currentLocation?.timestamp || (device as any).lastSeen;
      const t = raw ? new Date(raw).getTime() : NaN;
      return Number.isFinite(t) ? t : NaN;
    })();
    if (!Number.isFinite(currTs)) return;
    const candidate = {
      _id: 'ws-current',
      device: (device as any).id || (device as any)._id || (device as any).deviceId,
      location: { type: 'Point', coordinates: n },
      timestamp: (device as any).currentLocation?.timestamp || (device as any).lastSeen,
      speed: (device as any).currentLocation?.speed,
      accuracy: (device as any).currentLocation?.accuracy,
      satellites: (device as any).currentLocation?.satellites,
      battery: (device as any).currentLocation?.battery,
    } as unknown as Location;
    const stickyTs = stickyLatest ? new Date((stickyLatest as any).timestamp).getTime() : Number.NEGATIVE_INFINITY;
    const latestTs = latest ? new Date((latest as any).timestamp).getTime() : Number.NEGATIVE_INFINITY;
    const maxTs = Math.max(stickyTs, latestTs);
    // If coordinates changed noticeably (>2m), promote regardless of timestamp skew
    const bestLoc = (stickyLatest || latest) as Location | null;
    const moved = (() => {
      if (!bestLoc) return true;
      const [bestLng, bestLat] = (bestLoc.location.coordinates as [number, number]);
      const dist = haversineMeters(bestLat, bestLng, n[1], n[0]);
      return dist > 2; // meters
    })();
    if (moved || currTs >= maxTs) {
      try { console.debug('[MapView] promote live currentLocation', { moved, currTs, maxTs, n }); } catch {}
      setStickyLatest(candidate);
    } else {
      try { console.debug('[MapView] skip promote (older/not moved)', { moved, currTs, maxTs }); } catch {}
    }
  }, [device?.currentLocation, device, normalize, stickyLatest, latest]);

  // Force latest marker immediately when requested (on device click)
  useEffect(() => {
    if (forceTick == null || !activeId) return;
    // Try to pick best available now without waiting: compute candidates and pick newest by timestamp
    type Cand = { src: string; loc: Location; ts: number };
    const pickTs = (v: any): number => {
      const raw = v?.timestamp;
      const t = raw ? new Date(raw).getTime() : Number.NEGATIVE_INFINITY;
      return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
    };
    const cands: Cand[] = [];
    if (latest) cands.push({ src: 'latest', loc: latest, ts: pickTs(latest as any) });
    if (statsLatest?.location?.coordinates) {
      const [lng, lat] = statsLatest.location.coordinates as [number, number];
      const n = normalize(lng, lat);
      if (n) {
        const loc = {
          _id: 'forced-stats',
          device: (device as any)?.id || (device as any)?._id || (device as any)?.deviceId,
          location: { type: 'Point', coordinates: n },
          timestamp: (statsLatest as any).timestamp || (device as any)?.lastSeen,
        } as unknown as Location;
        cands.push({ src: 'statsLatest', loc, ts: pickTs(loc as any) });
      }
    }
    if (device?.currentLocation?.coordinates) {
      const [lng, lat] = device.currentLocation.coordinates as [number, number];
      const n = normalize(lng, lat);
      if (n) {
        const loc = {
          _id: 'forced-current',
          device: (device as any).id || (device as any)._id || device?.deviceId,
          location: { type: 'Point', coordinates: n },
          timestamp: (device as any).currentLocation?.timestamp || (device as any).lastSeen,
        } as unknown as Location;
        cands.push({ src: 'currentLocation', loc, ts: pickTs(loc as any) });
      }
    }
    // Consider cache if it's allowed OR if it is strictly newer than any server source and passes proximity/bounds
    try {
      const devKey = activeId || (device as any)?.deviceId || (device as any)?.id || (device as any)?._id;
      const raw = devKey ? localStorage.getItem(`lastPoint:${devKey}`) : null;
      if (raw) {
        const cached = JSON.parse(raw) as { lat: number; lng: number; timestamp?: string };
        const n = normalize(cached.lng, cached.lat);
        let withinProximity = true;
        try {
          const ref = (() => {
            if (statsLatest?.location?.coordinates) return statsLatest.location.coordinates as [number, number];
            if (device?.currentLocation?.coordinates) return device.currentLocation.coordinates as [number, number];
            return null;
          })();
          if (ref && Array.isArray(ref) && ref.length >= 2) {
            const [refLng, refLat] = ref;
            if (isFinite(refLat) && isFinite(refLng)) {
              withinProximity = haversineMeters(cached.lat, cached.lng, refLat, refLng) <= 5000;
            }
          }
        } catch {}
        const cacheLoc = n && isInBoundsID(cached.lat, cached.lng) && withinProximity ? ({
          _id: 'forced-cache',
          device: devKey!,
          location: { type: 'Point', coordinates: n },
          timestamp: cached.timestamp,
        } as unknown as Location) : null;
        if (cacheLoc) {
          const cacheTs = pickTs(cacheLoc as any);
          const maxServerTs = cands.reduce((mx, c) => Math.max(mx, c.ts), Number.NEGATIVE_INFINITY);
          if (allowCacheLatest || cacheTs > maxServerTs) {
            cands.push({ src: 'cache', loc: cacheLoc, ts: cacheTs });
          }
        }
      }
    } catch {}

    if (cands.length > 0) {
      const best = cands.reduce((a, b) => (b.ts > a.ts ? b : a));
      setStickyLatest(best.loc);
    } else {
      const hasServer = (locations && locations.length > 0) || (statsLatest && statsLatest.location) || !!device?.currentLocation?.coordinates;
      if (!hasServer) setStickyLatest(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceTick, activeId, allowCacheLatest]);

  // When switching device, clear sticky first; optionally seed from cache
  useEffect(() => {
    try {
      // clear any previous device's sticky
      setStickyLatest(null);
      const devKey = activeId || (device as any)?.deviceId || (device as any)?.id || (device as any)?._id;
      if (!devKey) return;
      if (!allowCacheLatest) return; // do not seed from cache if disabled
      const raw = localStorage.getItem(`lastPoint:${devKey}`);
      if (!raw) return;
      const cached = JSON.parse(raw) as { lat: number; lng: number; timestamp?: string };
      const { lat, lng } = cached;
      if (!(isFinite(lat) && isFinite(lng)) || !isInBoundsID(lat, lng)) return;
      setStickyLatest({
        _id: 'cached-last-init',
        device: devKey,
        location: { type: 'Point', coordinates: [lng, lat] },
        timestamp: cached.timestamp || new Date().toISOString(),
      } as unknown as Location);
    } catch {}
  }, [device, activeId, allowCacheLatest]);

  // When all sources are empty (no locations, no statsLatest, no currentLocation), ensure marker is cleared
  useEffect(() => {
    const hasServer = (locations && locations.length > 0) || (statsLatest && statsLatest.location) || !!device?.currentLocation?.coordinates;
    if (!hasServer) setStickyLatest(null);
  }, [locations, statsLatest, device]);

  // We intentionally do not auto-fit or auto-pan on new points to preserve user's view.

  // Default Leaflet marker icons fix for bundlers
  useEffect(() => {
    // @ts-ignore - private property in leaflet typings
    delete (L.Icon.Default as any).prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });
  }, []);

  const mapEl = (
    <MapContainer
      center={persisted?.center ? [persisted.center[0], persisted.center[1]] : [DEFAULT_COORDINATES[1], DEFAULT_COORDINATES[0]]}
      zoom={persisted?.zoom ?? 11}
      style={{ height: typeof height === 'number' ? `${height}px` : (height as string), width: '100%' }}
    >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <PersistView onReady={onMapReady} />
        {latestOnly ? (
          showAllDevices && devices && devices.length > 0 ? (
            <>
              {devices.map((d) => {
                const coords = (d as any)?.currentLocation?.coordinates as [number, number] | undefined;
                if (!coords) return null;
                const [lngRaw, latRaw] = coords;
                const n = normalize(lngRaw, latRaw);
                if (!n) return null;
                const [lng, lat] = n;
                if (!isInBoundsID(lat, lng)) return null;
                const online = !!d.isActive;
                const color = colorFor(lng, lat, online);
                const speed = online ? (d as any)?.currentLocation?.speed : undefined;
                const sats = online ? (d as any)?.currentLocation?.satellites : undefined;
                const batteryObj = online ? (d as any)?.currentLocation?.battery : undefined;
                const level = typeof batteryObj?.level === 'number' ? Math.round(batteryObj.level) : null;
                const charging = !!batteryObj?.isCharging;
                const batteryStr = online && level != null ? `${level}%${charging ? ' (charging)' : ''}` : '-';
                const batteryColor = level == null ? 'text.secondary' : level < 20 ? 'error.main' : level < 50 ? 'warning.main' : 'success.main';
                const addrKey = addressKeyFor(lat, lng);
                const addr = addressCache[addrKey];
                const addrBusy = addressLoading[addrKey];
                const BatteryIcon = (() => {
                  if (charging) return BatteryChargingFullRounded;
                  if (level == null) return Battery4BarRounded;
                  if (level < 5) return Battery0BarRounded;
                  if (level < 25) return Battery2BarRounded;
                  if (level < 60) return Battery4BarRounded;
                  if (level < 85) return Battery6BarRounded;
                  return BatteryFullRounded;
                })();
                return (
                  <CircleMarker
                    key={(d as any)._id || d.deviceId || d.name}
                    center={[lat, lng]}
                    radius={8}
                    pathOptions={{ color: '#000000', weight: 2, fillColor: color, fillOpacity: 1 }}
                    eventHandlers={{
                      mouseover: () => ensureAddress(lat, lng),
                    }}
                  >
                    <Tooltip className="glass-tooltip" direction="top" offset={[0, -8]} opacity={1} sticky>
                      <div style={{
                        padding: 8,
                        borderRadius: 12,
                        background: 'rgba(255,255,255,0.16)',
                        border: '1px solid rgba(255,255,255,0.25)',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                        color: '#0f172a',
                        backdropFilter: 'blur(8px)',
                        WebkitBackdropFilter: 'blur(8px)'
                      }}>
                        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{(d?.name || 'Device')} · {(d as any)?.deviceId || (d as any)?._id}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><SpeedRounded sx={{ fontSize: 16 }} />{typeof speed === 'number' ? `${speed.toFixed(1)} km/h` : '-'}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><SatelliteAltRounded sx={{ fontSize: 16 }} />{typeof sats === 'number' ? sats : '-'}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <BatteryIcon sx={{ fontSize: 16, color: batteryColor }} />
                            <span>{batteryStr}</span>
                          </div>
                        </div>
                        <div style={{ marginTop: 4, fontFamily: 'monospace' }}>{lat.toFixed(6)}, {lng.toFixed(6)}</div>
                        {addr && (
                          <div className="map-tooltip-address" title={addr} style={{ marginTop: 4, fontSize: 11, lineHeight: 1.4 }}>{shortAddress(addr)}</div>
                        )}
                        {!addr && addrBusy && (
                          <div style={{ marginTop: 4, fontSize: 11, lineHeight: 1.4 }}>Mengambil alamat…</div>
                        )}
                      </div>
                    </Tooltip>
                  </CircleMarker>
                );
              })}
            </>
          ) : (
          (activeId && (stickyLatest || latest)) && (() => {
            const effective = (stickyLatest || latest) as Location;
            const [lng, lat] = effective.location.coordinates as [number, number];
            const online = !!device?.isActive;
            const color = colorFor(lng, lat, online);
            const speed = (effective as any).speed ?? (device as any)?.currentLocation?.speed;
            const sats = (effective as any).satellites ?? (device as any)?.currentLocation?.satellites;
            const batteryObj = (effective as any).battery ?? (device as any)?.currentLocation?.battery;
            const level = typeof batteryObj?.level === 'number' ? Math.round(batteryObj.level) : null;
            const charging = !!batteryObj?.isCharging;
            const batteryStr = level != null ? `${level}%${charging ? ' (charging)' : ''}` : '-';
            const batteryColor = level == null ? 'text.secondary' : level < 20 ? 'error.main' : level < 50 ? 'warning.main' : 'success.main';
            const addrKey = addressKeyFor(lat, lng);
            const addr = addressCache[addrKey];
            const addrBusy = addressLoading[addrKey];
            const BatteryIcon = (() => {
              if (charging) return BatteryChargingFullRounded;
              if (level == null) return Battery4BarRounded;
              if (level < 5) return Battery0BarRounded;
              if (level < 25) return Battery2BarRounded;
              if (level < 60) return Battery4BarRounded;
              if (level < 85) return Battery6BarRounded;
              return BatteryFullRounded;
            })();
            return (
              <CircleMarker
                center={[lat, lng]}
                radius={8}
                pathOptions={{ color: '#000000', weight: 2, fillColor: color, fillOpacity: 1 }}
                eventHandlers={{
                  mouseover: () => ensureAddress(lat, lng),
                }}
              >
                <Tooltip className="glass-tooltip" direction="top" offset={[0, -8]} opacity={1} sticky>
                  <div style={{
                    padding: 8,
                    borderRadius: 12,
                    background: 'rgba(255,255,255,0.16)',
                    border: '1px solid rgba(255,255,255,0.25)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                    color: '#0f172a',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)'
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{device?.name || 'Device'}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><SpeedRounded sx={{ fontSize: 16 }} />{typeof speed === 'number' ? `${speed.toFixed(1)} km/h` : '-'}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><SatelliteAltRounded sx={{ fontSize: 16 }} />{typeof sats === 'number' ? sats : '-'}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <BatteryIcon sx={{ fontSize: 16, color: batteryColor }} />
                      <span style={{ color: typeof batteryColor === 'string' ? undefined : undefined }}>{batteryStr}</span>
                    </div>
                  </div>
                  <div style={{ marginTop: 4, fontFamily: 'monospace' }}>{lat.toFixed(6)}, {lng.toFixed(6)}</div>
                  {addr && (
                    <div className="map-tooltip-address" title={addr} style={{ marginTop: 4, fontSize: 11, lineHeight: 1.4 }}>{shortAddress(addr)}</div>
                  )}
                  {!addr && addrBusy && (
                    <div style={{ marginTop: 4, fontSize: 11, lineHeight: 1.4 }}>Mengambil alamat…</div>
                  )}
                  </div>
                </Tooltip>
              </CircleMarker>
            );
          })()
          )
        ) : (
          (() => {
            // Apply time range filtering if provided
            const fromTs = from ? new Date(from as any).getTime() : Number.NEGATIVE_INFINITY;
            const toTs = to ? new Date(to as any).getTime() : Number.POSITIVE_INFINITY;
            const effective = (stickyLatest || latest) as Location | null;
            const filtered = (locations && locations.length > 0 ? locations : (effective ? [effective] : []))
              .filter((l) => {
                const t = new Date((l as any).timestamp ?? Date.now()).getTime();
                return t >= fromTs && t <= toTs;
              })
              .sort((a, b) => new Date((a as any).timestamp ?? Date.now()).getTime() - new Date((b as any).timestamp ?? Date.now()).getTime());

            type Visit = { start: Date; end: Date; centerLat: number; centerLng: number; count: number };
            const RADIUS_ENTER_M = 25;
            const RADIUS_EXIT_M = 35;
            const MIN_DURATION_MS = 30 * 1000;
            const MIN_POINTS = 1;
            const visits: Visit[] = [];
            let centerLat = 0, centerLng = 0, count = 0;
            let start: Date | null = null, end: Date | null = null;
            const flush = () => {
              if (start && end && count > 0) {
                const duration = end.getTime() - start.getTime();
                if (duration >= MIN_DURATION_MS || count >= MIN_POINTS) visits.push({ start, end, centerLat, centerLng, count });
              }
            };
            for (const l of filtered) {
              const [lng, lat] = l.location.coordinates as [number, number];
              const t = new Date((l as any).timestamp ?? Date.now());
              if (count === 0) {
                centerLat = lat; centerLng = lng; count = 1; start = t; end = t; continue;
              }
              const dist = haversineMeters(centerLat, centerLng, lat, lng);
              if (dist <= RADIUS_ENTER_M) {
                centerLat = (centerLat * count + lat) / (count + 1);
                centerLng = (centerLng * count + lng) / (count + 1);
                count += 1; end = t;
              } else if (dist > RADIUS_EXIT_M) {
                flush();
                centerLat = lat; centerLng = lng; count = 1; start = t; end = t;
              } else {
                count += 1; end = t;
              }
            }
            flush();

            try {
              // eslint-disable-next-line no-console
              console.debug('[MapView] history mode:', { points: filtered.length, visits: visits.length });
            } catch {}

            const fmt = (d: Date) => d.toLocaleString();
            const dur = (ms: number) => {
              const s = Math.max(0, Math.floor(ms / 1000));
              const h = Math.floor(s / 3600);
              const m = Math.floor((s % 3600) / 60);
              const ss = s % 60;
              if (h > 0) return `${h}h ${m}m ${ss}s`;
              if (m > 0) return `${m}m ${ss}s`;
              return `${ss}s`;
            };

            return (
              <>
                {!visits.length && filtered.length >= 1 && (() => {
                  const last = filtered[filtered.length - 1];
                  const [lng, lat] = last.location.coordinates as [number, number];
                  return (
                    <CircleMarker center={[lat, lng]} radius={8} pathOptions={{ color: '#000000', weight: 2, fillColor: '#2563eb', fillOpacity: 1 }}>
                      <Tooltip className="glass-tooltip" direction="top" offset={[0, -8]} opacity={1} sticky>
                        Point
                      </Tooltip>
                    </CircleMarker>
                  );
                })()}
                {visits.map((v, idx) => (
                  <CircleMarker key={`${v.start.toISOString()}_${idx}`} center={[v.centerLat, v.centerLng]} radius={8} pathOptions={{ color: '#000000', weight: 2, fillColor: '#2563eb', fillOpacity: 1 }}>
                    <Tooltip className="glass-tooltip" direction="top" offset={[0, -8]} opacity={1} sticky>
                      <div style={{
                        padding: 8,
                        borderRadius: 12,
                        background: 'rgba(255,255,255,0.16)',
                        border: '1px solid rgba(255,255,255,0.25)',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                        color: '#0f172a',
                        backdropFilter: 'blur(8px)',
                        WebkitBackdropFilter: 'blur(8px)'
                      }}>
                        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Visit</div>
                        <div style={{ fontSize: 12 }}>Start: {fmt(v.start)}</div>
                        <div style={{ fontSize: 12 }}>End: {fmt(v.end)}</div>
                        <div style={{ fontSize: 12 }}>Duration: {dur(v.end.getTime() - v.start.getTime())}</div>
                        <div style={{ fontSize: 12, marginTop: 4, fontFamily: 'monospace' }}>{v.centerLat.toFixed(6)}, {v.centerLng.toFixed(6)} · {v.count} pts</div>
                      </div>
                    </Tooltip>
                  </CircleMarker>
                ))}
                {filtered.length > 1 && (() => {
                  const coords = filtered.map((l) => {
                    const [lng, lat] = l.location.coordinates as [number, number];
                    return [lat, lng] as [number, number];
                  });
                  const positions = [...coords];
                  return (
                    <>
                      <Polyline positions={positions} pathOptions={{ color: '#2563eb', weight: 3, opacity: 0.85 }} />
                      <CircleMarker center={positions[0]} radius={5} pathOptions={{ color: '#000000', weight: 2, fillColor: '#22c55e', fillOpacity: 1 }}>
                        <Tooltip className="glass-tooltip" direction="top" offset={[0, -6]} opacity={1} sticky>
                          Start
                        </Tooltip>
                      </CircleMarker>
                      <CircleMarker center={positions[positions.length - 1]} radius={6} pathOptions={{ color: '#000000', weight: 2, fillColor: '#ef4444', fillOpacity: 1 }}>
                        <Tooltip className="glass-tooltip" direction="top" offset={[0, -6]} opacity={1} sticky>
                          End
                        </Tooltip>
                      </CircleMarker>
                    </>
                  );
                })()}
              </>
            );
          })()
        )}
        {autoFit ? null : null}
    </MapContainer>
  );

  if (bare) return mapEl;

  return (
    <Paper elevation={0} sx={{ overflow: 'hidden' }}>
      {mapEl}
    </Paper>
  );
};

export default MapView;
