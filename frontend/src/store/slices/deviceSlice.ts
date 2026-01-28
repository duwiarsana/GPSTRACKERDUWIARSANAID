import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../store';
import { apiService } from '../../services/api';
import type { Device, Location, DeviceStats } from '../../types';
import { logout } from './authSlice';

export interface DeviceState {
  devices: Device[];
  currentDevice: Device | null;
  loading: boolean;
  error: string | null;
  stats: DeviceStats | null;
  locations: {
    data: Location[];
    loading: boolean;
    error: string | null;
  };
  realtimeUpdates: boolean;
}

const initialState: DeviceState = {
  devices: [],
  currentDevice: null,
  loading: false,
  error: null,
  stats: null,
  locations: {
    data: [],
    loading: false,
    error: null,
  },
  realtimeUpdates: true,
};

// Fetch all devices
export const fetchDevices = createAsyncThunk(
  'device/fetchDevices',
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await apiService.getDevices();
      return data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.error || 'Failed to fetch devices');
    }
  }
);

// Fetch single device
export const fetchDevice = createAsyncThunk(
  'device/fetchDevice',
  async (id: string, { rejectWithValue }) => {
    try {
      const device = await apiService.getDevice(id);
      return device;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.error || 'Failed to fetch device');
    }
  }
);

// Create device
export const createDevice = createAsyncThunk(
  'device/createDevice',
  async (deviceData: Partial<Device>, { rejectWithValue }) => {
    try {
      const device = await apiService.createDevice(deviceData);
      return device;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.error || 'Failed to create device');
    }
  }
);

// Update device
export const updateDevice = createAsyncThunk(
  'device/updateDevice',
  async ({ id, deviceData }: { id: string; deviceData: Partial<Device> }, { rejectWithValue }) => {
    try {
      const device = await apiService.updateDevice(id, deviceData);
      return device;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.error || 'Failed to update device');
    }
  }
);

// Delete device
export const deleteDevice = createAsyncThunk(
  'device/deleteDevice',
  async (id: string, { rejectWithValue }) => {
    try {
      await apiService.deleteDevice(id);
      return id;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.error || 'Failed to delete device');
    }
  }
);

// Fetch device locations
export const fetchDeviceLocations = createAsyncThunk(
  'device/fetchDeviceLocations',
  async (deviceId: string, { rejectWithValue }) => {
    try {
      const { data } = await apiService.getDeviceLocations(deviceId, { limit: 1000 });
      return { deviceId, data };
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.error || 'Failed to fetch device locations');
    }
  }
);

// Fetch device stats
export const fetchDeviceStats = createAsyncThunk(
  'device/fetchDeviceStats',
  async (deviceId: string, { rejectWithValue }) => {
    try {
      const stats = await apiService.getDeviceStats(deviceId);
      return stats;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.error || 'Failed to fetch device stats');
    }
  }
);

// Send command to device
export const sendDeviceCommand = createAsyncThunk(
  'device/sendCommand',
  async (
    { deviceId, command, payload }: { deviceId: string; command: string; payload?: any },
    { rejectWithValue }
  ) => {
    try {
      const success = await apiService.sendCommand(deviceId, command, payload);
      return { deviceId, command, success };
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.error || 'Failed to send command');
    }
  }
);

const deviceSlice = createSlice({
  name: 'device',
  initialState,
  reducers: {
    resetDeviceState: () => {
      return initialState;
    },
    clearDeviceError: (state) => {
      state.error = null;
    },
    clearLocations: (state) => {
      state.locations.data = [];
    },
    setCurrentDevice: (state, action: PayloadAction<Device | null>) => {
      state.currentDevice = action.payload;
    },
    updateDeviceLocation: (state, action: PayloadAction<{ deviceId: string; location: Location }>) => {
      const { deviceId, location } = action.payload;

      // Update current device if it's the one being updated (match by deviceId or id)
      if (
        state.currentDevice &&
        (state.currentDevice.deviceId === deviceId || state.currentDevice.id === deviceId)
      ) {
        state.currentDevice = {
          ...state.currentDevice,
          lastSeen: new Date().toISOString(),
          currentLocation: {
            type: 'Point',
            coordinates: [location.location.coordinates[0], location.location.coordinates[1]],
            timestamp: location.timestamp,
            speed: location.speed,
            battery: location.battery,
            accuracy: location.accuracy,
            altitude: location.altitude,
            satellites: location.satellites,
          },
          isActive: true,
        } as Device;
      }

      // Update in devices list (match by deviceId or id)
      const deviceIndex = state.devices.findIndex(
        (d) => d.deviceId === deviceId || d.id === deviceId
      );
      if (deviceIndex !== -1) {
        state.devices[deviceIndex] = {
          ...state.devices[deviceIndex],
          lastSeen: new Date().toISOString(),
          currentLocation: {
            type: 'Point',
            coordinates: [location.location.coordinates[0], location.location.coordinates[1]],
            timestamp: location.timestamp,
            speed: location.speed,
            battery: location.battery,
            accuracy: location.accuracy,
            altitude: location.altitude,
            satellites: location.satellites,
          },
          isActive: true,
        } as Device;
      }

      // Add to locations only if realtime updates are enabled AND this is the currently selected device
      if (
        state.realtimeUpdates &&
        state.currentDevice &&
        (state.currentDevice.deviceId === deviceId || state.currentDevice.id === deviceId)
      ) {
        state.locations.data = [location, ...state.locations.data].slice(0, 1000);
      }
    },
    applyInactive: (state, action: PayloadAction<{ deviceId: string; at?: string }>) => {
      const { deviceId } = action.payload;
      if (state.currentDevice && (state.currentDevice.deviceId === deviceId || state.currentDevice.id === deviceId)) {
        state.currentDevice = {
          ...state.currentDevice,
          isActive: false,
        } as Device;
      }
      const idx = state.devices.findIndex((d) => d.deviceId === deviceId || d.id === deviceId);
      if (idx !== -1) {
        state.devices[idx] = {
          ...state.devices[idx],
          isActive: false,
        } as Device;
      }
    },
    applyHeartbeat: (state, action: PayloadAction<{ deviceId: string; lastSeen?: string }>) => {
      const { deviceId, lastSeen } = action.payload;
      const iso = lastSeen || new Date().toISOString();
      if (state.currentDevice && (state.currentDevice.deviceId === deviceId || state.currentDevice.id === deviceId)) {
        state.currentDevice = {
          ...state.currentDevice,
          isActive: true,
          lastSeen: iso,
        } as Device;
      }
      const idx = state.devices.findIndex((d) => d.deviceId === deviceId || d.id === deviceId);
      if (idx !== -1) {
        state.devices[idx] = {
          ...state.devices[idx],
          isActive: true,
          lastSeen: iso,
        } as Device;
      }
    },
    toggleRealtimeUpdates: (state) => {
      state.realtimeUpdates = !state.realtimeUpdates;
    },
  },
  extraReducers: (builder) => {
    // Clear device state on logout (prevents cross-account cached device visibility)
    builder.addCase(logout.fulfilled, () => {
      return initialState;
    });

    // Fetch devices
    builder.addCase(fetchDevices.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(fetchDevices.fulfilled, (state, action: PayloadAction<Device[]>) => {
      state.loading = false;
      state.devices = action.payload;
    });
    builder.addCase(fetchDevices.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload as string;
    });

    // Fetch single device
    builder.addCase(fetchDevice.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(fetchDevice.fulfilled, (state, action: PayloadAction<Device>) => {
      state.loading = false;
      state.currentDevice = action.payload;
    });
    builder.addCase(fetchDevice.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload as string;
    });

    // Create device
    builder.addCase(createDevice.fulfilled, (state, action: PayloadAction<Device>) => {
      state.devices.push(action.payload);
    });

    // Update device
    builder.addCase(updateDevice.fulfilled, (state, action: PayloadAction<Device>) => {
      const index = state.devices.findIndex((d) => d.id === action.payload.id);
      if (index !== -1) {
        state.devices[index] = action.payload;
      }
      if (state.currentDevice?.id === action.payload.id) {
        state.currentDevice = action.payload;
      }
    });

    // Delete device
    builder.addCase(deleteDevice.fulfilled, (state, action: PayloadAction<string>) => {
      state.devices = state.devices.filter((d) => d.id !== action.payload);
      if (state.currentDevice?.id === action.payload) {
        state.currentDevice = null;
      }
    });

    // Fetch device locations
    builder.addCase(fetchDeviceLocations.pending, (state) => {
      state.locations.loading = true;
      state.locations.error = null;
    });
    builder.addCase(
      fetchDeviceLocations.fulfilled,
      (state, action: PayloadAction<{ deviceId: string; data: any }>) => {
        state.locations.loading = false;
        // Extract array from backend shape { success, count, data: Location[] }
        const rawArr: Location[] = Array.isArray(action.payload?.data?.data)
          ? (action.payload.data.data as Location[])
          : (Array.isArray(action.payload?.data) ? (action.payload.data as Location[]) : []);
        // Normalize: keep only valid coords and ensure timestamp fallback
        const isValid = (lat: number, lng: number) => isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
        const normalized = rawArr
          .map((l) => {
            const coords = (l as any)?.location?.coordinates as [number, number] | undefined;
            if (!coords || coords.length < 2) return null;
            const [lng, lat] = coords;
            if (!isValid(lat, lng)) return null;
            const tsRaw = (l as any).timestamp || (l as any).createdAt;
            const ts = tsRaw ? new Date(tsRaw).toISOString() : undefined;
            return ts ? ({ ...l, timestamp: ts } as Location) : null;
          })
          .filter((x): x is Location => !!x);
        // Ensure latest-first order (desc by timestamp)
        state.locations.data = normalized.sort(
          (a, b) => new Date((b as any).timestamp).getTime() - new Date((a as any).timestamp).getTime()
        );
        try {
          const n = state.locations.data.length;
          const firstTs = n > 0 ? state.locations.data[0].timestamp : null;
          const lastTs = n > 0 ? state.locations.data[n - 1].timestamp : null;
          // eslint-disable-next-line no-console
          console.debug('[deviceSlice] fetched locations:', {
            deviceId: action.payload.deviceId,
            count: n,
            backendCount: typeof action.payload?.data?.count === 'number' ? action.payload.data.count : undefined,
            newest: firstTs,
            oldest: lastTs,
          });
        } catch {}
      }
    );
    builder.addCase(fetchDeviceLocations.rejected, (state, action) => {
      state.locations.loading = false;
      state.locations.error = action.payload as string;
    });

    // Fetch device stats
    builder.addCase(fetchDeviceStats.fulfilled, (state, action: PayloadAction<DeviceStats>) => {
      state.stats = action.payload;
    });
  },
});

export const { resetDeviceState, clearDeviceError, clearLocations, setCurrentDevice, updateDeviceLocation, applyHeartbeat, applyInactive, toggleRealtimeUpdates } = deviceSlice.actions;

export const selectDevices = (state: RootState) => state.device.devices;
export const selectCurrentDevice = (state: RootState) => state.device.currentDevice;
export const selectDeviceLoading = (state: RootState) => state.device.loading;
export const selectDeviceError = (state: RootState) => state.device.error;
export const selectDeviceLocations = (state: RootState) => state.device.locations.data;
export const selectDeviceStats = (state: RootState) => state.device.stats;
export const selectRealtimeUpdates = (state: RootState) => state.device.realtimeUpdates;
export const selectDeviceLocationsState = (state: RootState) => state.device.locations;

export default deviceSlice.reducer;
