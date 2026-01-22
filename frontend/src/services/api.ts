import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import type { LoginCredentials, RegisterData, Device, Location, DeviceStats } from '../types';

export const API_URL = (() => {
  const envUrl = process.env.REACT_APP_API_URL;
  if (envUrl) return envUrl;

  if (typeof window === 'undefined') {
    return 'http://localhost:5050/api/v1';
  }

  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  if (isLocal) {
    return `${window.location.protocol}//${host}:5050/api/v1`;
  }

  return `${window.location.origin}/api/v1`;
})();

class ApiService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: API_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Attach auth token
    this.api.interceptors.request.use((config) => {
      const token = localStorage.getItem('token');
      if (token) {
        (config.headers as any).Authorization = `Bearer ${token}`;
      }
      return config;
    });
  }

  // Auth endpoints
  async login(credentials: LoginCredentials): Promise<{ token: string; user: any }> {
    const { data } = await this.api.post('/auth/login', credentials);
    return data;
  }

  async register(userData: RegisterData): Promise<{ token: string; user: any }> {
    const { data } = await this.api.post('/auth/register', userData);
    return data;
  }

  async getCurrentUser(): Promise<any> {
    const { data } = await this.api.get('/auth/me');
    return data;
  }

  // Device endpoints
  async getDevices(params?: Record<string, any>): Promise<{ data: Device[]; count: number; pagination: any }> {
    const { data } = await this.api.get('/devices', { params });
    return data;
  }

  async getDevice(deviceId: string): Promise<Device> {
    const { data } = await this.api.get(`/devices/${deviceId}`);
    return data.data;
  }

  async createDevice(deviceData: Partial<Device>): Promise<Device> {
    const { data } = await this.api.post('/devices', deviceData);
    return data.data;
  }

  async updateDevice(deviceId: string, deviceData: Partial<Device>): Promise<Device> {
    const { data } = await this.api.put(`/devices/${deviceId}`, deviceData);
    return data.data;
  }

  async deleteDevice(deviceId: string): Promise<void> {
    await this.api.delete(`/devices/${deviceId}`);
  }

  // Location endpoints
  async getDeviceLocations(deviceId: string, params?: Record<string, any>): Promise<{ data: Location[]; count: number }> {
    const id = String(deviceId || '').trim();
    const isMongoId = id.length === 24 && /^[0-9a-fA-F]{24}$/.test(id);
    const primary = isMongoId ? `/devices/${id}/locations` : `/devices/by-device-id/${encodeURIComponent(id)}/locations`;
    const alternate = isMongoId ? `/devices/by-device-id/${encodeURIComponent(id)}/locations` : `/devices/${id}/locations`;
    // eslint-disable-next-line no-console
    console.debug('[api] getDeviceLocations primary', { id, isMongoId, url: primary });
    try {
      const res = await this.api.get(primary, { params });
      if (res?.data && Array.isArray(res.data.data) && res.data.data.length > 0) return res.data;
      // eslint-disable-next-line no-console
      console.debug('[api] getDeviceLocations alternate (empty)', alternate);
      const res2 = await this.api.get(alternate, { params });
      return res2.data;
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.debug('[api] getDeviceLocations alternate (error)', alternate, e?.response?.status);
      const res2 = await this.api.get(alternate, { params });
      return res2.data;
    }
  }

  async deleteDeviceLocations(deviceId: string, opts: { resetCurrent?: boolean } = {}): Promise<{ success: boolean; deleted: number; resetCurrent: boolean }> {
    const id = String(deviceId || '').trim();
    const isMongoId = id.length === 24 && /^[0-9a-fA-F]{24}$/.test(id);
    const q = { resetCurrent: opts.resetCurrent ? 'true' : 'false' } as any;
    const primary = isMongoId ? `/devices/${id}/locations` : `/devices/by-device-id/${encodeURIComponent(id)}/locations`;
    try {
      const { data } = await this.api.delete(primary, { params: q });
      return data;
    } catch (e: any) {
      const alternate = isMongoId ? `/devices/by-device-id/${encodeURIComponent(id)}/locations` : `/devices/${id}/locations`;
      const { data } = await this.api.delete(alternate, { params: q });
      return data;
    }
  }

  async deleteAllLocations(opts: { resetCurrent?: boolean } = {}): Promise<{ success: boolean; deleted: number; resetCurrent: boolean }> {
    const params = { resetCurrent: opts.resetCurrent ? 'true' : 'false' } as any;
    const { data } = await this.api.delete('/devices/locations', { params });
    return data;
  }

  // Device stats
  async getDeviceStats(deviceId: string): Promise<DeviceStats> {
    const id = String(deviceId || '').trim();
    const isMongoId = id.length === 24 && /^[0-9a-fA-F]{24}$/.test(id);
    const primary = isMongoId ? `/devices/${id}/stats` : `/devices/by-device-id/${encodeURIComponent(id)}/stats`;
    const alternate = isMongoId ? `/devices/by-device-id/${encodeURIComponent(id)}/stats` : `/devices/${id}/stats`;
    // eslint-disable-next-line no-console
    console.debug('[api] getDeviceStats primary', { id, isMongoId, url: primary });
    try {
      const { data } = await this.api.get(primary);
      return data.data;
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.debug('[api] getDeviceStats alternate (error)', alternate, e?.response?.status);
      const { data } = await this.api.get(alternate);
      return data.data;
    }
  }

  // Geofence endpoints
  async getDeviceGeofence(deviceId: string): Promise<any[] | null> {
    const { data } = await this.api.get(`/devices/${deviceId}/geofence`);
    return data.data || null;
  }

  async updateDeviceGeofence(deviceId: string, geofences: any[] | any | null): Promise<any[] | null> {
    const body = geofences === null
      ? { geofence: null }
      : Array.isArray(geofences)
        ? { geofences }
        : geofences;
    const { data } = await this.api.put(`/devices/${deviceId}/geofence`, body);
    return data.data || null;
  }

  // Send command to device
  async sendCommand(deviceId: string, command: string, payload: Record<string, any> = {}): Promise<boolean> {
    const { data } = await this.api.post(`/devices/${deviceId}/command`, { command, ...payload });
    return data.success;
  }

  // Generic request method for other API calls
  async request<T = any>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.api.request<T>(config);
  }
}

export const apiService = new ApiService();
