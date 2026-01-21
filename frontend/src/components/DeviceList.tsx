import { Paper, List, ListItemButton, ListItemAvatar, Avatar, ListItemText, Chip, Stack, Typography, CircularProgress, Box, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Alert, IconButton, Tooltip, Pagination } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import GpsFixedIcon from '@mui/icons-material/GpsFixed';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import SpeedRounded from '@mui/icons-material/SpeedRounded';
import SatelliteAltRounded from '@mui/icons-material/SatelliteAltRounded';
import HeightRounded from '@mui/icons-material/HeightRounded';
import BatteryChargingFullRounded from '@mui/icons-material/BatteryChargingFullRounded';
import Battery0BarRounded from '@mui/icons-material/Battery0BarRounded';
import Battery2BarRounded from '@mui/icons-material/Battery2BarRounded';
import Battery4BarRounded from '@mui/icons-material/Battery4BarRounded';
import Battery6BarRounded from '@mui/icons-material/Battery6BarRounded';
import BatteryFullRounded from '@mui/icons-material/BatteryFullRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import AddLocationAltRounded from '@mui/icons-material/AddLocationAltRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import type { Device } from '../types';
import { formatDistanceToNow } from 'date-fns';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiService, API_URL } from '../services/api';
import GeofenceEditor from './GeofenceEditor';

interface DeviceListProps {
  devices: Device[];
  selectedId?: string;
  onSelect: (deviceId: string) => void;
  loading?: boolean;
  containerSx?: SxProps<Theme>;
  onRefresh?: () => void;
  showPath?: boolean;
  pathDistanceKm?: number;
  pathDistanceLoading?: boolean;
}

const DeviceList: React.FC<DeviceListProps> = ({ devices, selectedId, onSelect, loading, containerSx, onRefresh, showPath = false, pathDistanceKm, pathDistanceLoading = false }) => {
  const mergeSx = (base: SxProps<Theme>): SxProps<Theme> =>
    containerSx ? ([...(Array.isArray(containerSx) ? containerSx : [containerSx]), base] as SxProps<Theme>) : base;

  const [open, setOpen] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Device | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 5;

  const [addressCache, setAddressCache] = useState<Record<string, string>>({});
  const [addressLoading, setAddressLoading] = useState<Record<string, boolean>>({});

  const addressKeyFor = useCallback((lat: number, lng: number) => {
    return `${lat.toFixed(5)},${lng.toFixed(5)}`;
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
      if (/^\d{5}$/.test(p)) break;
      head.push(p);
      if (head.length >= 4) break;
    }

    return head.length > 0 ? head.join(', ') : addr;
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
        .catch(() => {})
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

  // Geofence editor state
  const [geoOpen, setGeoOpen] = useState(false);
  const [geoDevice, setGeoDevice] = useState<Device | null>(null);
  const [geoPolygons, setGeoPolygons] = useState<any[] | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoSaving, setGeoSaving] = useState(false);

  // Edit device state
  const [editOpen, setEditOpen] = useState(false);
  const [editDevice, setEditDevice] = useState<Device | null>(null);
  const [editName, setEditName] = useState('');
  const [editDevId, setEditDevId] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(devices.length / pageSize));

  const pagedDevices = useMemo(() => {
    const start = (page - 1) * pageSize;
    return devices.slice(start, start + pageSize);
  }, [devices, page]);

  useEffect(() => {
    for (const device of pagedDevices) {
      const coords = (device as any)?.currentLocation?.coordinates as [number, number] | undefined;
      if (!coords || coords.length < 2) continue;
      const lat = Number(coords[1]);
      const lng = Number(coords[0]);
      if (!isFinite(lat) || !isFinite(lng)) continue;
      ensureAddress(lat, lng);
    }
  }, [pagedDevices, ensureAddress]);

  const handlePageChange = (_: unknown, value: number) => {
    setPage(value);
  };

  // Simple ray-casting point-in-polygon for GeoJSON Polygon (first ring)
  const isPointInsideGeofence = (coords?: [number, number], fences?: any | any[]): boolean | null => {
    if (!coords) return null;
    const list = Array.isArray(fences) ? fences : (fences ? [fences] : []);
    if (list.length === 0) return null;
    const [lng, lat] = coords;
    const insideOne = (polygon: any): boolean | null => {
      if (!polygon || polygon.type !== 'Polygon' || !Array.isArray(polygon.coordinates) || !polygon.coordinates[0]) return null;
      const ring: number[][] = polygon.coordinates[0]; // [[lng,lat], ...]
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        const intersect = ((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi + 0.0) + xi);
        if (intersect) inside = !inside;
      }
      return inside;
    };
    for (const g of list) {
      const r = insideOne(g);
      if (r === true) return true;
    }
    return false;
  };

  const handleOpenEdit = (device: Device) => {
    setEditDevice(device);
    setEditName(device.name || '');
    setEditDevId(device.deviceId || '');
    setEditError(null);
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editDevice) return;
    setEditSubmitting(true);
    setEditError(null);
    try {
      const id = (editDevice as any).id || (editDevice as any)._id;
      if (id) {
        await apiService.updateDevice(id, { name: editName, deviceId: editDevId });
        onRefresh && onRefresh();
      }
      setEditOpen(false);
    } catch (e: any) {
      setEditError(e?.response?.data?.error || 'Failed to update device');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleCreate = async () => {
    if (!deviceId || !name) {
      setError('Device ID and Name are required');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiService.createDevice({ deviceId, name });
      setOpen(false);
      setDeviceId('');
      setName('');
      onRefresh && onRefresh();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to create device');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestDelete = (device: Device) => {
    setDeleteTarget(device);
    setDeleteError(null);
  };

  const handleOpenGeofence = async (device: Device) => {
    setGeoDevice(device);
    setGeoOpen(true);
    setGeoLoading(true);
    setGeoPolygons(null);
    try {
      const id = device.id || device._id;
      if (id) {
        const data = await apiService.getDeviceGeofence(id);
        setGeoPolygons(data || null);
      }
    } catch (e) {
      // ignore fetch error; user can draw new polygon
    } finally {
      setGeoLoading(false);
    }
  };

  const handleSaveGeofence = async () => {
    if (!geoDevice) return;
    setGeoSaving(true);
    try {
      const id = geoDevice.id || geoDevice._id;
      if (id) {
        await apiService.updateDeviceGeofence(id, geoPolygons || null);
        onRefresh && onRefresh();
      }
      setGeoOpen(false);
    } catch (e) {
      // Surface minimal alert inline later if needed
      setGeoOpen(false);
    } finally {
      setGeoSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    let id = deleteTarget.id || deleteTarget._id;
    if (!id) {
      try {
        // Fallback: resolve by deviceId from the list endpoint
        const { data } = await apiService.getDevices();
        const found = (data || []).find((d: any) => d.deviceId === deleteTarget.deviceId);
        id = found?.id || found?._id;
      } catch (e) {
        // ignore, handled below
      }
      if (!id) {
        setDeleteError('Unable to resolve device internal id. Please refresh the page and try again.');
        return;
      }
    }
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await apiService.deleteDevice(id);
      if (selectedId === id) {
        onSelect('');
      }
      setDeleteTarget(null);
      onRefresh && onRefresh();
    } catch (e: any) {
      setDeleteError(e?.response?.data?.error || 'Failed to delete device');
    } finally {
      setDeleteLoading(false);
    }
  };

  if (loading) {
    return (
      <Paper elevation={0} sx={mergeSx({ p: 3, textAlign: 'center' })}>
        <CircularProgress size={32} />
        <Typography variant="subtitle1" sx={{ mt: 2 }}>
          Loading devices...
        </Typography>
      </Paper>
    );
  }

  if (!devices.length) {
    return (
      <Paper elevation={0} sx={mergeSx({})}>
        <Box px={2} pt={2} pb={1}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="subtitle1" fontWeight={600}>
              Devices
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip label={`0 total`} size="small" color="primary" variant="outlined" />
              <Button size="small" variant="contained" onClick={() => setOpen(true)}>Add Device</Button>
            </Stack>
          </Stack>
        </Box>
        <Box px={2} pb={2}>
          <Typography variant="h6" align="center">No devices yet</Typography>
          <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 1 }}>
            Register a device to start tracking locations.
          </Typography>
        </Box>
        <Dialog open={open} onClose={() => !submitting && setOpen(false)} fullWidth maxWidth="xs">
          <DialogTitle>Add Device</DialogTitle>
          <DialogContent sx={{ pt: 1, overflow: 'visible' }}>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <Stack spacing={2}>
              <TextField
                label="Device ID"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                fullWidth
                autoFocus
                disabled={submitting}
                variant="outlined"
                autoComplete="off"
                sx={{
                  '& .MuiOutlinedInput-root': { overflow: 'visible' },
                  '& .MuiOutlinedInput-notchedOutline': { overflow: 'visible' },
                  '& .MuiOutlinedInput-root > fieldset': { overflow: 'visible' },
                  '& .MuiInputLabel-root': { overflow: 'visible', zIndex: 2 },
                }}
              />
              <TextField
                label="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                fullWidth
                disabled={submitting}
                variant="outlined"
                autoComplete="off"
                sx={{
                  '& .MuiOutlinedInput-root': { overflow: 'visible' },
                  '& .MuiOutlinedInput-notchedOutline': { overflow: 'visible' },
                  '& .MuiOutlinedInput-root > fieldset': { overflow: 'visible' },
                  '& .MuiInputLabel-root': { overflow: 'visible', zIndex: 2 },
                }}
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
            <Button variant="contained" onClick={handleCreate} disabled={submitting}>Save</Button>
          </DialogActions>
        </Dialog>
      </Paper>
    );
  }

  return (
    <Paper elevation={0} sx={mergeSx({ pb: 2 })}>
      <Box px={2} pt={2} pb={1}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="subtitle1" fontWeight={600}>
            Devices
          </Typography>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Chip label={`${devices.length} total`} size="small" color="primary" variant="outlined" />
            {totalPages > 1 && (
              <Pagination
                count={totalPages}
                page={page}
                onChange={handlePageChange}
                size="small"
                siblingCount={0}
                boundaryCount={1}
                hidePrevButton
                hideNextButton
              />
            )}
            <Button size="small" variant="outlined" color="warning" disabled={!selectedId} onClick={async () => {
              if (!selectedId) return;
              const confirm = window.confirm('Hapus semua lokasi untuk device terpilih? OK: hapus + reset current, Cancel: hapus tanpa reset.');
              try {
                const res = await apiService.deleteDeviceLocations(selectedId, { resetCurrent: confirm });
                onRefresh && onRefresh();
                // eslint-disable-next-line no-alert
                alert(`Deleted ${res.deleted} locations${res.resetCurrent ? ' and reset currentLocation' : ''}.`);
              } catch (e: any) {
                // eslint-disable-next-line no-alert
                alert(`Gagal hapus locations: ${e?.response?.data?.error || e?.message || 'Unknown error'}`);
              }
            }}>Clear Selected History</Button>
            <Button size="small" variant="outlined" color="error" onClick={async () => {
              const proceed = window.confirm('ADMIN ONLY: Hapus SEMUA data lokasi untuk semua device? Klik OK untuk lanjut.');
              if (!proceed) return;
              const reset = window.confirm('Juga reset current location untuk semua device? OK untuk ya, Cancel untuk tidak.');
              try {
                const res = await apiService.deleteAllLocations({ resetCurrent: reset });
                onRefresh && onRefresh();
                // eslint-disable-next-line no-alert
                alert(`Deleted ${res.deleted} locations total${res.resetCurrent ? ' and reset currentLocation for all devices' : ''}.`);
              } catch (e: any) {
                // eslint-disable-next-line no-alert
                alert(`Gagal hapus semua data: ${e?.response?.data?.error || e?.message || 'Unknown error'}`);
              }
            }}>Clear ALL Data</Button>
            <Button size="small" variant="contained" onClick={() => setOpen(true)}>Add Device</Button>
          </Stack>
        </Stack>
      </Box>
      {/* Edit device dialog */}
      <Dialog open={editOpen} onClose={() => !editSubmitting && setEditOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Edit Device</DialogTitle>
        <DialogContent sx={{ pt: 1, overflow: 'visible' }}>
          {editError && <Alert severity="error" sx={{ mb: 2 }}>{editError}</Alert>}
          <Stack spacing={2}>
            <TextField
              label="Name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              fullWidth
              disabled={editSubmitting}
              variant="outlined"
              autoComplete="off"
              sx={{
                '& .MuiOutlinedInput-root': { overflow: 'visible' },
                '& .MuiOutlinedInput-notchedOutline': { overflow: 'visible' },
                '& .MuiOutlinedInput-root > fieldset': { overflow: 'visible' },
                '& .MuiInputLabel-root': { overflow: 'visible', zIndex: 2 },
              }}
            />
            <TextField
              label="Device ID"
              value={editDevId}
              onChange={(e) => setEditDevId(e.target.value)}
              fullWidth
              disabled={editSubmitting}
              variant="outlined"
              autoComplete="off"
              sx={{
                '& .MuiOutlinedInput-root': { overflow: 'visible' },
                '& .MuiOutlinedInput-notchedOutline': { overflow: 'visible' },
                '& .MuiOutlinedInput-root > fieldset': { overflow: 'visible' },
                '& .MuiInputLabel-root': { overflow: 'visible', zIndex: 2 },
              }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)} disabled={editSubmitting}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveEdit} disabled={editSubmitting}>{editSubmitting ? 'Saving…' : 'Save'}</Button>
        </DialogActions>
      </Dialog>
      <List disablePadding dense>
        {pagedDevices.map((device) => {
          const id = device.id || device._id || device.deviceId;
          const lastSeen = device.lastSeen ? formatDistanceToNow(new Date(device.lastSeen), { addSuffix: true }) : 'Unknown';
          const coords = (device as any)?.currentLocation?.coordinates as [number, number] | undefined; // [lng, lat]
          const geofence = (device as any)?.geofence as any | undefined;
          const inside = geofence ? isPointInsideGeofence(coords, geofence) : null;
          const isOutside = device.isActive && inside === false;
          const latlngStr = (() => {
            try {
              if (!coords || coords.length < 2) return null;
              const lat = Number(coords[1]);
              const lng = Number(coords[0]);
              if (!isFinite(lat) || !isFinite(lng)) return null;
              return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
            } catch { return null; }
          })();
          const addrKey = (() => {
            try {
              if (!coords || coords.length < 2) return null;
              const lat = Number(coords[1]);
              const lng = Number(coords[0]);
              if (!isFinite(lat) || !isFinite(lng)) return null;
              return addressKeyFor(lat, lng);
            } catch {
              return null;
            }
          })();
          const addr = addrKey ? addressCache[addrKey] : null;
          const addrBusy = addrKey ? addressLoading[addrKey] : false;
          return (
            <ListItemButton
              key={id}
              selected={id === selectedId}
              onClick={() => onSelect(id)}
              sx={{ px: 2, py: 0.75, alignItems: 'flex-start' }}
            >
              <ListItemAvatar sx={{ mt: 0.75 }}>
                <Avatar variant="rounded" sx={{ bgcolor: 'primary.main', width: 32, height: 32 }}>
                  <GpsFixedIcon fontSize="small" />
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={
                  <Stack spacing={0} sx={{ width: '100%' }}>
                    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ width: '100%' }}>
                      <Typography variant="body1" fontWeight={600} sx={{ lineHeight: 1.2 }}>
                        {device.name}
                      </Typography>
                      <Tooltip title="Edit device">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleOpenEdit(device);
                          }}
                          sx={{ ml: 0.25 }}
                        >
                          <EditRounded fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Chip
                        size="small"
                        label={device.isActive ? 'Active' : 'Inactive'}
                        icon={<PowerSettingsNewIcon fontSize="inherit" />}
                        color={device.isActive ? (isOutside ? 'error' : 'success') : 'default'}
                        variant={device.isActive ? 'filled' : 'outlined'}
                      />
                      <Box sx={{ flexGrow: 1 }} />
                      {latlngStr && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap', fontSize: 12, lineHeight: 1.25 }}
                        >
                          {latlngStr}
                        </Typography>
                      )}
                    </Stack>

                    <Stack direction="row" alignItems="flex-start" sx={{ width: '100%' }}>
                      <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.15 }}>
                        Device ID: {device.deviceId}
                      </Typography>
                      <Box sx={{ flexGrow: 1 }} />
                      {(addr || addrBusy || (showPath && id === selectedId)) && (
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', textAlign: 'right' }}>
                          {addr && (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              title={addr}
                              sx={{
                                maxWidth: 360,
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'normal',
                                lineHeight: 1.25,
                              }}
                            >
                              {shortAddress(addr)}
                            </Typography>
                          )}
                          {!addr && addrBusy && (
                            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.25 }}>
                              Mengambil alamat…
                            </Typography>
                          )}
                          {showPath && id === selectedId ? (
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25, lineHeight: 1.25 }}>
                              {pathDistanceLoading
                                ? 'Jarak: ...'
                                : `Jarak: ${(typeof pathDistanceKm === 'number' && isFinite(pathDistanceKm) ? pathDistanceKm : 0).toFixed(2)} km`}
                            </Typography>
                          ) : null}
                        </Box>
                      )}
                    </Stack>
                  </Stack>
                }
                primaryTypographyProps={{ component: 'div' }}
                secondary={
                  <Stack spacing={0.25} sx={{ mt: 0.25 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12, lineHeight: 1.25 }}>
                        Last seen {lastSeen}
                      </Typography>
                      <Stack direction="row" spacing={1.25} alignItems="center">
                        {/* Speed */}
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <SpeedRounded fontSize="small" color="action" />
                          <Typography variant="body2" color="text.secondary">
                            {device.isActive && typeof device.currentLocation?.speed === 'number' ? `${device.currentLocation.speed.toFixed(1)} km/h` : '-'}
                          </Typography>
                        </Stack>
                        {/* Satellites */}
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <SatelliteAltRounded fontSize="small" color="action" />
                          <Typography variant="body2" color="text.secondary">
                            {device.isActive && typeof device.currentLocation?.satellites === 'number' ? `${device.currentLocation.satellites}` : '-'}
                          </Typography>
                        </Stack>
                        {/* Altitude */}
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <HeightRounded fontSize="small" color="action" />
                          <Typography variant="body2" color="text.secondary">
                            {device.isActive && typeof device.currentLocation?.altitude === 'number'
                              ? `${Number(device.currentLocation.altitude).toFixed(0)} m`
                              : '-'}
                          </Typography>
                        </Stack>
                        {/* Battery with color-coded icon */}
                        {(() => {
                          const active = !!device.isActive;
                          const level = active && typeof device.currentLocation?.battery?.level === 'number' ? Math.round(device.currentLocation.battery.level) : null;
                          const charging = active && !!device.currentLocation?.battery?.isCharging;
                          const color = !active || level == null ? 'text.secondary' : level < 20 ? 'error.main' : level < 50 ? 'warning.main' : 'success.main';
                          const Icon = (() => {
                            if (charging) return BatteryChargingFullRounded;
                            if (level == null) return Battery4BarRounded;
                            if (level < 5) return Battery0BarRounded;
                            if (level < 25) return Battery2BarRounded;
                            if (level < 60) return Battery4BarRounded;
                            if (level < 85) return Battery6BarRounded;
                            return BatteryFullRounded;
                          })();
                          return (
                            <Stack direction="row" spacing={0.5} alignItems="center">
                              <Box sx={{ color }}>
                                <Icon fontSize="small" />
                              </Box>
                              <Typography variant="body2" color="text.secondary">
                                {level == null ? '-' : `${level}%${charging ? '⚡' : ''}`}
                              </Typography>
                            </Stack>
                          );
                        })()}

                        <Tooltip title="Edit geofence">
                          <IconButton
                            size="small"
                            color="warning"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleOpenGeofence(device);
                            }}
                          >
                            <AddLocationAltRounded fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete device">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleRequestDelete(device);
                            }}
                          >
                            <DeleteOutlineRounded fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </Box>
                  </Stack>
                }
                secondaryTypographyProps={{ component: 'div' }}
              />
            </ListItemButton>
          );
        })}
      </List>
      {totalPages > 1 && (
        <Box px={2} py={1.5} display="flex" justifyContent="center">
          <Pagination
            count={totalPages}
            page={page}
            onChange={handlePageChange}
            color="primary"
            size="small"
            siblingCount={0}
            boundaryCount={1}
          />
        </Box>
      )}
      {/* Geofence fullscreen editor */}
      <Dialog
        fullScreen
        open={geoOpen}
        onClose={() => !geoSaving && setGeoOpen(false)}
        PaperProps={{ sx: { bgcolor: 'transparent', backgroundImage: 'none' } }}
      >
        <DialogContent sx={{ p: 0, height: '100%', bgcolor: 'transparent', position: 'relative' }}>
          {/* Overlay controls on top of the map */}
          <Box
            sx={{
              position: 'absolute',
              top: 16,
              left: 16,
              right: 16,
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              p: 1,
              borderRadius: 2,
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              background: 'linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.10))',
              border: '1px solid rgba(255,255,255,0.25)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.25)'
            }}
          >
            <Typography variant="subtitle1" fontWeight={600}>
              {geoDevice?.name || geoDevice?.deviceId || 'Device'} – Geofence
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button onClick={() => setGeoOpen(false)} disabled={geoSaving}>Cancel</Button>
              <Button color="warning" variant="outlined" onClick={() => setGeoPolygons(null)} disabled={geoSaving}>Clear</Button>
              <Button variant="contained" onClick={handleSaveGeofence} disabled={geoSaving}>{geoSaving ? 'Saving…' : 'Save'}</Button>
            </Stack>
          </Box>
          {/* Full-bleed map */}
          <Box sx={{ width: '100%', height: '100vh' }}>
            {!geoLoading && (
              <GeofenceEditor polygons={geoPolygons} onChange={setGeoPolygons} />
            )}
            {geoLoading && (
              <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CircularProgress />
              </Box>
            )}
          </Box>
        </DialogContent>
      </Dialog>
      <Dialog open={open} onClose={() => !submitting && setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Add Device</DialogTitle>
        <DialogContent sx={{ pt: 1, overflow: 'visible' }}>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Stack spacing={2}>
            <TextField
              label="Device ID"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              fullWidth
              autoFocus
              disabled={submitting}
              variant="outlined"
              autoComplete="off"
              sx={{
                '& .MuiOutlinedInput-root': { overflow: 'visible' },
                '& .MuiOutlinedInput-notchedOutline': { overflow: 'visible' },
                '& .MuiOutlinedInput-root > fieldset': { overflow: 'visible' },
                '& .MuiInputLabel-root': { overflow: 'visible', zIndex: 2 },
              }}
            />
            <TextField
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
              disabled={submitting}
              variant="outlined"
              autoComplete="off"
              sx={{
                '& .MuiOutlinedInput-root': { overflow: 'visible' },
                '& .MuiOutlinedInput-notchedOutline': { overflow: 'visible' },
                '& .MuiOutlinedInput-root > fieldset': { overflow: 'visible' },
                '& .MuiInputLabel-root': { overflow: 'visible', zIndex: 2 },
              }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={submitting}>Save</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={!!deleteTarget} onClose={() => !deleteLoading && setDeleteTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle>Delete Device</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          {deleteError && <Alert severity="error" sx={{ mb: 2 }}>{deleteError}</Alert>}
          <Typography variant="body2" color="text.secondary">
            Are you sure you want to delete
            {' '}
            <Typography component="span" fontWeight={600} color="text.primary">
              {deleteTarget?.name || deleteTarget?.deviceId}
            </Typography>
            {' '}device? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleteLoading}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDelete} disabled={deleteLoading}>
            {deleteLoading ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default DeviceList;
