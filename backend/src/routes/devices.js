const express = require('express');
const {
  getDevices,
  getDevice,
  createDevice,
  updateDevice,
  deleteDevice,
  getDeviceLocations,
  deleteDeviceLocations,
  deleteAllLocations,
  sendCommandToDevice,
  getDeviceStats,
  getDeviceStatsByDeviceId,
  heartbeatById,
  heartbeatByDeviceId,
  simulateLocationByDeviceId,
  getLocationsByDeviceId,
  deleteLocationsByDeviceId,
  getDeviceGeofence,
  updateDeviceGeofence
} = require('../controllers/devices');

const Device = require('../models/Device');
const advancedResults = require('../middleware/advancedResults');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

const restrictToOwnDevices = (req, res, next) => {
  if (req.user && req.user.role !== 'admin') {
    req.query.userId = req.user.id;
  }
  next();
};

// Re-route into other resource routers
// router.use('/:deviceId/locations', locationRoutes);

// Add protect and authorize middleware to all routes
router.use(protect);
router.use(authorize('user', 'admin'));

router
  .route('/')
  .get(
    restrictToOwnDevices,
    advancedResults(Device, {
      path: 'user',
      select: 'name email'
    }),
    getDevices
  )
  .post(createDevice);

// Admin: delete all locations across all devices
router
  .route('/locations')
  .delete(deleteAllLocations);

router
  .route('/:id')
  .get(getDevice)
  .put(updateDevice)
  .delete(deleteDevice);

// Delete locations by Mongo id
router.route('/:id/locations')
  .get(getDeviceLocations)
  .delete(deleteDeviceLocations);

// Geofence routes
router.route('/:id/geofence')
  .get(getDeviceGeofence)
  .put(updateDeviceGeofence);

// Device specific routes
router.route('/:id/command').post(sendCommandToDevice);
router.route('/:id/stats').get(getDeviceStats);
router.route('/:id/heartbeat').post(heartbeatById);
router.route('/by-device-id/:deviceId/stats').get(getDeviceStatsByDeviceId);
router.route('/by-device-id/:deviceId/heartbeat').post(heartbeatByDeviceId);
router.route('/by-device-id/:deviceId/simulate/location').post(simulateLocationByDeviceId);
router.route('/by-device-id/:deviceId/locations').get(getLocationsByDeviceId);
router.route('/by-device-id/:deviceId/locations').delete(deleteLocationsByDeviceId);

module.exports = router;
