import { useState } from 'react';
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
import { login, selectAuth } from '../store/slices/authSlice';

const LoginPage: React.FC = () => {
  const dispatch = useAppDispatch();
  const { loading, error } = useAppSelector(selectAuth);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!email || !password) {
      setFormError('Email dan password wajib diisi');
      return;
    }

    try {
      await dispatch(login({ email, password }));
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
            <Typography variant="body2" color="text.secondary">Silakan login untuk melanjutkan</Typography>
          </Stack>

          <Alert severity="info">
            Demo account:
            <br />
            Email: <b>demo@gps.com</b>
            <br />
            Password: <b>demogps</b>
          </Alert>

          {(formError || error) && (
            <Alert severity="error">{formError || error}</Alert>
          )}

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
            {loading ? 'Signing in...' : 'Login'}
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
