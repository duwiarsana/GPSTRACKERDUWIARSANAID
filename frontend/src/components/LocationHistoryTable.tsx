import * as React from 'react';
import { Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography, Stack, FormControlLabel, Switch, useMediaQuery } from '@mui/material';
import type { Location } from '../types';
import type { SxProps, Theme } from '@mui/material/styles';
import { useTheme } from '@mui/material/styles';
import { format } from 'date-fns';
import { API_URL } from '../services/api';

interface LocationHistoryTableProps {
  locations: Location[];
  height?: number;
  containerSx?: SxProps<Theme>;
}

const headers = ['#', 'Timestamp', 'Latitude', 'Longitude', 'Alamat', 'Duration'];

type Visit = {
  start: Date;
  end: Date;
  centerLat: number;
  centerLng: number;
  count: number;
};

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const LocationHistoryTable: React.FC<LocationHistoryTableProps> = ({ locations, height = 360, containerSx }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const mergedSx: SxProps<Theme> = containerSx
    ? ([...(Array.isArray(containerSx) ? containerSx : [containerSx]), { overflow: 'hidden', height }] as SxProps<Theme>)
    : { overflow: 'hidden', height };

  // UI controls
  const [showVisits, setShowVisits] = React.useState(true);

  const [addressCache, setAddressCache] = React.useState<Record<string, string>>({});
  const [addressLoading, setAddressLoading] = React.useState<Record<string, boolean>>({});

  const addressKeyFor = React.useCallback((lat: number, lng: number) => {
    return `${lat.toFixed(5)},${lng.toFixed(5)}`;
  }, []);

  const shortAddress = React.useCallback((addr: string) => {
    const clean = String(addr || '').trim();
    if (!clean) return clean;
    const parts = clean.split(',').map((s) => s.trim()).filter(Boolean);
    const head = parts.slice(0, 3).join(', ');
    const capped = head.length > 46 ? `${head.slice(0, 46)}…` : head;
    return capped;
  }, []);

  const ensureAddress = React.useCallback(
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
          const display =
            typeof data.address === 'string' && data.address.trim().length > 0
              ? data.address.trim()
              : 'Alamat tidak tersedia';
          setAddressCache((prev) => ({ ...prev, [key]: display }));
        })
        .catch(() => {
          // swallow network/parse errors
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

  const visits = React.useMemo<Visit[]>(() => {
    if (!locations?.length) return [];
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const recent = locations.filter((l) => new Date(l.timestamp).getTime() >= cutoff);
    if (!recent.length) return [];
    // Recommended parameters: small hysteresis to avoid bouncing
    const RADIUS_ENTER_M = 25; // meters
    const RADIUS_EXIT_M = 35;  // meters
    const MIN_DURATION_MS = 30 * 1000; // 30s
    const MIN_POINTS = 1; // count single-point stays

    const toRad = (d: number) => (d * Math.PI) / 180;
    const haversine = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 6371000;
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };

    // Sort ascending by time
    const sorted = [...recent].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const out: Visit[] = [];
    let centerLat = 0, centerLng = 0, count = 0;
    let start: Date | null = null, end: Date | null = null;

    const flushIfVisit = () => {
      if (start && end && count > 0) {
        const duration = end.getTime() - start.getTime();
        if (duration >= MIN_DURATION_MS || count >= MIN_POINTS) {
          out.push({ start, end, centerLat, centerLng, count });
        }
      }
    };

    for (const loc of sorted) {
      const [lng, lat] = loc.location.coordinates as [number, number];
      const t = new Date(loc.timestamp);
      if (count === 0) {
        centerLat = lat; centerLng = lng; count = 1; start = t; end = t; continue;
      }
      const dist = haversine(centerLat, centerLng, lat, lng);
      if (dist <= RADIUS_ENTER_M) {
        // join cluster and update running center
        centerLat = (centerLat * count + lat) / (count + 1);
        centerLng = (centerLng * count + lng) / (count + 1);
        count += 1; end = t;
      } else if (dist > RADIUS_EXIT_M) {
        flushIfVisit();
        centerLat = lat; centerLng = lng; count = 1; start = t; end = t;
      } else {
        // between enter and exit radius: keep in current cluster
        count += 1; end = t;
      }
    }
    flushIfVisit();
    // Latest first for UI
    return out.sort((a, b) => b.end.getTime() - a.end.getTime());
  }, [locations]);

  React.useEffect(() => {
    if (!showVisits) return;
    const maxPrefetch = 20;
    for (const v of visits.slice(0, maxPrefetch)) {
      ensureAddress(v.centerLat, v.centerLng);
    }
  }, [ensureAddress, showVisits, visits]);

  const pointRows = React.useMemo(() => {
    if (!locations?.length) return [] as Location[];
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const recent = locations.filter((l) => new Date(l.timestamp).getTime() >= cutoff);
    return recent.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [locations]);

  return (
    <Paper elevation={0} sx={mergedSx}>
      <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'stretch', sm: 'center' }} px={2} py={1.5} spacing={{ xs: 1, sm: 0 }} sx={{ position: 'relative', pr: { xs: 2, md: '392px' } }}>
        <Typography variant="subtitle1" fontWeight={600}>
          {showVisits ? 'Visit Locations' : 'Location Points'}
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Stack
          direction="row"
          spacing={2}
          alignItems="center"
          sx={{
            position: { xs: 'static', md: 'absolute' },
            right: { md: 16 },
            top: { md: '50%' },
            transform: { xs: 'none', md: 'translateY(-50%)' },
            width: { xs: '100%', md: 360 },
            justifyContent: { xs: 'space-between', md: 'flex-end' },
            flexWrap: { xs: 'wrap', md: 'nowrap' },
            gap: { xs: 1, md: 0 },
          }}
        >
          <Typography variant="body2" color="text.secondary" sx={{ width: { xs: 'auto', md: 160 }, textAlign: { xs: 'left', md: 'right' }, whiteSpace: 'nowrap' }}>
            {showVisits ? `Showing ${visits.length} visits` : `Showing ${pointRows.length} locations`}
          </Typography>
          <FormControlLabel
            control={<Switch color="primary" checked={showVisits} onChange={(e) => setShowVisits(e.target.checked)} />}
            label={<Typography variant="body2">Visits</Typography>}
            sx={{ ml: { xs: 0, md: 1 }, minWidth: { xs: 'auto', md: 160 }, justifyContent: 'flex-end' }}
          />
        </Stack>
      </Stack>
      <TableContainer sx={{ maxHeight: height - 64 }}>
        <Table stickyHeader size="small" sx={{ tableLayout: 'fixed', width: '100%' }}>
          <TableHead>
            <TableRow>
              {isMobile
                ? ['#', 'Timestamp', 'Details'].map((header, idx) => (
                    <TableCell
                      key={header}
                      sx={{
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        width: idx === 0 ? '10%' : idx === 1 ? '35%' : '55%',
                      }}
                      align="left"
                    >
                      {header}
                    </TableCell>
                  ))
                : (showVisits
                    ? headers.map((header, idx) => (
                        <TableCell
                          key={header}
                          sx={{
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                            width:
                              idx === 0
                                ? '5%'
                                : idx === 1
                                  ? '23%'
                                  : idx === 2
                                    ? '14%'
                                    : idx === 3
                                      ? '14%'
                                      : idx === 4
                                        ? '20%'
                                        : '24%',
                          }}
                          align="left"
                        >
                          {header}
                        </TableCell>
                      ))
                    : ['#', 'Timestamp', 'Latitude', 'Longitude', 'Speed', 'Accuracy', 'Satellites'].map((header, idx) => (
                        <TableCell
                          key={header}
                          sx={{
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                            width:
                              idx === 0
                                ? '6%'
                                : idx === 1
                                  ? '30%'
                                  : idx === 2
                                    ? '16%'
                                    : idx === 3
                                      ? '16%'
                                      : idx === 4
                                        ? '10%'
                                        : idx === 5
                                          ? '10%'
                                          : '12%',
                          }}
                          align="left"
                        >
                          {header}
                        </TableCell>
                      )))}
            </TableRow>
          </TableHead>
          <TableBody>
            {showVisits
              ? visits.map((v, idx) => (
                  <TableRow key={`${v.start.toISOString()}_${idx}`} hover>
                    <TableCell sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap', py: isMobile ? 0.75 : undefined, verticalAlign: isMobile ? 'top' : undefined }} align="left">
                      {idx + 1}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', py: isMobile ? 0.75 : undefined, verticalAlign: isMobile ? 'top' : undefined }} align="left">
                      {format(v.start, 'PPpp')}
                    </TableCell>
                    {isMobile ? (
                      <TableCell
                        align="left"
                        sx={{
                          whiteSpace: 'normal',
                          wordBreak: 'break-word',
                          py: 0.75,
                          verticalAlign: 'top',
                        }}
                      >
                        <Stack spacing={0.5}>
                          <Typography variant="caption" sx={{ fontFamily: 'monospace', lineHeight: 1.35 }}>
                            {v.centerLat.toFixed(6)}, {v.centerLng.toFixed(6)}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ lineHeight: 1.35 }}
                            title={addressCache[addressKeyFor(v.centerLat, v.centerLng)] || ''}
                          >
                            {addressLoading[addressKeyFor(v.centerLat, v.centerLng)]
                              ? 'Loading...'
                              : shortAddress(addressCache[addressKeyFor(v.centerLat, v.centerLng)] || 'Alamat tidak tersedia')}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', lineHeight: 1.35 }}>
                            {formatDuration(v.end.getTime() - v.start.getTime())}
                          </Typography>
                        </Stack>
                      </TableCell>
                    ) : (
                      <>
                        <TableCell sx={{ fontFamily: 'monospace' }} align="left">
                          {v.centerLat.toFixed(6)}
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'monospace' }} align="left">
                          {v.centerLng.toFixed(6)}
                        </TableCell>
                        <TableCell
                          sx={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          align="left"
                          title={addressCache[addressKeyFor(v.centerLat, v.centerLng)] || ''}
                        >
                          {addressLoading[addressKeyFor(v.centerLat, v.centerLng)]
                            ? 'Loading...'
                            : shortAddress(addressCache[addressKeyFor(v.centerLat, v.centerLng)] || 'Alamat tidak tersedia')}
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'monospace' }} align="left">
                          {formatDuration(v.end.getTime() - v.start.getTime())}
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                ))
              : pointRows.map((loc, idx) => {
                  const lat = (loc.location.coordinates as [number, number])[1];
                  const lng = (loc.location.coordinates as [number, number])[0];
                  const spd = typeof (loc as any).speed === 'number' ? (loc as any).speed : null;
                  const acc = typeof (loc as any).accuracy === 'number' ? (loc as any).accuracy : null;
                  const sats = typeof (loc as any).satellites === 'number' ? (loc as any).satellites : null;
                  return (
                    <TableRow key={`${loc.timestamp}_${idx}`} hover>
                      <TableCell sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap', py: isMobile ? 0.75 : undefined, verticalAlign: isMobile ? 'top' : undefined }} align="left">
                        {idx + 1}
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap', py: isMobile ? 0.75 : undefined, verticalAlign: isMobile ? 'top' : undefined }} align="left">
                        {format(new Date(loc.timestamp), 'PPpp')}
                      </TableCell>
                      {isMobile ? (
                        <TableCell align="left" sx={{ whiteSpace: 'normal', wordBreak: 'break-word', py: 0.75, verticalAlign: 'top' }}>
                          <Stack spacing={0.5}>
                            <Typography variant="caption" sx={{ fontFamily: 'monospace', lineHeight: 1.35 }}>
                              {lat.toFixed(6)}, {lng.toFixed(6)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.35 }}>
                              {`spd ${spd == null ? '-' : spd.toFixed(1)} · acc ${acc == null ? '-' : Math.round(acc)} · sat ${sats == null ? '-' : sats}`}
                            </Typography>
                          </Stack>
                        </TableCell>
                      ) : (
                        <>
                          <TableCell sx={{ fontFamily: 'monospace' }} align="left">
                            {lat.toFixed(6)}
                          </TableCell>
                          <TableCell sx={{ fontFamily: 'monospace' }} align="left">
                            {lng.toFixed(6)}
                          </TableCell>
                          <TableCell sx={{ fontFamily: 'monospace' }} align="left">
                            {spd == null ? '-' : `${spd.toFixed(1)}`}
                          </TableCell>
                          <TableCell sx={{ fontFamily: 'monospace' }} align="left">
                            {acc == null ? '-' : `${Math.round(acc)}`}
                          </TableCell>
                          <TableCell sx={{ fontFamily: 'monospace' }} align="left">
                            {sats == null ? '-' : `${sats}`}
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  );
                })}
            {showVisits && !visits.length && (
              <TableRow>
                <TableCell colSpan={isMobile ? 3 : 6} align="center">
                  <Typography variant="body2" color="text.secondary" py={3}>
                    No visits detected yet for this device.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {!showVisits && !pointRows.length && (
              <TableRow>
                <TableCell colSpan={isMobile ? 3 : 7} align="center">
                  <Typography variant="body2" color="text.secondary" py={3}>
                    No locations recorded yet for this device.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
};

export default LocationHistoryTable;
