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
import { apiService } from '../services/api';

type Role = 'user' | 'admin';

type UserRow = {
  id?: string;
  _id?: string;
  name?: string;
  email?: string;
  role?: Role;
  createdAt?: string;
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

  const isEditing = !!editTarget;

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
          <Alert severity="info">
            Master admin:
            <br />
            Email: <b>master@gps.com</b>
            <br />
            Password: <b>mastergps</b>
          </Alert>

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
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>
                Users
              </Typography>
              <Box sx={{ flexGrow: 1 }} />
              <Button size="small" variant="text" onClick={loadUsers} disabled={loading} sx={{ fontWeight: 800 }}>
                Refresh
              </Button>
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
