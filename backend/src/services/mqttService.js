const mqtt = require('mqtt');
const Location = require('../models/Location');
const Device = require('../models/Device');
const logger = require('../utils/logger');
const { handleGeofence } = require('./alertService');
const { getIO } = require('../utils/socket');
const { bumpActivity } = require('../utils/inactivity');

class MQTTService {
  constructor() {
    this.client = null;
    this.topics = new Map();
  }

  async connect() {
    const url = process.env.MQTT_BROKER_URL;
    if (!url) {
      logger.info('MQTT_BROKER_URL not set, MQTT client disabled');
      return;
    }
    try {
      this.client = mqtt.connect(url);
      
      this.client.on('connect', () => {
        logger.info('Connected to MQTT Broker');
        this.subscribeToTopics();
      });

      this.client.on('message', this.handleMessage.bind(this));
      this.client.on('error', (error) => {
        logger.error(`MQTT Error: ${error.message}`);
      });

      this.client.on('close', () => {
        logger.warn('MQTT connection closed. Attempting to reconnect...');
        setTimeout(() => this.connect(), 5000);
      });

    } catch (error) {
      logger.error(`MQTT Connection Error: ${error.message}`);
      setTimeout(() => this.connect(), 5000);
    }
  }

  subscribeToTopics() {
    // Subscribe to all device topics
    this.client.subscribe(`${process.env.MQTT_TOPIC_PREFIX}+/location`, { qos: 1 }, (err) => {
      if (err) {
        logger.error(`Error subscribing to location topics: ${err.message}`);
      } else {
        logger.info(`Subscribed to ${process.env.MQTT_TOPIC_PREFIX}+/location`);
      }
    });
  }

  async handleMessage(topic, message) {
    try {
      const deviceId = this.extractDeviceIdFromTopic(topic);
      if (!deviceId) return;

      const payload = this.parseMessage(message);
      if (!payload) return;

      // Update device's last seen and current location
      await this.updateDeviceLocation(deviceId, payload);
      
      // Save location history
      await this.saveLocationHistory(deviceId, payload);

      logger.info(`Processed location update for device ${deviceId}`);
    } catch (error) {
      logger.error(`Error processing MQTT message: ${error.message}`);
    }
  }

  extractDeviceIdFromTopic(topic) {
    const parts = topic.split('/');
    if (parts.length < 3) return null;
    return parts[2]; // Assuming topic format: gpstracker/device/{deviceId}/location
  }

  parseMessage(message) {
    try {
      return JSON.parse(message.toString());
    } catch (error) {
      logger.error(`Error parsing MQTT message: ${error.message}`);
      return null;
    }
  }

  async updateDeviceLocation(deviceId, locationData) {
    try {
      const { latitude, longitude, speed, accuracy, battery, satellites } = locationData;
      try {
        logger.debug('[MQTT] updateDeviceLocation rx', {
          deviceId,
          latitude,
          longitude,
          speed,
          accuracy,
          satellites,
          hasBattery: !!battery,
        });
      } catch {}
      
      await Device.update(
        {
          lastSeen: new Date(),
          isActive: true,
          currentLocation: {
            type: 'Point',
            coordinates: [longitude, latitude],
            timestamp: new Date(),
            ...(typeof speed === 'number' ? { speed } : {}),
            ...(typeof accuracy === 'number' ? { accuracy } : {}),
            ...(battery ? { battery } : {}),
            ...(typeof satellites === 'number' ? { satellites } : {}),
          },
        },
        { where: { deviceId } }
      );

      const updated = await Device.findOne({ where: { deviceId } });
      try {
        logger.debug('[MQTT] updateDeviceLocation ok', {
          deviceId,
          updated: !!updated,
          coords: [longitude, latitude],
        });
      } catch {}
      // Geofence check/alert (non-blocking)
      try {
        if (updated && typeof longitude === 'number' && typeof latitude === 'number') {
          handleGeofence({ device: updated, lng: Number(longitude), lat: Number(latitude) });
        }
      } catch {}

      // Emit realtime update immediately (do not depend on history save)
      try {
        const io = getIO();
        io.emit('locationUpdate', {
          deviceId,
          location: {
            location: { type: 'Point', coordinates: [longitude, latitude] },
            timestamp: new Date().toISOString(),
            ...(typeof speed === 'number' ? { speed } : {}),
            ...(typeof accuracy === 'number' ? { accuracy } : {}),
            ...(battery ? { battery: { level: battery.level, isCharging: battery.isCharging } } : {}),
            ...(typeof satellites === 'number' ? { satellites } : {}),
          },
        });
      } catch {}
      try { bumpActivity(deviceId); } catch {}
    } catch (error) {
      logger.error(`Error updating device location: ${error.message}`);
      throw error;
    }
  }

  async saveLocationHistory(deviceId, locationData) {
    try {
      const { latitude, longitude, speed, accuracy, battery, satellites, timestamp } = locationData;
      try {
        logger.debug('[MQTT] saveLocationHistory rx', {
          deviceId,
          latitude,
          longitude,
          speed,
          accuracy,
          satellites,
          ts: timestamp,
        });
      } catch {}
      
      const device = await Device.findOne({ where: { deviceId } });
      if (!device) {
        logger.warn(`[MQTT] saveLocationHistory: device not found for deviceId=${deviceId}`);
        return;
      }

      // Ensure timestamp is monotonic: if incoming ts is missing or not greater than last saved, use server time
      let effectiveTs = timestamp ? new Date(timestamp) : new Date();
      try {
        const last = await Location.findOne({
          where: { deviceId: device._id },
          order: [['timestamp', 'DESC']],
          attributes: ['timestamp'],
          raw: true,
        });
        if (last && last.timestamp && effectiveTs.getTime() <= new Date(last.timestamp).getTime()) {
          effectiveTs = new Date();
        }
      } catch {}

      const created = await Location.create({
        deviceId: device._id,
        location: {
          type: 'Point',
          coordinates: [longitude, latitude]
        },
        speed,
        accuracy,
        satellites,
        battery: battery && {
          level: battery.level,
          isCharging: battery.isCharging
        },
        timestamp: effectiveTs,
        metadata: locationData.metadata || {}
      });
      try {
        logger.info('[MQTT] Location created', {
          deviceId,
          docId: created?._id?.toString?.() || null,
          coords: [longitude, latitude],
          ts: created?.timestamp,
        });
      } catch {}

      // Emit realtime update
      try {
        const io = getIO();
        io.emit('locationUpdate', {
          deviceId,
          location: {
            location: {
              type: 'Point',
              coordinates: [longitude, latitude]
            },
            timestamp: (timestamp ? new Date(timestamp) : new Date()).toISOString(),
            ...(typeof speed === 'number' ? { speed } : {}),
            ...(typeof accuracy === 'number' ? { accuracy } : {}),
            ...(battery ? { battery: { level: battery.level, isCharging: battery.isCharging } } : {}),
            ...(typeof satellites === 'number' ? { satellites } : {}),
          }
        });
      } catch (e) {
        // socket not initialized or other non-critical error
      }
      try { bumpActivity(deviceId); } catch {}
    } catch (error) {
      logger.error(`Error saving location history: ${error.message}`);
      throw error;
    }
  }

  publish(topic, message, options = {}) {
    return new Promise((resolve, reject) => {
      this.client.publish(topic, JSON.stringify(message), { qos: 1, ...options }, (error) => {
        if (error) {
          logger.error(`Error publishing to ${topic}: ${error.message}`);
          reject(error);
        } else {
          logger.debug(`Published to ${topic}: ${JSON.stringify(message)}`);
          resolve();
        }
      });
    });
  }

  async sendCommand(deviceId, command, payload = {}) {
    const topic = `${process.env.MQTT_TOPIC_PREFIX}${deviceId}/command`;
    const message = { command, ...payload, timestamp: new Date() };
    
    try {
      await this.publish(topic, message);
      logger.info(`Sent command to device ${deviceId}: ${command}`);
      return true;
    } catch (error) {
      logger.error(`Failed to send command to device ${deviceId}: ${error.message}`);
      return false;
    }
  }
}

// Export singleton instance
module.exports = new MQTTService();
