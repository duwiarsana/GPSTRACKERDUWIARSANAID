import { useCallback, useState } from 'react';
import {
  Box,
  Paper,
  Stack,
  TextField,
  Button,
  Typography,
  InputAdornment,
  Alert,
} from '@mui/material';
import EmailIcon from '@mui/icons-material/Email';
import LockIcon from '@mui/icons-material/Lock';
import { useAppDispatch, useAppSelector } from '../store/store';
import { login, register, selectAuth } from '../store/slices/authSlice';
import type { RegisterData } from '../types';

const LoginPage: React.FC = () => {
  const dispatch = useAppDispatch();
  const { loading, error } = useAppSelector(selectAuth);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const isRegister = mode === 'register';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const getSignupLocation = useCallback(async (): Promise<{ lat: number; lng: number; accuracy?: number | null } | null> => {
    if (typeof window === 'undefined') return null;
    if (!('geolocation' in navigator)) return null;

    return await new Promise((resolve) => {
      try {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const lat = pos?.coords?.latitude;
            const lng = pos?.coords?.longitude;
            const accuracy = pos?.coords?.accuracy;
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return resolve(null);
            resolve({ lat, lng, accuracy: Number.isFinite(accuracy) ? accuracy : null });
          },
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 6000, maximumAge: 0 },
        );
      } catch {
        resolve(null);
      }
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (isRegister && !name.trim()) {
      setFormError('Nama wajib diisi');
      return;
    }

    if (!email || !password) {
      setFormError('Email dan password wajib diisi');
      return;
    }

    try {
      if (isRegister) {
        const signupLocation = await getSignupLocation();
        const payload: RegisterData = { name: name.trim(), email, password, signupLocation };
        await dispatch(register(payload));
      } else {
        await dispatch(login({ email, password }));
      }
    } catch (err) {
      // noop, error already in slice
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 2,
        position: 'relative',
        '@supports (height: 100dvh)': { minHeight: '100dvh' },
        '@supports (height: 100svh)': { minHeight: '100svh' },
      }}
    >
      <Paper
        elevation={0}
        sx={{
          width: '100%',
          maxWidth: 420,
          p: { xs: 3, sm: 5 },
          borderRadius: { xs: 3, sm: 4 },
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <Stack spacing={3} component="form" onSubmit={handleSubmit} autoComplete="off">
          <Stack spacing={0.5} textAlign="center">
            <Typography variant="h5" fontWeight={700}>GPS Tracker</Typography>
            <Typography variant="body2" color="text.secondary">
              {isRegister ? 'Buat akun untuk melanjutkan' : 'Silakan login untuk melanjutkan'}
            </Typography>
          </Stack>

          <Alert severity="info">
            Demo account:
            <br />
            Email: <b>demo@gps.com</b>
            <br />
            Password: <b>demogps</b>
          </Alert>

          {isRegister ? (
            <Alert severity="warning">
              Catatan: akun baru dibatasi maksimal <b>1 device</b>.
            </Alert>
          ) : null}

          {(formError || error) && (
            <Alert severity="error">{formError || error}</Alert>
          )}

          {isRegister ? (
            <TextField
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
              name="gps_name"
              autoComplete="off"
            />
          ) : null}

          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            fullWidth
            autoFocus
            name="gps_email"
            autoComplete="off"
            InputProps={{ startAdornment: (<InputAdornment position="start"><EmailIcon fontSize="small" /></InputAdornment>) }}
          />

          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            fullWidth
            name="gps_password"
            autoComplete="new-password"
            InputProps={{ startAdornment: (<InputAdornment position="start"><LockIcon fontSize="small" /></InputAdornment>) }}
          />

          <Button type="submit" variant="contained" size="large" disabled={loading}>
            {loading ? (isRegister ? 'Creating account...' : 'Signing in...') : (isRegister ? 'Daftar' : 'Login')}
          </Button>

          <Button
            type="button"
            variant="text"
            size="medium"
            disabled={loading}
            onClick={() => {
              setFormError(null);
              setMode((m) => (m === 'login' ? 'register' : 'login'));
            }}
          >
            {isRegister ? 'Sudah punya akun? Login' : 'Daftar'}
          </Button>
        </Stack>
      </Paper>
      <Box sx={{ position: 'absolute', bottom: 12, left: 16, opacity: 0.8, display: { xs: 'none', sm: 'block' } }}>
        <Typography variant="caption" color="text.secondary">© duwiarsana {new Date().getFullYear()}</Typography>
      </Box>
    </Box>
  );
};

export default LoginPage;
