import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { Socket } from 'socket.io-client';
import { AppDispatch, RootState } from '../store/store';
import { updateDeviceLocation, applyHeartbeat, applyInactive } from '../store/slices/deviceSlice';
import { initSocket, getSocket, disconnectSocket } from '../utils/socket';

const useWebSocket = () => {
  const dispatch = useDispatch<AppDispatch>();
  const socketRef = useRef<Socket | null>(null);
  const { token, isAuthenticated } = useSelector((state: RootState) => state.auth);

  useEffect(() => {
    if (!isAuthenticated || !token) return;

    // Initialize WebSocket connection
    const socket = initSocket(token);
    socketRef.current = socket;

    // Connection established
    socket.on('connect', () => {
      console.log('[WS] Connected', { id: socket.id });
    });

    // Handle location updates
    socket.on('locationUpdate', (data: { deviceId: string; location: any }) => {
      try { console.debug('[WS] locationUpdate', { deviceId: data.deviceId, ts: data?.location?.timestamp }); } catch {}
      dispatch(updateDeviceLocation(data));
    });

    // Handle heartbeat updates
    socket.on('deviceHeartbeat', (data: { deviceId: string; lastSeen?: string }) => {
      try { console.debug('[WS] deviceHeartbeat', data); } catch {}
      dispatch(applyHeartbeat(data));
    });

    // Handle inactivity timeout
    socket.on('deviceInactive', (data: { deviceId: string; at?: string }) => {
      try { console.debug('[WS] deviceInactive', data); } catch {}
      dispatch(applyInactive(data));
    });

    // Handle connection errors
    socket.on('connect_error', (error: Error) => {
      console.error('[WS] connection error:', error);
    });

    // Clean up on unmount
    return () => {
      disconnectSocket();
    };
  }, [dispatch, isAuthenticated, token]);

  // Function to send a command to a device
  const sendCommand = (deviceId: string, command: string, payload: any = {}) => {
    const socket = getSocket();
    if (socket) {
      socket.emit('deviceCommand', { deviceId, command, payload });
      return true;
    }
    return false;
  };

  return { sendCommand };
};

export default useWebSocket;
