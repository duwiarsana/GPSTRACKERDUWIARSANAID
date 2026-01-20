export interface User {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
  createdAt: string;
}

export interface Device {
  id?: string;
  _id?: string;
  deviceId: string;
  name: string;
  description?: string;
  isActive: boolean;
  lastSeen?: string;
  currentLocation?: {
    type: 'Point';
    coordinates: [number, number];
    timestamp: string;
    speed?: number;
    accuracy?: number;
    battery?: {
      level: number;
      isCharging: boolean;
    };
    satellites?: number;
  };
  user: string | User;
  createdAt: string;
  updatedAt: string;
}

export interface LocationPoint {
  type: 'Point';
  coordinates: [number, number];
}

export interface Location {
  id?: string;
  _id?: string;
  device: string | Device;
  location: LocationPoint;
  speed?: number;
  accuracy?: number;
  battery?: {
    level: number;
    isCharging: boolean;
  };
  satellites?: number;
  timestamp: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceStats {
  deviceId: string;
  name: string;
  isActive: boolean;
  lastSeen?: string;
  currentLocation?: {
    type: 'Point';
    coordinates: [number, number];
    timestamp: string;
  };
  stats: {
    totalLocations: number;
    avgSpeed: number;
    maxSpeed: number;
    firstSeen: string;
    lastSeen: string;
  };
  trip24hKm?: number;
  latestLocation: {
    location: LocationPoint;
    timestamp: string;
  } | null;
}

export interface Pagination {
  next?: {
    page: number;
    limit: number;
  };
  prev?: {
    page: number;
    limit: number;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  count?: number;
  pagination?: Pagination;
  error?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData extends LoginCredentials {
  name: string;
  role?: 'user' | 'admin';
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
}

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
}

export interface RootState {
  auth: AuthState;
  device: DeviceState;
}
