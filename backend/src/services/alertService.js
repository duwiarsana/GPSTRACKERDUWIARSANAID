const logger = require('../utils/logger');
const { isPointInsidePolygon } = require('../utils/geofence');
const telegram = require('./telegramService');

// In-memory state (MVP). For multi-instance, move to Redis later.
// key: deviceId => {
//   inside: boolean|null,
//   lastAlertAt: number,
//   lastEvent: 'Enter'|'Exit'|null,
//   outsideSince?: number,
//   insideSince?: number,
// }
const lastState = new Map();

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

    if (typeof fetch !== 'function') {
      logger.warn('reverseGeocode: global fetch is not available; address lookup disabled');
      return null;
    }

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
          'User-Agent': process.env.NOMINATIM_USER_AGENT || 'gpstracker-backend/1.0 (geofence-alert)',
        },
        signal: ctrl.signal,
      });

      if (!res.ok) {
        logger.warn(`reverseGeocode failed: HTTP ${res.status}`);
        return null;
      }
      const data = await res.json();
      const display =
        typeof data?.display_name === 'string' && data.display_name.trim().length > 0
          ? data.display_name.trim()
          : null;

      if (display) addressCache.set(key, { value: display, ts: Date.now() });
      return display;
    } catch (e) {
      if (e?.name === 'AbortError') {
        logger.warn('reverseGeocode timeout');
      } else {
        logger.error(`reverseGeocode failed: ${e.message}`);
      }
      return null;
    } finally {
      clearTimeout(t);
    }
  } catch (e) {
    logger.error(`reverseGeocode failed: ${e.message}`);
    return null;
  }
}

function getCooldownMs() {
  const mins = Number(process.env.TELEGRAM_COOLDOWN_MINUTES || 10);
  return Math.max(0, mins) * 60 * 1000;
}

function shouldCooldown(prevTs) {
  if (!prevTs) return false;
  return Date.now() - prevTs < getCooldownMs();
}

function getExitDwellMs() {
  const secs = Number(process.env.TELEGRAM_DWELL_EXIT_SECONDS || 30);
  return Math.max(0, secs) * 1000;
}

async function notifyTelegram(text) {
  const chatId = process.env.TELEGRAM_DEFAULT_CHAT_ID;
  if (!chatId) {
    logger.warn('TELEGRAM_DEFAULT_CHAT_ID not set; skipping telegram alert');
    return;
  }
  try {
    await telegram.sendMessage(chatId, text);
  } catch (e) {
    logger.error(`Telegram notify failed: ${e.message}`);
  }
}

function formatMsg({ deviceName, deviceId, event, lat, lng, address }) {
  const gmaps = `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
  const safeName = escapeHtml(deviceName || deviceId);
  const safeEvent = escapeHtml(event);
  const safeAddr = address ? escapeHtml(shortAddress(address)) : null;
  return [
    '🚨 GPS Tracker Geofence Alert',
    `Device: ${safeName}`,
    `Event: ${safeEvent}`,
    `Coord: ${lat.toFixed(6)}, ${lng.toFixed(6)}`,
    `Alamat: ${safeAddr || 'Alamat tidak tersedia'}`,
    `<a href="${gmaps}">Open in Google Maps</a>`,
    new Date().toISOString(),
  ].filter(Boolean).join('\n');
}

async function handleGeofence({ device, lng, lat }) {
  try {
    const deviceId = device.deviceId;
    const polygon = device?.geofence?.coordinates;
    if (!polygon) return; // no geofence set

    const inside = !!isPointInsidePolygon(polygon, [lng, lat]);
    const prev = lastState.get(deviceId) || { inside: null, lastAlertAt: 0, lastEvent: null };

    // Initialize state without alert on first observation
    if (prev.inside === null) {
      const now = Date.now();
      lastState.set(deviceId, {
        inside,
        lastAlertAt: 0,
        lastEvent: null,
        outsideSince: inside ? undefined : now,
        insideSince: inside ? now : undefined,
      });
      return;
    }

    const now = Date.now();
    let newState = { ...prev, inside };

    // Transition detection
    const transitionedToOutside = prev.inside === true && inside === false;
    const transitionedToInside = prev.inside === false && inside === true;

    if (transitionedToOutside) {
      // Start outside timer; do not send immediately, wait for dwell
      newState.outsideSince = now;
      newState.insideSince = undefined;
      // No alert yet; will be sent when dwell satisfied
      lastState.set(deviceId, newState);
      return;
    }

    if (transitionedToInside) {
      // Immediate ENTER alert (opposite transition allowed regardless of cooldown)
      const address = await reverseGeocode(lat, lng);
      const msg = formatMsg({ deviceName: device.name, deviceId, event: 'Enter geofence', lat, lng, address });
      await notifyTelegram(msg);
      newState.lastAlertAt = now;
      newState.lastEvent = 'Enter';
      newState.insideSince = now;
      newState.outsideSince = undefined;
      lastState.set(deviceId, newState);
      return;
    }

    // No transition: still inside or still outside
    if (inside === false) {
      // Still outside; check dwell to trigger EXIT if not yet sent or after opposite transition
      const dwellMs = getExitDwellMs();
      const since = newState.outsideSince || now; // fallback safety
      const metDwell = now - since >= dwellMs;
      if (metDwell) {
        // Cooldown only for repeated same event; opposite transitions bypassed earlier
        if (newState.lastEvent !== 'Exit' || !shouldCooldown(newState.lastAlertAt)) {
          const address = await reverseGeocode(lat, lng);
          const msg = formatMsg({ deviceName: device.name, deviceId, event: 'Exit geofence', lat, lng, address });
          await notifyTelegram(msg);
          newState.lastAlertAt = now;
          newState.lastEvent = 'Exit';
        }
      }
      lastState.set(deviceId, newState);
      return;
    }

    // Still inside: nothing to do; keep state
    lastState.set(deviceId, newState);
  } catch (e) {
    logger.error(`handleGeofence error: ${e.message}`);
  }
}

module.exports = { handleGeofence };
