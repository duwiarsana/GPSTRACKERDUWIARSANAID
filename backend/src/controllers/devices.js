const Device = require('../models/Device');
const Location = require('../models/Location');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');
const mqttService = require('../services/mqttService');
const { getIO } = require('../utils/socket');
const { bumpActivity } = require('../utils/inactivity');
const sequelize = require('../config/sequelize');
const { Op, fn, col } = require('sequelize');

const INACTIVE_TIMEOUT_MS = parseInt(process.env.DEVICE_INACTIVE_TIMEOUT_MS || '300000', 10); // default 5m

// Helper to apply stale status without mutating DB
function applyStaleStatus(deviceDoc) {
  const d = deviceDoc?.toJSON ? deviceDoc.toJSON() : (deviceDoc.toObject ? deviceDoc.toObject() : deviceDoc);
  if (d.lastSeen) {
    const stale = Date.now() - new Date(d.lastSeen).getTime() > INACTIVE_TIMEOUT_MS;
    if (stale && d.isActive) d.isActive = false;
  }
  return d;
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function calcTrip24hKm(deviceObjectId) {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const points = await Location.findAll({
    where: { deviceId: deviceObjectId, timestamp: { [Op.gte]: cutoff } },
    order: [['timestamp', 'ASC']],
    attributes: ['location', 'timestamp'],
    limit: 5000,
    raw: true,
  });

  let totalM = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]?.location?.coordinates;
    const b = points[i]?.location?.coordinates;
    if (!Array.isArray(a) || a.length < 2 || !Array.isArray(b) || b.length < 2) continue;
    const lng1 = Number(a[0]);
    const lat1 = Number(a[1]);
    const lng2 = Number(b[0]);
    const lat2 = Number(b[1]);
    if (!Number.isFinite(lat1) || !Number.isFinite(lng1) || !Number.isFinite(lat2) || !Number.isFinite(lng2)) continue;
    const d = haversineMeters(lat1, lng1, lat2, lng2);
    if (!Number.isFinite(d) || d < 0) continue;
    if (d > 50000) continue;
    totalM += d;
  }
  return Math.round((totalM / 1000) * 100) / 100;
}

// @desc    Get all devices
// @route   GET /api/v1/devices
// @access  Private
exports.getDevices = asyncHandler(async (req, res, next) => {
  const results = res.advancedResults;
  if (Array.isArray(results.data)) {
    results.data = results.data.map(applyStaleStatus);
  }
  res.status(200).json(results);
});

// @desc    Delete device locations by Mongo ID, optional reset currentLocation
// @route   DELETE /api/v1/devices/:id/locations
// @access  Private
exports.deleteDeviceLocations = asyncHandler(async (req, res, next) => {
  const device = await Device.findByPk(req.params.id, { attributes: ['_id', 'userId'] });
  if (!device) {
    return next(new ErrorResponse(`Device not found with id of ${req.params.id}`, 404));
  }
  if (device.userId !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse(`User ${req.user.id} is not authorized to modify this device`, 403));
  }
  const reset = String(req.query.resetCurrent || '') === 'true';
  const deleted = await Location.destroy({ where: { deviceId: device._id } });
  if (reset) {
    await Device.update({ currentLocation: null }, { where: { _id: device._id } });
  }
  res.status(200).json({ success: true, deleted: deleted || 0, resetCurrent: !!reset });
});

// @desc    Delete device locations by deviceId, optional reset currentLocation
// @route   DELETE /api/v1/devices/by-device-id/:deviceId/locations
// @access  Private
exports.deleteLocationsByDeviceId = asyncHandler(async (req, res, next) => {
  const device = await Device.findOne({ where: { deviceId: req.params.deviceId } });
  if (!device) {
    return next(new ErrorResponse(`Device not found with deviceId of ${req.params.deviceId}`, 404));
  }
  if (device.userId !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse(`User ${req.user.id} is not authorized to modify this device`, 403));
  }
  const reset = String(req.query.resetCurrent || '') === 'true';
  const deleted = await Location.destroy({ where: { deviceId: device._id } });
  if (reset) {
    await Device.update({ currentLocation: null }, { where: { _id: device._id } });
  }
  res.status(200).json({ success: true, deleted: deleted || 0, resetCurrent: !!reset });
});

// @desc    Delete ALL locations across ALL devices (admin only)
// @route   DELETE /api/v1/devices/locations
// @access  Private/Admin
exports.deleteAllLocations = asyncHandler(async (req, res, next) => {
  if (req.user.role !== 'admin') {
    return next(new ErrorResponse('Not authorized: admin only', 403));
  }
  const reset = String(req.query.resetCurrent || '') === 'true';
  const deleted = await Location.destroy({ where: {} });
  if (reset) {
    await Device.update({ currentLocation: null }, { where: {} });
  }
  res.status(200).json({ success: true, deleted: deleted || 0, resetCurrent: !!reset });
});

// @desc    Get single device
// @route   GET /api/v1/devices/:id
// @access  Private
exports.getDevice = asyncHandler(async (req, res, next) => {
  const device = await Device.findByPk(req.params.id, {
    include: [{ association: 'user', attributes: ['name', 'email'] }],
  });

  if (!device) {
    return next(
      new ErrorResponse(`Device not found with id of ${req.params.id}`, 404)
    );
  }

  // Make sure user is device owner or admin
  if (device.userId !== req.user.id && req.user.role !== 'admin') {
    return next(
      new ErrorResponse(
        `User ${req.user.id} is not authorized to access this device`,
        403
      )
    );
  }

  res.status(200).json({
    success: true,
    data: applyStaleStatus(device)
  });
});

// @desc    Create new device
// @route   POST /api/v1/devices
// @access  Private
exports.createDevice = asyncHandler(async (req, res, next) => {
  // Add user to req.body
  req.body.userId = req.user.id;
  if (req.body.user) delete req.body.user;

  const device = await Device.create(req.body);

  res.status(201).json({
    success: true,
    data: device
  });
});

// @desc    Update device
// @route   PUT /api/v1/devices/:id
// @access  Private
exports.updateDevice = asyncHandler(async (req, res, next) => {
  let device = await Device.findByPk(req.params.id);

  if (!device) {
    return next(
      new ErrorResponse(`Device not found with id of ${req.params.id}`, 404)
    );
  }

  // Make sure user is device owner or admin
  if (device.userId !== req.user.id && req.user.role !== 'admin') {
    return next(
      new ErrorResponse(
        `User ${req.user.id} is not authorized to update this device`,
        403
      )
    );
  }

  if (req.body && req.body.user) delete req.body.user;
  if (req.body && req.body.userId) delete req.body.userId;
  await Device.update(req.body, { where: { _id: req.params.id } });
  device = await Device.findByPk(req.params.id);

  res.status(200).json({
    success: true,
    data: device
  });
});

function isGeoJsonPolygon(value) {
  return (
    !!value &&
    typeof value === 'object' &&
    value.type === 'Polygon' &&
    Array.isArray(value.coordinates) &&
    Array.isArray(value.coordinates[0])
  );
}

function normalizeGeofence(value) {
  if (value == null) return null;
  if (Array.isArray(value)) {
    const polys = value.filter(isGeoJsonPolygon);
    return polys.length > 0 ? polys : null;
  }
  if (isGeoJsonPolygon(value)) return [value];
  return null;
}

// @desc    Get device geofence
// @route   GET /api/v1/devices/:id/geofence
// @access  Private
exports.getDeviceGeofence = asyncHandler(async (req, res, next) => {
  const device = await Device.findByPk(req.params.id, { attributes: ['userId', 'geofence'] });
  if (!device) {
    return next(new ErrorResponse(`Device not found with id of ${req.params.id}`, 404));
  }
  if (device.userId !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse(`User ${req.user.id} is not authorized to access this device`, 403));
  }
  res.status(200).json({ success: true, data: normalizeGeofence(device.geofence) });
});

// @desc    Update device geofence (GeoJSON Polygon or array of Polygons). Pass null to clear.
// @route   PUT /api/v1/devices/:id/geofence
// @access  Private
exports.updateDeviceGeofence = asyncHandler(async (req, res, next) => {
  const base = await Device.findByPk(req.params.id, { attributes: ['userId'] });
  if (!base) {
    return next(new ErrorResponse(`Device not found with id of ${req.params.id}`, 404));
  }
  if (base.userId !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse(`User ${req.user.id} is not authorized to update this device`, 403));
  }

  // Never allow deviceId changes through this route
  if (req.body && req.body.deviceId) delete req.body.deviceId;

  // Support both raw null and { geofence: null } to clear
  const body = req.body == null ? null : req.body;
  let nextGeofence;
  if (body === null || (typeof body === 'object' && body && body.geofence === null)) {
    nextGeofence = null;
  } else {
    const candidate = (() => {
      if (Array.isArray(body)) return body;
      if (typeof body === 'object' && body) {
        if (body.geofences !== undefined) return body.geofences;
        if (body.geofence !== undefined) return body.geofence;
      }
      return body;
    })();

    const normalized = normalizeGeofence(candidate);
    if (!normalized) {
      return next(new ErrorResponse('Invalid geofence payload. Expected GeoJSON Polygon or array of Polygons.', 400));
    }
    nextGeofence = normalized;
  }

  await Device.update({ geofence: nextGeofence }, { where: { _id: req.params.id } });
  const updated = await Device.findByPk(req.params.id, { attributes: ['geofence'] });
  res.status(200).json({ success: true, data: normalizeGeofence(updated?.geofence) });
});

// @desc    Delete device
// @route   DELETE /api/v1/devices/:id
// @access  Private
exports.deleteDevice = asyncHandler(async (req, res, next) => {
  const device = await Device.findByPk(req.params.id);

  if (!device) {
    return next(
      new ErrorResponse(`Device not found with id of ${req.params.id}`, 404)
    );
  }

  // Make sure user is device owner or admin
  if (device.userId !== req.user.id && req.user.role !== 'admin') {
    return next(
      new ErrorResponse(
        `User ${req.user.id} is not authorized to delete this device`,
        403
      )
    );
  }

  await Location.destroy({ where: { deviceId: device._id } });
  await device.destroy();

  res.status(200).json({
    success: true,
    data: {}
  });
});

// @desc    Get device locations
// @route   GET /api/v1/devices/:id/locations
// @access  Private
exports.getDeviceLocations = asyncHandler(async (req, res, next) => {
  const device = await Device.findByPk(req.params.id);

  if (!device) {
    return next(
      new ErrorResponse(`Device not found with id of ${req.params.id}`, 404)
    );
  }

  // Make sure user is device owner or admin
  if (device.userId !== req.user.id && req.user.role !== 'admin') {
    return next(
      new ErrorResponse(
        `User ${req.user.id} is not authorized to access this device`,
        403
      )
    );
  }

  // Get locations for this device
  const locations = await Location.findAll({
    where: { deviceId: device._id },
    order: [['timestamp', 'DESC']],
    limit: 1000,
  });

  res.status(200).json({
    success: true,
    count: locations.length,
    data: locations
  });
});

// @desc    Get device locations by deviceId (helper for debugging/audit)
// @route   GET /api/v1/devices/by-device-id/:deviceId/locations
// @access  Private
exports.getLocationsByDeviceId = asyncHandler(async (req, res, next) => {
  const device = await Device.findOne({
    where: { deviceId: req.params.deviceId },
    attributes: ['_id', 'userId'],
    raw: true,
  });
  if (!device) {
    return next(new ErrorResponse(`Device not found with deviceId of ${req.params.deviceId}`, 404));
  }
  // Enforce ownership for normal users; allow admin to audit any; allow debug bypass via env
  const bypass = String(process.env.DEBUG_ALLOW_AUDIT_ANY || '') === '1';
  if (!bypass && device.userId !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse(`User ${req.user.id} is not authorized to access this device`, 403));
  }
  // optional suspicious filter
  const { suspicious, limit } = req.query;
  const q = { deviceId: device._id };
  const where = { ...q };
  if (String(suspicious) === 'true') {
    where[Op.or] = [
      sequelize.literal("(JSON_EXTRACT(location,'$.coordinates[0]') = 0 AND JSON_EXTRACT(location,'$.coordinates[1]') = 0)"),
      sequelize.literal("JSON_EXTRACT(location,'$.coordinates[0]') < 95"),
      sequelize.literal("JSON_EXTRACT(location,'$.coordinates[0]') > 141"),
      sequelize.literal("JSON_EXTRACT(location,'$.coordinates[1]') < -11"),
      sequelize.literal("JSON_EXTRACT(location,'$.coordinates[1]') > 6.5"),
    ];
  }
  const limNum = parseInt(String(limit || ''), 10);
  const lim = Math.max(1, Math.min(1000, Number.isFinite(limNum) ? limNum : 300));
  const locations = await Location.findAll({ where, order: [['timestamp', 'DESC']], limit: lim });
  res.status(200).json({ success: true, count: locations.length, data: locations });
});

// @desc    Send command to device
// @route   POST /api/v1/devices/:id/command
// @access  Private
exports.sendCommandToDevice = asyncHandler(async (req, res, next) => {
  const device = await Device.findByPk(req.params.id);

  if (!device) {
    return next(
      new ErrorResponse(`Device not found with id of ${req.params.id}`, 404)
    );
  }

  // Make sure user is device owner or admin
  if (device.userId !== req.user.id && req.user.role !== 'admin') {
    return next(
      new ErrorResponse(
        `User ${req.user.id} is not authorized to control this device`,
        403
      )
    );
  }

  const { command, payload = {} } = req.body;

  if (!command) {
    return next(new ErrorResponse('Please provide a command', 400));
  }

  // Send command via MQTT
  const success = await mqttService.sendCommand(device.deviceId, command, payload);

  res.status(200).json({
    success,
    data: { command, payload }
  });
});

// @desc    Get device statistics
// @route   GET /api/v1/devices/:id/stats
// @access  Private
exports.getDeviceStats = asyncHandler(async (req, res, next) => {
  const device = await Device.findByPk(req.params.id);

  if (!device) {
    return next(
      new ErrorResponse(`Device not found with id of ${req.params.id}`, 404)
    );
  }

  // Make sure user is device owner or admin
  if (device.userId !== req.user.id && req.user.role !== 'admin') {
    return next(
      new ErrorResponse(
        `User ${req.user.id} is not authorized to access this device`,
        403
      )
    );
  }

  // Get location statistics
  const statsAgg = await Location.findOne({
    where: { deviceId: device._id },
    attributes: [
      [fn('COUNT', col('_id')), 'totalLocations'],
      [fn('AVG', col('speed')), 'avgSpeed'],
      [fn('MAX', col('speed')), 'maxSpeed'],
      [fn('MIN', col('timestamp')), 'firstSeen'],
      [fn('MAX', col('timestamp')), 'lastSeen'],
    ],
    raw: true,
  });

  // Get latest location
  const latestLocation = await Location.findOne({
    where: { deviceId: device._id },
    order: [['timestamp', 'DESC']],
    attributes: ['location', 'timestamp'],
    raw: true,
  });

  let trip24hKm = 0;
  try {
    trip24hKm = await calcTrip24hKm(device._id);
  } catch {}

  const result = {
    deviceId: device._id,
    name: device.name,
    isActive: device.isActive,
    lastSeen: device.lastSeen,
    currentLocation: device.currentLocation,
    stats: statsAgg || {},
    trip24hKm,
    latestLocation: latestLocation || null
  };

  res.status(200).json({
    success: true,
    data: applyStaleStatus(result)
  });
});

exports.getDeviceStatsByDeviceId = asyncHandler(async (req, res, next) => {
  const device = await Device.findOne({ where: { deviceId: req.params.deviceId } });

  if (!device) {
    return next(new ErrorResponse(`Device not found with deviceId of ${req.params.deviceId}`, 404));
  }

  if (device.userId !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse(`User ${req.user.id} is not authorized to access this device`, 403));
  }

  const statsAgg = await Location.findOne({
    where: { deviceId: device._id },
    attributes: [
      [fn('COUNT', col('_id')), 'totalLocations'],
      [fn('AVG', col('speed')), 'avgSpeed'],
      [fn('MAX', col('speed')), 'maxSpeed'],
      [fn('MIN', col('timestamp')), 'firstSeen'],
      [fn('MAX', col('timestamp')), 'lastSeen'],
    ],
    raw: true,
  });

  const latestLocation = await Location.findOne({
    where: { deviceId: device._id },
    order: [['timestamp', 'DESC']],
    attributes: ['location', 'timestamp'],
    raw: true,
  });

  let trip24hKm = 0;
  try {
    trip24hKm = await calcTrip24hKm(device._id);
  } catch {}

  const result = {
    deviceId: device._id,
    name: device.name,
    isActive: device.isActive,
    lastSeen: device.lastSeen,
    currentLocation: device.currentLocation,
    stats: statsAgg || {},
    trip24hKm,
    latestLocation: latestLocation || null
  };

  res.status(200).json({ success: true, data: applyStaleStatus(result) });
});

// @desc    Heartbeat by Mongo ID (mark active and update lastSeen)
// @route   POST /api/v1/devices/:id/heartbeat
// @access  Private
exports.heartbeatById = asyncHandler(async (req, res, next) => {
  const device = await Device.findByPk(req.params.id);
  if (!device) {
    return next(new ErrorResponse(`Device not found with id of ${req.params.id}`, 404));
  }
  if (device.userId !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse(`User ${req.user.id} is not authorized to update this device`, 403));
  }
  device.lastSeen = new Date();
  device.isActive = true;
  await device.save();
  try {
    const io = getIO();
    io.emit('deviceHeartbeat', { deviceId: device.deviceId, lastSeen: device.lastSeen.toISOString() });
  } catch {}
  try { bumpActivity(device.deviceId); } catch {}
  res.status(200).json({ success: true, data: applyStaleStatus(device) });
});

// @desc    Heartbeat by deviceId (for device topic usage)
// @route   POST /api/v1/devices/by-device-id/:deviceId/heartbeat
// @access  Private
exports.heartbeatByDeviceId = asyncHandler(async (req, res, next) => {
  const device = await Device.findOne({ where: { deviceId: req.params.deviceId, userId: req.user.id } });
  if (!device) {
    return next(new ErrorResponse(`Device not found with deviceId of ${req.params.deviceId}`, 404));
  }
  device.lastSeen = new Date();
  device.isActive = true;
  await device.save();
  try {
    const io = getIO();
    io.emit('deviceHeartbeat', { deviceId: device.deviceId, lastSeen: device.lastSeen.toISOString() });
  } catch {}
  try { bumpActivity(device.deviceId); } catch {}
  res.status(200).json({ success: true, data: applyStaleStatus(device) });
});

// @desc    Simulate MQTT location via HTTP by deviceId
// @route   POST /api/v1/devices/by-device-id/:deviceId/simulate/location
// @access  Private
exports.simulateLocationByDeviceId = asyncHandler(async (req, res, next) => {
  const { deviceId } = req.params;
  const device = await Device.findOne({ where: { deviceId, userId: req.user.id } });
  if (!device) {
    return next(new ErrorResponse(`Device not found with deviceId of ${deviceId}`, 404));
  }
  const { latitude, longitude, speed, accuracy, battery, satellites, timestamp, metadata } = req.body || {};
  try { console.log('[simulateLocation] rx', { deviceId, latitude, longitude, speed, accuracy, satellites, battery }); } catch {}
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return next(new ErrorResponse('latitude and longitude are required numbers', 400));
  }
  const payload = { latitude, longitude, speed, accuracy, battery, satellites, timestamp, metadata };
  await mqttService.updateDeviceLocation(deviceId, payload);
  await mqttService.saveLocationHistory(deviceId, payload);
  res.status(200).json({ success: true });
});
