const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/sequelize');
const { newObjectId } = require('../utils/objectId');

class Device extends Model {}

Device.init(
  {
    _id: {
      type: DataTypes.STRING(24),
      primaryKey: true,
      defaultValue: () => newObjectId(),
    },
    name: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    deviceId: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
    },
    description: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    lastSeen: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    currentLocation: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    geofence: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    userId: {
      type: DataTypes.STRING(24),
      allowNull: false,
      field: 'user',
    },
  },
  {
    sequelize,
    modelName: 'Device',
    tableName: 'devices',
    timestamps: true,
    hooks: {
      // Generate device ID before saving
      beforeValidate: async (device) => {
        if (!device.deviceId) {
          device.deviceId = `DEV-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
        }
      },
    },
  }
);

module.exports = Device;
