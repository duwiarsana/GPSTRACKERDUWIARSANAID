import { useEffect, useMemo, useState, useCallback } from 'react';
import { Box, Container, Stack, Typography, Paper, Button, Chip, Divider, Skeleton, IconButton, Tooltip, Slide, FormControlLabel, Switch, TextField, useMediaQuery, SwipeableDrawer, List, ListItemButton, ListItemAvatar, ListItemText, Avatar } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import L from 'leaflet';
import DevicesOtherIcon from '@mui/icons-material/DevicesOther';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt';
import HistoryIcon from '@mui/icons-material/History';
import MapIcon from '@mui/icons-material/Map';
import TuneIcon from '@mui/icons-material/Tune';
import LayersIcon from '@mui/icons-material/Layers';
import AltRouteIcon from '@mui/icons-material/AltRoute';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

import MetricCard from '../components/MetricCard';
import DeviceList from '../components/DeviceList';
import MapView from '../components/MapView';
import LocationHistoryTable from '../components/LocationHistoryTable';
import UserManagerDialog from '../components/UserManagerDialog';

import { useAppDispatch, useAppSelector } from '../store/store';
import {
  fetchDevices,
  fetchDevice,
  fetchDeviceLocations,
  fetchDeviceStats,
  setCurrentDevice,
  selectDevices,
  selectCurrentDevice,
  selectDeviceLoading,
  selectDeviceLocations,
  selectDeviceStats,
  selectDeviceError,
  selectDeviceLocationsState,
} from '../store/slices/deviceSlice';
import { clearLocations } from '../store/slices/deviceSlice';
import { selectAuth, logout } from '../store/slices/authSlice';
import type { Device } from '../types';
import useWebSocket from '../hooks/useWebSocket';
import { apiService } from '../services/api';

const DashboardPage: React.FC = () => {
  const dispatch = useAppDispatch();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { isAuthenticated, user } = useAppSelector(selectAuth);
  const devices = useAppSelector(selectDevices);
  const deviceLoading = useAppSelector(selectDeviceLoading);
  const selectedDevice = useAppSelector(selectCurrentDevice);
  const locations = useAppSelector(selectDeviceLocations);
  const stats = useAppSelector(selectDeviceStats);
  const locationsState = useAppSelector(selectDeviceLocationsState);
  const deviceError = useAppSelector(selectDeviceError);

  const isAdmin = user?.role === 'admin';

  const [userManagerOpen, setUserManagerOpen] = useState(false);
  const [geofence, setGeofence] = useState<any[] | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(undefined);
  const [panelsVisible, setPanelsVisible] = useState<boolean>(true);
  const [latestOnly, setLatestOnly] = useState<boolean>(true);
  const [showAllDevices, setShowAllDevices] = useState<boolean>(false);
  const [devicesOpen, setDevicesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dateStr, setDateStr] = useState<string | null>(null); // YYYY-MM-DD
  const [fromTimeStr, setFromTimeStr] = useState<string | null>(null); // HH:MM
  const [toTimeStr, setToTimeStr] = useState<string | null>(null); // HH:MM

  const normalizeDate = useCallback((d: string | null): string | null => {
    const raw = String(d ?? '').trim();
    if (!raw) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yyyy = Number(m[3]);
    if (!Number.isFinite(dd) || !Number.isFinite(mm) || !Number.isFinite(yyyy)) return null;
    if (yyyy < 1970 || yyyy > 2100) return null;
    if (mm < 1 || mm > 12) return null;
    if (dd < 1 || dd > 31) return null;
    return `${String(yyyy).padStart(4, '0')}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  }, []);

  const normalizeTime = useCallback((t: string | null): string | null => {
    const raw = String(t ?? '').trim();
    if (!raw) return null;
    const fixed = raw.replace('.', ':');
    const m = fixed.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }, []);

  const pathFrom = useMemo(() => {
    if (!dateStr && !fromTimeStr) return null;
    const d = normalizeDate(dateStr) || new Date().toISOString().slice(0, 10);
    const t = normalizeTime(fromTimeStr) || '00:00';
    const dt = new Date(`${d}T${t}:00`);
    return Number.isFinite(dt.getTime()) ? dt : null;
  }, [dateStr, fromTimeStr, normalizeDate, normalizeTime]);

  const pathTo = useMemo(() => {
    if (!dateStr && !toTimeStr) return null;
    const d = normalizeDate(dateStr) || new Date().toISOString().slice(0, 10);
    const t = normalizeTime(toTimeStr) || '23:59';
    const dt = new Date(`${d}T${t}:59`);
    return Number.isFinite(dt.getTime()) ? dt : null;
  }, [dateStr, toTimeStr, normalizeDate, normalizeTime]);

  const tripDistanceKm = useMemo(() => {
    if (latestOnly) return 0;
    if (!locations?.length) return 0;
    const fromTsRaw = pathFrom ? pathFrom.getTime() : Number.NEGATIVE_INFINITY;
    const toTsRaw = pathTo ? pathTo.getTime() : Number.POSITIVE_INFINITY;
    const fromTs = Number.isFinite(fromTsRaw) ? fromTsRaw : Number.NEGATIVE_INFINITY;
    const toTs = Number.isFinite(toTsRaw) ? toTsRaw : Number.POSITIVE_INFINITY;

    const toRad = (d: number) => (d * Math.PI) / 180;
    const haversineMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 6371000;
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };

    const rows = locations
      .map((l) => {
        const ts = new Date((l as any).timestamp ?? Date.now()).getTime();
        const coords = (l as any)?.location?.coordinates as [number, number] | undefined;
        if (!Array.isArray(coords) || coords.length < 2) return null;
        const [lng, lat] = coords;
        if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
        return { ts, lat, lng };
      })
      .filter((v): v is { ts: number; lat: number; lng: number } => !!v)
      .filter((v) => v.ts >= fromTs && v.ts <= toTs)
      .sort((a, b) => a.ts - b.ts);

    if (rows.length < 2) return 0;
    let sum = 0;
    for (let i = 1; i < rows.length; i += 1) {
      const a = rows[i - 1];
      const b = rows[i];
      sum += haversineMeters(a.lat, a.lng, b.lat, b.lng);
    }
    return sum / 1000;
  }, [latestOnly, locations, pathFrom, pathTo]);
  const { sendCommand } = useWebSocket();
  const [map, setMap] = useState<L.Map | null>(null);
  const handleMapReady = useCallback((m: L.Map) => {
    setMap((prev) => (prev === m ? prev : m));
  }, []);
  const [cachedDevice, setCachedDevice] = useState<Device | null>(null);
  const [forceTick, setForceTick] = useState<number>(0);
  const glassPanelSx = {
    backdropFilter: 'blur(16px)',
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
    border: '1px solid rgba(255, 255, 255, 0.25)',
    boxShadow: '0 6px 18px rgba(15, 23, 42, 0.10)',
    borderRadius: 2,
    transition: 'background-color 350ms ease, backdrop-filter 350ms ease, border-color 350ms ease, box-shadow 350ms ease',
  } as const;

  const visitsCount = useMemo(() => {
    if (!locations?.length) return 0;
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const recent = locations.filter((l) => new Date(l.timestamp).getTime() >= cutoff);
    if (!recent.length) return 0;
    // Use hysteresis to avoid flip-flop when hovering near boundary
    const RADIUS_ENTER_M = 25; // must be within this to join cluster
    const RADIUS_EXIT_M = 35;  // must exceed this to leave cluster
    const MIN_DURATION_MS = 30 * 1000; // 30s minimum dwell
    const MIN_POINTS = 1; // also count single-point stays to reflect each location
    const toRad = (d: number) => (d * Math.PI) / 180;
    const haversine = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 6371000;
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };
    const sorted = [...recent].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    let centerLat = 0, centerLng = 0, count = 0;
    let start: Date | null = null, end: Date | null = null;
    let visits = 0;
    const flush = () => {
      if (start && end && count > 0) {
        const duration = end.getTime() - start.getTime();
        if (duration >= MIN_DURATION_MS || count >= MIN_POINTS) visits += 1;
      }
    };
    for (const loc of sorted) {
      const [lng, lat] = loc.location.coordinates as [number, number];
      const t = new Date(loc.timestamp);
      if (count === 0) {
        centerLat = lat; centerLng = lng; count = 1; start = t; end = t; continue;
      }
      const dist = haversine(centerLat, centerLng, lat, lng);
      // join cluster if within enter radius
      if (dist <= RADIUS_ENTER_M) {
        centerLat = (centerLat * count + lat) / (count + 1);
        centerLng = (centerLng * count + lng) / (count + 1);
        count += 1; end = t;
      } else if (dist > RADIUS_EXIT_M) {
        flush();
        centerLat = lat; centerLng = lng; count = 1; start = t; end = t;
      }
    }
    flush();
    return visits;
  }, [locations]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    dispatch(fetchDevices());
  }, [dispatch, isAuthenticated]);


  useEffect(() => {
    if (!devices.length || selectedDeviceId) {
      return;
    }
    const first = devices[0];
    const firstId = first.id || first._id || first.deviceId;
    if (firstId) {
      handleSelectDevice(firstId, first as Device);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devices]);

  useEffect(() => {
    if (!selectedDeviceId) {
      return;
    }
    dispatch(fetchDevice(selectedDeviceId));
    dispatch(fetchDeviceLocations(selectedDeviceId));
    dispatch(fetchDeviceStats(selectedDeviceId));
    // fetch geofence
    (async () => {
      try {
        const gf = await apiService.getDeviceGeofence(selectedDeviceId);
        setGeofence(gf || null);
      } catch {
        setGeofence(null);
      }
    })();
  }, [dispatch, selectedDeviceId]);

  // Cache last selected device to avoid UI blink while loading next one
  useEffect(() => {
    if (selectedDevice && !deviceLoading) {
      setCachedDevice(selectedDevice);
    }
  }, [selectedDevice, deviceLoading]);

  // Focus map when selected device currentLocation becomes available/updates (handles async fetch timing)
  useEffect(() => {
    try {
      const coords = (selectedDevice as any)?.currentLocation?.coordinates as [number, number] | undefined; // [lng, lat]
      if (map && coords && coords.length >= 2 && isFinite(coords[0]) && isFinite(coords[1])) {
        const latlng: [number, number] = [coords[1], coords[0]];
        const targetZoom = Math.max(map.getZoom() || 0, 13);
        map.flyTo(latlng, targetZoom, { duration: 0.8 });
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, (selectedDevice as any)?.currentLocation?.coordinates]);

  // Realtime: when selected device's currentLocation updates via WebSocket, force marker promotion
  useEffect(() => {
    const ts = (selectedDevice as any)?.currentLocation?.timestamp || (selectedDevice as any)?.lastSeen;
    if (!ts) return;
    setForceTick((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDevice?.deviceId, (selectedDevice as any)?.currentLocation?.timestamp]);

  const handleSelectDevice = (id: string, device?: Device) => {
    const resolvedDevice = device || devices.find((item: Device) => (item.id || (item as any)._id || item.deviceId) === id);
    // Use canonical Mongo id for API fetches to ensure correct device endpoints
    const canonicalId = (resolvedDevice as any)?.id || (resolvedDevice as any)?._id || id;
    // If user clicks the SAME device again, do NOT clear; just re-fetch to repopulate (prevents history disappearing)
    if (selectedDeviceId && canonicalId === selectedDeviceId) {
      // Force marker immediately using best available latest
      setForceTick((t) => t + 1);
      dispatch(fetchDeviceLocations(canonicalId));
      dispatch(fetchDeviceStats(canonicalId));
      // Focus map to latest known position if available for the same device
      try {
        const coords = (resolvedDevice as any)?.currentLocation?.coordinates as [number, number] | undefined; // [lng, lat]
        if (map && coords && coords.length >= 2 && isFinite(coords[0]) && isFinite(coords[1])) {
          const latlng: [number, number] = [coords[1], coords[0]];
          const targetZoom = Math.max(map.getZoom() || 0, 13);
          map.flyTo(latlng, targetZoom, { duration: 0.8 });
        }
      } catch {}
      return;
    }
    // Switching device: update state and clear old locations to avoid mixing
    // Force marker immediately using cached/stats/current while history loads
    setForceTick((t) => t + 1);
    setSelectedDeviceId(canonicalId);
    if (resolvedDevice) {
      dispatch(setCurrentDevice(resolvedDevice));
      dispatch(clearLocations());
      // Focus map to the device's last known location (if exists), else no-op
      try {
        const coords = (resolvedDevice as any)?.currentLocation?.coordinates as [number, number] | undefined; // [lng, lat]
        if (map && coords && coords.length >= 2 && isFinite(coords[0]) && isFinite(coords[1])) {
          const latlng: [number, number] = [coords[1], coords[0]];
          const targetZoom = Math.max(map.getZoom() || 0, 13);
          map.flyTo(latlng, targetZoom, { duration: 0.8 });
        }
      } catch {}
    }
  };

  const derivedStats = useMemo(() => {
    const total = devices.length;
    const active = devices.filter((d: Device) => d.isActive).length;
    return {
      total,
      active,
      inactive: total - active,
      lastUpdate: selectedDevice?.lastSeen,
      avgSpeed: stats?.stats?.avgSpeed ?? null,
      maxSpeed: stats?.stats?.maxSpeed ?? null,
      totalLocations: stats?.stats?.totalLocations ?? 0,
    };
  }, [devices, selectedDevice, stats]);

  // Cache last stable stats (avoid UI blinking when switching devices)
  const [cachedStats, setCachedStats] = useState(derivedStats);
  useEffect(() => {
    if (!deviceLoading) {
      setCachedStats(derivedStats);
    }
  }, [derivedStats, deviceLoading]);

  const metricsRow = useMemo(() => (
    <Box sx={{
      display: 'grid',
      gap: 2,
      gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0, 1fr))' },
    }}>
      <MetricCard compact inlineLabel label="Total Devices" value={cachedStats.total} valueKey={`total-${cachedStats.total}`} icon={<DevicesOtherIcon />} />
      <MetricCard compact inlineLabel label="Active" value={cachedStats.active} valueKey={`active-${cachedStats.active}`} color="success" icon={<HealthAndSafetyIcon />} />
      <MetricCard compact inlineLabel label="Inactive" value={cachedStats.inactive} valueKey={`inactive-${cachedStats.inactive}`} color="warning" icon={<DevicesOtherIcon />} />
      <MetricCard compact inlineLabel label="Total Locations" value={visitsCount} valueKey={`visits-${visitsCount}`} color="info" icon={<MapIcon />} />
    </Box>
  ), [cachedStats.total, cachedStats.active, cachedStats.inactive, visitsCount]);

  const renderAuthNotice = () => (
    <Paper
      elevation={0}
      sx={{
        ...glassPanelSx,
        px: 6,
        py: 8,
        textAlign: 'center',
        border: '1px dashed rgba(255,255,255,0.45)',
      }}
    >
      <Stack spacing={3} alignItems="center">
        <Typography variant="h4" fontWeight={600}>
          Welcome to GPS Tracker Dashboard
        </Typography>
        <Typography variant="body1" color="text.secondary" maxWidth={560}>
          Login terlebih dahulu atau registrasikan akun untuk mulai mengelola perangkat GPS, memantau posisi
          real-time, dan melihat histori pergerakan.
        </Typography>
        <Stack direction="row" spacing={2}>
          <Button variant="contained" size="large" color="primary">
            Login
          </Button>
          <Button variant="outlined" size="large" color="secondary">
            Register
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );

  const handlePingDevice = () => {
    if (!selectedDevice) {
      return;
    }
    const deviceId = selectedDevice.deviceId;
    sendCommand(deviceId, 'PING');
  };

  if (isMobile) {
    const headerDevice = (cachedDevice || selectedDevice) as any;
    const headerOnline = !!headerDevice?.isActive;
    const headerTitle = headerDevice?.name || 'GPS Tracker';
    const headerSub = headerDevice?.deviceId || '';

    const mobileLabelSx = {
      ...glassPanelSx,
      px: 1.75,
      py: 1.1,
      borderRadius: 3,
      flexGrow: 1,
      minWidth: 0,
      cursor: 'default',
      userSelect: 'none',
      border: '1px solid transparent',
      boxShadow: 'none',
    } as const;

    const mobileControlSx = {
      ...glassPanelSx,
      borderRadius: 999,
    } as const;

    const handleToggleHistory = () => {
      setLatestOnly((prev) => {
        const next = !prev;
        if (!next) {
          setShowAllDevices(false);
        }
        return next;
      });
    };

    const handleToggleAllDevices = () => {
      setShowAllDevices((prev) => {
        const next = !prev;
        if (next) {
          setLatestOnly(true);
        }
        return next;
      });
    };

    const handleRecenter = () => {
      if (!map) return;
      try {
        if (showAllDevices) {
          const indonesiaBounds = L.latLngBounds([[-11.0, 95.0], [6.5, 141.0]]);
          map.fitBounds(indonesiaBounds, { padding: [24, 24] });
          return;
        }

        const coords = (headerDevice as any)?.currentLocation?.coordinates as [number, number] | undefined;
        if (coords && coords.length >= 2 && isFinite(coords[0]) && isFinite(coords[1])) {
          const latlng: [number, number] = [coords[1], coords[0]];
          const targetZoom = Math.max(map.getZoom() || 0, 13);
          map.flyTo(latlng, targetZoom, { duration: 0.8 });
        }
      } catch {}
    };

    return (
      <Box
        sx={{
          position: 'relative',
          height: '100vh',
          bgcolor: 'background.default',
          display: 'flex',
          flexDirection: 'column',
          '@supports (height: 100dvh)': { height: '100dvh' },
          '@supports (height: 100svh)': { height: '100svh' },
        }}
      >
        {!isAuthenticated ? (
          <Container maxWidth="sm" sx={{ pt: 1.5, pb: 2 }}>
            {renderAuthNotice()}
          </Container>
        ) : (
          <>
            <Box sx={{ px: 1.5, pt: 1.25, pb: 1, display: 'flex', alignItems: 'center', gap: 1.25 }}>
              <Paper elevation={0} sx={mobileLabelSx}>
                <Stack direction="row" alignItems="center" spacing={1.1} sx={{ minWidth: 0 }}>
                  <Box sx={{ width: 9, height: 9, borderRadius: 999, bgcolor: headerOnline ? 'success.main' : 'warning.main', flexShrink: 0 }} />
                  <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.05 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, lineHeight: 1.05 }}>
                      {headerTitle}
                    </Typography>
                  </Box>
                  {headerSub ? (
                    <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap', fontWeight: 800, opacity: 0.9, flexShrink: 0 }}>
                      {headerSub}
                    </Typography>
                  ) : null}
                </Stack>
              </Paper>
              <Paper elevation={0} sx={mobileControlSx}>
                <Tooltip title="Settings">
                  <IconButton size="small" onClick={() => setSettingsOpen(true)}>
                    <TuneIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Paper>
            </Box>

            <Box sx={{ position: 'relative', flexGrow: 1, minHeight: 0 }}>
              <Box sx={{ position: 'absolute', inset: 0, zIndex: 0 }}>
                <MapView
                  device={selectedDevice}
                  devices={devices as unknown as Device[]}
                  locations={locations}
                  height="100%"
                  bare
                  latestOnly={latestOnly}
                  showAllDevices={showAllDevices}
                  onMapReady={handleMapReady}
                  from={pathFrom}
                  to={pathTo}
                  statsLatest={(stats as any)?.deviceId === selectedDeviceId ? (stats as any)?.latestLocation ?? null : null}
                  forceTick={forceTick}
                  activeId={selectedDeviceId}
                  geofence={geofence}
                  onSelectDevice={(id) => {
                    handleSelectDevice(id);
                    setDevicesOpen(false);
                  }}
                />
                {locationsState.loading && (
                  <Skeleton
                    variant="rectangular"
                    width="100%"
                    height="100%"
                    sx={{ position: 'absolute', inset: 0, zIndex: 0, opacity: 0.35, transition: 'opacity 200ms ease', willChange: 'opacity' }}
                  />
                )}
              </Box>

              <Box sx={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}>
                <Box sx={{ position: 'absolute', right: 12, bottom: 12, display: 'flex', flexDirection: 'column', gap: 1, pointerEvents: 'auto' }}>
                  <Paper elevation={0} sx={mobileControlSx}>
                    <Tooltip title="Recenter">
                      <IconButton size="small" onClick={handleRecenter}>
                        <MyLocationIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Paper>
                  <Paper elevation={0} sx={mobileControlSx}>
                    <Tooltip title="Devices">
                      <IconButton size="small" onClick={() => setDevicesOpen(true)}>
                        <DevicesOtherIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Paper>
                  <Paper elevation={0} sx={{ ...mobileControlSx, borderColor: showAllDevices ? 'rgba(37,99,235,0.35)' : undefined }}>
                    <Tooltip title="Show all devices">
                      <IconButton size="small" color={showAllDevices ? 'primary' : 'default'} onClick={handleToggleAllDevices} disabled={!latestOnly}>
                        <LayersIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Paper>
                  <Paper elevation={0} sx={{ ...mobileControlSx, borderColor: !latestOnly ? 'rgba(37,99,235,0.35)' : undefined }}>
                    <Tooltip title="History / Path">
                      <IconButton size="small" color={!latestOnly ? 'primary' : 'default'} onClick={handleToggleHistory}>
                        <AltRouteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Paper>
                </Box>

                {deviceError && (
                  <Box sx={{ position: 'absolute', left: 12, right: 12, bottom: 82, pointerEvents: 'auto' }}>
                    <Paper elevation={0} sx={{ ...glassPanelSx, p: 1.25 }}>
                      <Typography variant="caption" color="error">
                        {deviceError}
                      </Typography>
                    </Paper>
                  </Box>
                )}
              </Box>
            </Box>

            <SwipeableDrawer
              anchor="bottom"
              open={devicesOpen}
              onClose={() => setDevicesOpen(false)}
              onOpen={() => setDevicesOpen(true)}
              disableSwipeToOpen
              PaperProps={{ sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16 } }}
            >
              <Box sx={{ px: 2, pt: 1.25, pb: 1 }}>
                <Box sx={{ width: 36, height: 4, borderRadius: 999, bgcolor: 'rgba(0,0,0,0.15)', mx: 'auto', mb: 1 }} />
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 900 }}>
                    Devices
                  </Typography>
                  <Box sx={{ flexGrow: 1 }} />
                  <Chip label={`${devices.length}`} size="small" variant="outlined" />
                </Stack>
              </Box>
              <Divider />
              <List dense disablePadding sx={{ maxHeight: '65vh', overflowY: 'auto' }}>
                {devices.map((d: Device) => {
                  const id = (d as any)?.id || (d as any)?._id || d.deviceId;
                  const selected = !!id && id === selectedDeviceId;
                  return (
                    <ListItemButton
                      key={String(id)}
                      selected={selected}
                      onClick={() => {
                        if (!id) return;
                        handleSelectDevice(String(id), d);
                        setDevicesOpen(false);
                      }}
                      sx={{ py: 1.25, px: 2 }}
                    >
                      <ListItemAvatar>
                        <Avatar sx={{ width: 32, height: 32, bgcolor: (d as any)?.isActive ? 'success.main' : 'warning.main' }}>
                          <DevicesOtherIcon sx={{ fontSize: 18, color: 'white' }} />
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={<Typography variant="body2" sx={{ fontWeight: 800 }}>{d.name || 'Device'}</Typography>}
                        secondary={<Typography variant="caption" color="text.secondary">{d.deviceId}</Typography>}
                      />
                      <Chip
                        label={(d as any)?.isActive ? 'Online' : 'Offline'}
                        color={(d as any)?.isActive ? 'success' : 'warning'}
                        size="small"
                        variant={selected ? 'filled' : 'outlined'}
                        sx={{ fontWeight: 800 }}
                      />
                    </ListItemButton>
                  );
                })}
              </List>
            </SwipeableDrawer>

            <SwipeableDrawer
              anchor="bottom"
              open={settingsOpen}
              onClose={() => setSettingsOpen(false)}
              onOpen={() => setSettingsOpen(true)}
              disableSwipeToOpen
              PaperProps={{ sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16 } }}
            >
              <Box sx={{ px: 2, pt: 1.25, pb: 1 }}>
                <Box sx={{ width: 36, height: 4, borderRadius: 999, bgcolor: 'rgba(0,0,0,0.15)', mx: 'auto', mb: 1 }} />
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 900 }}>
                    View Settings
                  </Typography>
                  <Box sx={{ flexGrow: 1 }} />
                  <Button size="small" variant="text" onClick={() => setSettingsOpen(false)} sx={{ fontWeight: 800 }}>
                    Close
                  </Button>
                </Stack>
              </Box>
              <Divider />
              <Box sx={{ px: 2, py: 1.25 }}>
                <Stack spacing={1.25}>
                  <FormControlLabel
                    control={<Switch color="primary" checked={!latestOnly} onChange={handleToggleHistory} />}
                    label={<Typography variant="body2" sx={{ fontWeight: 800 }}>Enable History / Path</Typography>}
                    sx={{ ml: 0, mr: 0, justifyContent: 'space-between', '& .MuiFormControlLabel-label': { flexGrow: 1 } }}
                  />
                  <FormControlLabel
                    control={<Switch color="primary" checked={showAllDevices} onChange={handleToggleAllDevices} disabled={!latestOnly} />}
                    label={<Typography variant="body2" sx={{ fontWeight: 800 }}>Show All Devices</Typography>}
                    sx={{ ml: 0, mr: 0, justifyContent: 'space-between', '& .MuiFormControlLabel-label': { flexGrow: 1 } }}
                  />

                  {!latestOnly && (
                    <Stack spacing={1}>
                      <TextField
                        label="Date"
                        type="date"
                        size="small"
                        value={dateStr ?? ''}
                        onChange={(e) => setDateStr(e.target.value || null)}
                        InputLabelProps={{ shrink: true }}
                        fullWidth
                      />
                      <Stack direction="row" spacing={1}>
                        <TextField
                          label="From"
                          type="time"
                          size="small"
                          value={fromTimeStr ?? ''}
                          onChange={(e) => setFromTimeStr(e.target.value || null)}
                          InputLabelProps={{ shrink: true }}
                          fullWidth
                        />
                        <TextField
                          label="To"
                          type="time"
                          size="small"
                          value={toTimeStr ?? ''}
                          onChange={(e) => setToTimeStr(e.target.value || null)}
                          InputLabelProps={{ shrink: true }}
                          fullWidth
                        />
                      </Stack>
                      <Button size="small" variant="text" onClick={() => { setDateStr(null); setFromTimeStr(null); setToTimeStr(null); }} sx={{ fontWeight: 800 }}>
                        Clear
                      </Button>
                    </Stack>
                  )}

                  {isAdmin ? (
                    <>
                      <Divider />
                      <Button
                        variant="outlined"
                        onClick={() => {
                          setSettingsOpen(false);
                          setUserManagerOpen(true);
                        }}
                        sx={{ fontWeight: 900 }}
                      >
                        User Manager
                      </Button>
                    </>
                  ) : null}

                  <Divider />
                  <Button variant="contained" color="secondary" onClick={() => dispatch(logout())} sx={{ fontWeight: 900 }}>
                    Logout
                  </Button>
                </Stack>
              </Box>
            </SwipeableDrawer>

            <UserManagerDialog
              open={userManagerOpen}
              onClose={() => setUserManagerOpen(false)}
              currentUserEmail={user?.email || null}
            />
          </>
        )}
      </Box>
    );
  }

  return (
    <Box sx={{ position: 'relative', height: '100vh', bgcolor: 'background.default' }}>
      {/* Fullscreen background map */}
      {isAuthenticated && (
        <Box sx={{ position: 'absolute', inset: 0, zIndex: 0 }}>
          <MapView
            device={selectedDevice}
            devices={devices as unknown as Device[]}
            locations={locations}
            height="100vh"
            bare
            latestOnly={latestOnly}
            showAllDevices={showAllDevices}
            onMapReady={handleMapReady}
            from={pathFrom}
            to={pathTo}
            statsLatest={(stats as any)?.deviceId === selectedDeviceId ? (stats as any)?.latestLocation ?? null : null}
            forceTick={forceTick}
            activeId={selectedDeviceId}
            geofence={geofence}
          />
          {locationsState.loading && (
            <Skeleton
              variant="rectangular"
              width="100%"
              height="100%"
              sx={{ position: 'absolute', inset: 0, zIndex: 0, opacity: 0.35, transition: 'opacity 200ms ease', willChange: 'opacity' }}
            />
          )}
        </Box>
      )}

      {/* Overlay content */}
      <Box sx={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}>
        {/* Toggle button */}
        <Box sx={{ position: 'absolute', top: { xs: 8, md: 16 }, right: { xs: 8, md: 16 }, zIndex: 2, pointerEvents: 'auto' }}>
          <Tooltip title={panelsVisible ? 'Sembunyikan panel' : 'Tampilkan panel'}>
            <IconButton color="primary" onClick={() => setPanelsVisible((prev) => !prev)}>
              {panelsVisible ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Tooltip>
        </Box>

        <Container
          maxWidth="xl"
          sx={{
            pt: { xs: 1.5, md: 3 },
            pb: { xs: 1.5, md: 3 },
            pointerEvents: 'auto',
            height: { xs: '100%', md: 'auto' },
            overflowY: { xs: 'auto', md: 'visible' },
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <Slide
            in={panelsVisible}
            direction="down"
            timeout={{ enter: 550, exit: 500 }}
            easing={{ enter: 'cubic-bezier(0.22, 1, 0.36, 1)', exit: 'cubic-bezier(0.22, 1, 0.36, 1)' }}
            mountOnEnter
            unmountOnExit
            appear
          >
            <Stack spacing={2} sx={{ pointerEvents: panelsVisible ? 'auto' : 'none' }}>
              {/* Use cachedDevice to keep UI stable while switching */}
              <Stack
                direction={{ xs: 'column', md: 'row' }}
                justifyContent={{ xs: 'flex-start', md: 'flex-end' }}
                spacing={{ xs: 1, md: 2 }}
                alignItems={{ xs: 'stretch', md: 'center' }}
                sx={{ px: 1, flexWrap: 'wrap' }}
              >
                  <Chip
                    icon={<SatelliteAltIcon />}
                    label={(cachedDevice || selectedDevice)?.deviceId || '-'}
                    color={(cachedDevice || selectedDevice)?.isActive ? 'success' : 'warning'}
                    variant="filled"
                    sx={{
                      fontWeight: 700,
                      bgcolor: (theme) => (cachedDevice || selectedDevice)?.isActive ? theme.palette.success.main : theme.palette.warning.main,
                      color: (theme) => theme.palette.getContrastText((cachedDevice || selectedDevice)?.isActive ? theme.palette.success.main : theme.palette.warning.main),
                      boxShadow: '0 3px 10px rgba(15,23,42,0.15)',
                      transition: 'none !important',
                      alignSelf: { xs: 'flex-start', md: 'auto' },
                    }}
                  />
                  <FormControlLabel
                    control={<Switch color="primary" checked={!latestOnly} onChange={(e) => setLatestOnly(!e.target.checked)} />}
                    label={
                      <Typography variant="button" sx={{ fontWeight: 700, letterSpacing: '0.08em', fontSize: { xs: 11, md: 13 } }}>
                        SHOW PATH
                      </Typography>
                    }
                  />
                  <FormControlLabel
                    control={<Switch color="primary" checked={showAllDevices} onChange={(e) => setShowAllDevices(e.target.checked)} disabled={!latestOnly} />}
                    label={
                      <Typography variant="button" sx={{ fontWeight: 700, letterSpacing: '0.08em', fontSize: { xs: 11, md: 13 } }}>
                        SHOW ALL DEVICES
                      </Typography>
                    }
                  />
                  <Stack
                    direction={{ xs: 'column', md: 'row' }}
                    spacing={1.5}
                    alignItems="center"
                    sx={{ opacity: latestOnly ? 0.5 : 1, transition: 'opacity 250ms ease' }}
                  >
                      <TextField
                        label="Date"
                        type="date"
                        size="small"
                        value={dateStr ?? ''}
                        onChange={(e) => setDateStr(e.target.value || null)}
                        InputLabelProps={{ shrink: true }}
                        sx={{ minWidth: { xs: '100%', md: 170 }, width: { xs: '100%', md: 'auto' }, bgcolor: 'rgba(255,255,255,0.9)', borderRadius: 1 }}
                        disabled={latestOnly}
                      />
                      <TextField
                        label="From"
                        type="time"
                        size="small"
                        value={fromTimeStr ?? ''}
                        onChange={(e) => setFromTimeStr(e.target.value || null)}
                        InputLabelProps={{ shrink: true }}
                        sx={{ minWidth: { xs: '100%', md: 150 }, width: { xs: '100%', md: 'auto' }, bgcolor: 'rgba(255,255,255,0.9)', borderRadius: 1 }}
                        disabled={latestOnly}
                      />
                      <TextField
                        label="To"
                        type="time"
                        size="small"
                        value={toTimeStr ?? ''}
                        onChange={(e) => setToTimeStr(e.target.value || null)}
                        InputLabelProps={{ shrink: true }}
                        sx={{ minWidth: { xs: '100%', md: 150 }, width: { xs: '100%', md: 'auto' }, bgcolor: 'rgba(255,255,255,0.9)', borderRadius: 1 }}
                        disabled={latestOnly}
                      />
                      <Button size={isMobile ? 'small' : 'medium'} variant="text" disabled={latestOnly} onClick={() => { setDateStr(null); setFromTimeStr(null); setToTimeStr(null); }} sx={{ width: { xs: '100%', md: 'auto' } }}>Clear</Button>
                  </Stack>
                  <Button
                    variant="contained"
                    color="primary"
                    size={isMobile ? 'small' : 'medium'}
                    fullWidth={isMobile}
                    sx={{ boxShadow: '0 6px 16px rgba(15,23,42,0.18)' }}
                    onClick={() => {
                      if (!map) return;
                      const indonesiaBounds = L.latLngBounds([[-11.0, 95.0], [6.5, 141.0]]);
                      map.fitBounds(indonesiaBounds, { padding: [24, 24] });
                    }}
                  >
                    Reset View
                  </Button>
                  <Button variant="contained" startIcon={<HistoryIcon />} size={isMobile ? 'small' : 'medium'} fullWidth={isMobile} onClick={handlePingDevice} disabled={!cachedDevice && !selectedDevice} sx={{ boxShadow: '0 6px 16px rgba(15,23,42,0.18)' }}>
                    Ping Device
                  </Button>
                  {isAdmin ? (
                    <Button
                      variant="contained"
                      color="info"
                      onClick={() => setUserManagerOpen(true)}
                      size={isMobile ? 'small' : 'medium'}
                      fullWidth={isMobile}
                      sx={{ boxShadow: '0 6px 16px rgba(15,23,42,0.18)' }}
                    >
                      User Manager
                    </Button>
                  ) : null}
                  <Button
                    variant="contained"
                    color="secondary"
                    onClick={() => dispatch(logout())}
                    size={isMobile ? 'small' : 'medium'}
                    fullWidth={isMobile}
                    sx={{ boxShadow: '0 6px 16px rgba(15,23,42,0.18)' }}
                  >
                    Logout
                  </Button>
              </Stack>

              <UserManagerDialog
                open={userManagerOpen}
                onClose={() => setUserManagerOpen(false)}
                currentUserEmail={user?.email || null}
              />

              {!isAuthenticated ? (
                renderAuthNotice()
              ) : (
                <Stack spacing={2}>
                  {/* Metric cards row */}
                  {metricsRow}

                  {/* Panels above the map */}
                  <Box sx={{
                    display: 'grid',
                    gap: 2,
                    gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) minmax(0, 1.4fr)' },
                    alignItems: 'stretch',
                  }}>
                    <Stack spacing={1.5}>
                      <DeviceList
                        devices={devices}
                        selectedId={selectedDeviceId}
                        onSelect={(id) => handleSelectDevice(id)}
                        loading={deviceLoading && devices.length === 0}
                        containerSx={glassPanelSx}
                        onRefresh={() => dispatch(fetchDevices())}
                        showPath={!latestOnly}
                        pathDistanceKm={tripDistanceKm}
                        pathDistanceLoading={locationsState.loading}
                      />
                      {deviceError && (
                        <Paper sx={{ ...glassPanelSx, p: 2 }}>
                          <Typography variant="subtitle2" color="error">
                            {deviceError}
                          </Typography>
                        </Paper>
                      )}
                    </Stack>

                    <Stack spacing={1.5}>
                      <Paper sx={{ ...glassPanelSx, p: 2 }}>
                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} divider={<Divider flexItem orientation="vertical" />}>
                          <Stack spacing={0.5} flex={1}>
                            <Typography variant="subtitle2" color="text.secondary">Last Update</Typography>
                            <Typography variant="body2" sx={{ fontWeight: 400 }}>
                              {cachedStats.lastUpdate ? new Date(cachedStats.lastUpdate).toLocaleString() : '-'}
                            </Typography>
                          </Stack>
                          <Stack spacing={0.5} flex={1}>
                            <Typography variant="subtitle2" color="text.secondary">Average Speed</Typography>
                            <Typography variant="body2" sx={{ fontWeight: 400 }}>
                              {cachedStats.avgSpeed ? `${cachedStats.avgSpeed.toFixed(1)} km/h` : '-'}
                            </Typography>
                          </Stack>
                          <Stack spacing={0.5} flex={1}>
                            <Typography variant="subtitle2" color="text.secondary">Max Speed</Typography>
                            <Typography variant="body2" sx={{ fontWeight: 400 }}>
                              {cachedStats.maxSpeed ? `${cachedStats.maxSpeed.toFixed(1)} km/h` : '-'}
                            </Typography>
                          </Stack>
                        </Stack>
                      </Paper>

                      <LocationHistoryTable locations={locations} containerSx={glassPanelSx} />
                    </Stack>
                  </Box>
                </Stack>
              )}
            </Stack>
          </Slide>
        </Container>
        {/* Footer copyright */}
        <Box sx={{ position: 'absolute', bottom: 8, left: 16, opacity: 0.8 }}>
          <Typography variant="caption" color="text.secondary">
            © duwiarsana {new Date().getFullYear()}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};
export default DashboardPage;
