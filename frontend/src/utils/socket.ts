import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

function resolveSocketBaseUrl() {
  const envUrl = (process.env.REACT_APP_API_URL || '').trim();
  if (envUrl) {
    if (envUrl.startsWith('/') && typeof window !== 'undefined') {
      return window.location.origin;
    }
    try {
      const u = new URL(envUrl);
      // strip path like /api/v1
      return `${u.protocol}//${u.host}`;
    } catch {
      // fallback to provided string
      return envUrl;
    }
  }
  if (typeof window !== 'undefined') {
    const proto = window.location.protocol;
    const host = window.location.hostname;
    // Prefer current origin with backend port if known (defaults to 5050 from backend .env)
    return `${proto}//${host}:5050`;
  }
  return 'http://localhost:5050';
}

export const initSocket = (token: string): Socket => {
  if (!socket) {
    const base = resolveSocketBaseUrl();
    socket = io(base, {
      auth: { token },
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      withCredentials: false,
    });
  }
  return socket;
};

export const getSocket = (): Socket | null => {
  return socket;
};

export const disconnectSocket = (): void => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
