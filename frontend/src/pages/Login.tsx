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
  const [email, setEmail] = useState('admin@admin.com');
  const [password, setPassword] = useState('admin123');
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
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: 'background.default', p: 2, position: 'relative' }}>
      <Paper elevation={0} sx={{ width: 420, p: 5, borderRadius: 4, border: '1px solid rgba(255,255,255,0.08)' }}>
        <Stack spacing={3} component="form" onSubmit={handleSubmit}>
          <Stack spacing={0.5} textAlign="center">
            <Typography variant="h5" fontWeight={700}>GPS Tracker</Typography>
            <Typography variant="body2" color="text.secondary">Silakan login untuk melanjutkan</Typography>
          </Stack>

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
            InputProps={{ startAdornment: (<InputAdornment position="start"><EmailIcon fontSize="small" /></InputAdornment>) }}
          />

          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            fullWidth
            InputProps={{ startAdornment: (<InputAdornment position="start"><LockIcon fontSize="small" /></InputAdornment>) }}
          />

          <Button type="submit" variant="contained" size="large" disabled={loading}>
            {loading ? 'Signing in...' : 'Login'}
          </Button>
        </Stack>
      </Paper>
      <Box sx={{ position: 'absolute', bottom: 12, left: 16, opacity: 0.8 }}>
        <Typography variant="caption" color="text.secondary">© duwiarsana {new Date().getFullYear()}</Typography>
      </Box>
    </Box>
  );
};

export default LoginPage;
