const { getIO } = require('./socket');
const logger = require('./logger');
const telegram = require('../services/telegramService');
const Device = require('../models/Device');

// Map of deviceId -> timeout handle
const timers = new Map();

// In-memory state: deviceId -> { inactive: boolean, lastInactiveAlertAt: number, lastActiveAlertAt: number }
const states = new Map();

const addressCache = new Map();
const ADDRESS_TTL_MS = 24 * 60 * 60 * 1000;

function addressKeyFor(lat, lng) {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

function escapeHtml(input) {
  const s = String(input ?? '');
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function shortAddress(addr) {
  const parts = String(addr)
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  const stop = new Set([
    'Indonesia',
    'Jawa',
    'Jawa Barat',
    'Jawa Tengah',
    'Jawa Timur',
    'Daerah Khusus Ibukota Jakarta',
    'DKI Jakarta',
  ]);

  const head = [];
  for (const p of parts) {
    if (stop.has(p)) break;
    if (/^\d{5}$/.test(p)) break;
    head.push(p);
    if (head.length >= 6) break;
  }

  return head.length > 0 ? head.join(', ') : String(addr);
}

async function reverseGeocode(lat, lng) {
  try {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (typeof fetch !== 'function') return null;

    const key = addressKeyFor(lat, lng);
    const cached = addressCache.get(key);
    if (cached && cached.value && Date.now() - cached.ts < ADDRESS_TTL_MS) return cached.value;

    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
      lat,
    )}&lon=${encodeURIComponent(lng)}&zoom=18&addressdetails=1`;

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': process.env.NOMINATIM_USER_AGENT || 'gpstracker-backend/1.0 (device-inactive)',
        },
        signal: ctrl.signal,
      });

      if (!res.ok) return null;
      const data = await res.json();
      const display =
        typeof data?.display_name === 'string' && data.display_name.trim().length > 0
          ? data.display_name.trim()
          : null;

      if (display) addressCache.set(key, { value: display, ts: Date.now() });
      return display;
    } finally {
      clearTimeout(t);
    }
  } catch {
    return null;
  }
}

function getTimeoutMs() {
  const ms = parseInt(process.env.DEVICE_INACTIVE_TIMEOUT_MS || '300000', 10);
  return Number.isFinite(ms) ? ms : 300000;
}

function getInactiveCooldownMs() {
  const mins = parseInt(process.env.TELEGRAM_DEVICE_INACTIVE_COOLDOWN_MINUTES || '10', 10);
  return Number.isFinite(mins) ? Math.max(0, mins) * 60 * 1000 : 600000;
}

function shouldCooldown(prevTs, cooldownMs) {
  if (!prevTs) return false;
  return Date.now() - prevTs < cooldownMs;
}

function buildLinks(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return '';
  const latFix = lat.toFixed(6);
  const lngFix = lng.toFixed(6);
  const gmaps = `https://maps.google.com/?q=${latFix},${lngFix}`;
  return `\n<a href="${gmaps}">Open in Google Maps</a>`;
}

async function notify(text) {
  const chatId = process.env.TELEGRAM_DEFAULT_CHAT_ID;
  if (!chatId) {
    try { logger.warn('[inactivity] TELEGRAM_DEFAULT_CHAT_ID not set; skipping telegram alert'); } catch {}
    return;
  }
  try {
    try { logger.info('[inactivity] sending telegram alert'); } catch {}
    await telegram.sendMessage(chatId, text, { timeoutMs: 10000 });
    try { logger.info('[inactivity] telegram alert sent'); } catch {}
  } catch (e) {
    try { logger.error(`Inactive notify failed: ${e.message}`); } catch {}
  }
}

function clearTimer(deviceId) {
  const t = timers.get(deviceId);
  if (t) {
    clearTimeout(t);
    timers.delete(deviceId);
  }
}

function scheduleInactive(deviceId, delayMs) {
  clearTimer(deviceId);
  const timeoutMs = Number.isFinite(delayMs) ? Math.max(0, delayMs) : getTimeoutMs();
  const handle = setTimeout(async () => {
    try { logger.info(`[inactivity] timer fired for deviceId=${deviceId}`); } catch {}
    try {
      const io = getIO();
      io.emit('deviceInactive', { deviceId, at: new Date().toISOString() });
    } catch {}
    // mark inactive and send telegram (with cooldown)
    const now = Date.now();
    const s = states.get(deviceId) || { inactive: false, lastInactiveAlertAt: 0, lastActiveAlertAt: 0 };
    s.inactive = true;
    if (!shouldCooldown(s.lastInactiveAlertAt, getInactiveCooldownMs())) {
      // fetch last known coords for link
      let linkBlock = '';
      try {
        const dev = await Device.findOne({
          where: { deviceId },
          attributes: ['currentLocation', 'name'],
          raw: true,
        });
        const coords = dev?.currentLocation?.coordinates;
        if (Array.isArray(coords) && coords.length >= 2) {
          const [lng, lat] = coords;
          const address = await reverseGeocode(lat, lng);
          const addrLine = `\nAlamat: ${address ? escapeHtml(shortAddress(address)) : 'Alamat tidak tersedia'}`;
          linkBlock = `\nCoord: ${lat.toFixed(6)}, ${lng.toFixed(6)}${addrLine}${buildLinks(lat, lng)}`;
        }
      } catch {}
      await notify(`⚠️ Device Inactive\nDevice: ${deviceId}\nAt: ${new Date().toISOString()}${linkBlock}`);
      s.lastInactiveAlertAt = now;
    } else {
      try { logger.info(`[inactivity] cooldown active; skipping inactive alert for deviceId=${deviceId}`); } catch {}
    }
    states.set(deviceId, s);
    timers.delete(deviceId);
  }, timeoutMs);
  timers.set(deviceId, handle);
}

async function bootstrapInactivityTimers() {
  try {
    const timeoutMs = getTimeoutMs();
    const devices = await Device.findAll({
      attributes: ['deviceId', 'lastSeen', 'currentLocation'],
      raw: true,
    });
    const now = Date.now();
    for (const d of devices) {
      const deviceId = d?.deviceId;
      if (!deviceId) continue;

      const lastTs = d?.lastSeen || d?.currentLocation?.timestamp;
      const lastAt = lastTs ? new Date(lastTs).getTime() : NaN;
      const elapsed = Number.isFinite(lastAt) ? now - lastAt : 0;
      const delay = Math.max(0, timeoutMs - elapsed);
      scheduleInactive(deviceId, delay);
    }
    try { logger.info(`[inactivity] bootstrapped timers for ${devices.length} devices`); } catch {}
  } catch (e) {
    try { logger.error(`[inactivity] bootstrap failed: ${e.message}`); } catch {}
  }
}

// Call this whenever we receive a heartbeat or location to mark device as active and reset its inactivity timer
async function bumpActivity(deviceId) {
  const now = Date.now();
  const s = states.get(deviceId) || { inactive: false, lastInactiveAlertAt: 0, lastActiveAlertAt: 0 };
  if (s.inactive) {
    // transitioned to active -> notify (respect cooldown for active notices separately)
    const cooldownMs = getInactiveCooldownMs();
    if (!shouldCooldown(s.lastActiveAlertAt, cooldownMs)) {
      let linkBlock = '';
      try {
        const dev = await Device.findOne({
          where: { deviceId },
          attributes: ['currentLocation', 'name'],
          raw: true,
        });
        const coords = dev?.currentLocation?.coordinates;
        if (Array.isArray(coords) && coords.length >= 2) {
          const [lng, lat] = coords;
          const address = await reverseGeocode(lat, lng);
          const addrLine = `\nAlamat: ${address ? escapeHtml(shortAddress(address)) : 'Alamat tidak tersedia'}`;
          linkBlock = `\nCoord: ${lat.toFixed(6)}, ${lng.toFixed(6)}${addrLine}${buildLinks(lat, lng)}`;
        }
      } catch {}
      await notify(`✅ Device Active\nDevice: ${deviceId}\nAt: ${new Date().toISOString()}${linkBlock}`);
      s.lastActiveAlertAt = now;
    }
    s.inactive = false;
  }
  states.set(deviceId, s);
  scheduleInactive(deviceId);
}

module.exports = { bumpActivity, bootstrapInactivityTimers };
