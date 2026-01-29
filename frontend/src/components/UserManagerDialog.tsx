import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { apiService } from '../services/api';

const parseSignupLocation = (raw: any): { lat: number; lng: number; accuracy?: number | null; source?: string; timestamp?: string } | null => {
  if (!raw) return null;
  try {
    const loc = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!loc || typeof loc !== 'object') return null;
    const lat = Number((loc as any)?.lat);
    const lng = Number((loc as any)?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return loc as any;
  } catch {
    return null;
  }
};

const InvalidateSize: React.FC<{ tick: any }> = ({ tick }) => {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const t = window.setTimeout(() => {
      map.invalidateSize();
    }, 0);
    return () => window.clearTimeout(t);
  }, [map, tick]);
  return null;
};

const FitBounds: React.FC<{ points: { lat: number; lng: number }[] }> = ({ points }) => {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    if (!points.length) return;
    const t = window.setTimeout(() => {
      map.invalidateSize();
      const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
      map.fitBounds(bounds, { padding: [30, 30] });
    }, 0);
    return () => window.clearTimeout(t);
  }, [map, points]);
  return null;
};

type Role = 'user' | 'admin';

type UserRow = {
  id?: string;
  _id?: string;
  name?: string;
  email?: string;
  role?: Role;
  createdAt?: string;
  signupIp?: string | null;
  signupLocation?: { lat: number; lng: number; accuracy?: number | null; source?: string; timestamp?: string } | null;
  signupUserAgent?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  currentUserEmail?: string | null;
};

const UserManagerDialog: React.FC<Props> = ({ open, onClose, currentUserEmail }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);

  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<Role>('user');

  const [editTarget, setEditTarget] = useState<UserRow | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editRole, setEditRole] = useState<Role>('user');

  const [signupMapOpen, setSignupMapOpen] = useState(false);

  const isEditing = !!editTarget;

  const signupRows = useMemo(() => {
    const rows = (users || [])
      .map((u) => {
        const loc = parseSignupLocation((u as any)?.signupLocation);
        const lat = Number(loc?.lat);
        const lng = Number(loc?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return { user: u, lat, lng };
      })
      .filter((v): v is { user: UserRow; lat: number; lng: number } => !!v);
    return rows;
  }, [users]);

  const editId = useMemo(() => {
    const u = editTarget as any;
    return (u?.id || u?._id || '') as string;
  }, [editTarget]);

  const loadUsers = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiService.request<any>({
        url: '/users',
        method: 'GET',
        params: { sort: '-createdAt', limit: 200 },
      });
      const rows = Array.isArray(res?.data?.data) ? res.data.data : [];
      setUsers(rows);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    loadUsers();
  }, [open, loadUsers]);

  const handleCreate = async () => {
    setError(null);
    if (!newName.trim() || !newEmail.trim() || !newPassword.trim()) {
      setError('Name, email, and password are required');
      return;
    }

    setLoading(true);
    try {
      await apiService.request({
        url: '/users',
        method: 'POST',
        data: { name: newName.trim(), email: newEmail.trim(), password: newPassword, role: newRole },
      });
      setNewName('');
      setNewEmail('');
      setNewPassword('');
      setNewRole('user');
      await loadUsers();
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenEdit = (u: UserRow) => {
    setError(null);
    setEditTarget(u);
    setEditName(u?.name || '');
    setEditEmail(u?.email || '');
    setEditRole((u?.role as Role) || 'user');
    setEditPassword('');
  };

  const handleCancelEdit = () => {
    setEditTarget(null);
    setEditName('');
    setEditEmail('');
    setEditPassword('');
    setEditRole('user');
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    setError(null);
    if (!editName.trim() || !editEmail.trim()) {
      setError('Name and email are required');
      return;
    }

    const payload: any = { name: editName.trim(), email: editEmail.trim(), role: editRole };
    if (editPassword.trim()) payload.password = editPassword;

    setLoading(true);
    try {
      await apiService.request({
        url: `/users/${encodeURIComponent(editId)}`,
        method: 'PUT',
        data: payload,
      });
      handleCancelEdit();
      await loadUsers();
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Failed to update user');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (u: UserRow) => {
    const email = u?.email || '';
    const id = ((u as any)?.id || (u as any)?._id || '') as string;
    if (!id) return;

    const ok = window.confirm(`Delete user: ${email || id}? This will also delete devices/locations owned by the user.`);
    if (!ok) return;

    setLoading(true);
    setError(null);
    try {
      await apiService.request({ url: `/users/${encodeURIComponent(id)}`, method: 'DELETE' });
      await loadUsers();
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Failed to delete user');
    } finally {
      setLoading(false);
    }
  };

  const canDelete = (u: UserRow) => {
    const email = (u?.email || '').toLowerCase();
    const selfEmail = (currentUserEmail || '').toLowerCase();
    if (selfEmail && email && selfEmail === email) return false;
    return true;
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>User Manager</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error ? <Alert severity="error">{error}</Alert> : null}

          <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
            <Stack spacing={1.25}>
              <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>
                Create User
              </Typography>
              <TextField label="Name" size="small" value={newName} onChange={(e) => setNewName(e.target.value)} fullWidth />
              <TextField label="Email" size="small" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} fullWidth />
              <TextField label="Password" size="small" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} fullWidth />
              <TextField label="Role" size="small" select value={newRole} onChange={(e) => setNewRole(e.target.value as Role)} fullWidth>
                <MenuItem value="user">user</MenuItem>
                <MenuItem value="admin">admin</MenuItem>
              </TextField>
              <Button variant="contained" onClick={handleCreate} disabled={loading} sx={{ fontWeight: 900 }}>
                Create
              </Button>
            </Stack>
          </Paper>

          {isEditing ? (
            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
              <Stack spacing={1.25}>
                <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>
                  Edit User
                </Typography>
                <TextField label="Name" size="small" value={editName} onChange={(e) => setEditName(e.target.value)} fullWidth />
                <TextField label="Email" size="small" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} fullWidth />
                <TextField label="New Password (optional)" size="small" type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} fullWidth />
                <TextField label="Role" size="small" select value={editRole} onChange={(e) => setEditRole(e.target.value as Role)} fullWidth>
                  <MenuItem value="user">user</MenuItem>
                  <MenuItem value="admin">admin</MenuItem>
                </TextField>
                <Stack direction="row" spacing={1}>
                  <Button variant="contained" onClick={handleSaveEdit} disabled={loading} sx={{ fontWeight: 900, flex: 1 }}>
                    Save
                  </Button>
                  <Button variant="text" onClick={handleCancelEdit} disabled={loading} sx={{ fontWeight: 800, flex: 1 }}>
                    Cancel
                  </Button>
                </Stack>
              </Stack>
            </Paper>
          ) : null}

          <Divider />

          <Stack spacing={1}>
            <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'stretch', sm: 'center' }} spacing={1}>
              <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>
                Users
              </Typography>
              <Box sx={{ flexGrow: 1 }} />
              <Stack direction="row" spacing={1} justifyContent={{ xs: 'flex-end', sm: 'flex-end' }}>
                <Button size="small" variant="text" onClick={loadUsers} disabled={loading} sx={{ fontWeight: 800 }}>
                  Refresh
                </Button>
                <Button
                  size="small"
                  variant="text"
                  onClick={() => setSignupMapOpen(true)}
                  disabled={loading}
                  sx={{ fontWeight: 800 }}
                >
                  View Signup Map
                </Button>
              </Stack>
            </Stack>

            {loading ? (
              <Typography variant="body2" color="text.secondary">
                Loading...
              </Typography>
            ) : null}

            {users.map((u) => {
              const id = ((u as any)?.id || (u as any)?._id || '') as string;
              const label = `${u?.name || 'User'} (${u?.role || 'user'})`;
              const secondary = u?.email || id;
              const loc = parseSignupLocation((u as any)?.signupLocation) as any;
              const hasLoc = loc && Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lng));
              return (
                <Paper key={id || secondary} variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}>
                  <Stack direction="row" spacing={1.25} alignItems="center">
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 900 }} noWrap>
                        {label}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {secondary}
                      </Typography>
                      {(u as any)?.signupIp ? (
                        <Typography variant="caption" color="text.secondary" noWrap>
                          IP: {(u as any)?.signupIp}
                        </Typography>
                      ) : null}
                      {hasLoc ? (
                        <Typography variant="caption" color="text.secondary" noWrap>
                          Signup: {Number(loc.lat).toFixed(5)}, {Number(loc.lng).toFixed(5)}
                        </Typography>
                      ) : null}
                    </Box>
                    <Box sx={{ flexGrow: 1 }} />
                    <Stack direction="row" spacing={1}>
                      <Button size="small" variant="text" onClick={() => handleOpenEdit(u)} sx={{ fontWeight: 800 }}>
                        Edit
                      </Button>
                      <Button
                        size="small"
                        variant="text"
                        color="error"
                        disabled={!canDelete(u)}
                        onClick={() => handleDelete(u)}
                        sx={{ fontWeight: 800 }}
                      >
                        Delete
                      </Button>
                    </Stack>
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
        </Stack>

        <Dialog open={signupMapOpen} onClose={() => setSignupMapOpen(false)} fullWidth maxWidth="md">
          <DialogTitle>Signup Locations</DialogTitle>
          <DialogContent>
            {signupRows.length === 0 ? (
              <Alert severity="info">Tidak ada data lokasi signup yang tersimpan.</Alert>
            ) : null}
            <Box sx={{ height: 420, width: '100%', borderRadius: 2, overflow: 'hidden', mt: signupRows.length === 0 ? 1.5 : 0 }}>
              <MapContainer center={[-6.2, 106.816666]} zoom={5} style={{ height: '100%', width: '100%' }}>
                <InvalidateSize tick={signupMapOpen} />
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <FitBounds points={signupRows.map((r) => ({ lat: r.lat, lng: r.lng }))} />
                {signupRows.map((r) => {
                  const u = r.user as any;
                  const title = `${u?.name || 'User'} (${u?.email || ''})`;
                  return (
                    <CircleMarker key={(u?.id || u?._id || u?.email || title) as string} center={[r.lat, r.lng]} radius={8} pathOptions={{ color: '#1976d2' }}>
                      <Popup>
                        <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>
                          {title}
                        </Typography>
                        {u?.signupIp ? (
                          <Typography variant="caption" color="text.secondary">
                            IP: {u.signupIp}
                          </Typography>
                        ) : null}
                        <br />
                        <Typography variant="caption" color="text.secondary">
                          {r.lat.toFixed(5)}, {r.lng.toFixed(5)}
                        </Typography>
                      </Popup>
                    </CircleMarker>
                  );
                })}
              </MapContainer>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setSignupMapOpen(false)} sx={{ fontWeight: 900 }}>
              Close
            </Button>
          </DialogActions>
        </Dialog>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ fontWeight: 900 }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default UserManagerDialog;
