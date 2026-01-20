const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/sequelize');
const { newObjectId } = require('../utils/objectId');

class Location extends Model {}

Location.init(
  {
    _id: {
      type: DataTypes.STRING(24),
      primaryKey: true,
      defaultValue: () => newObjectId(),
    },
    deviceId: {
      type: DataTypes.STRING(24),
      allowNull: false,
      field: 'device',
    },
    location: {
      type: DataTypes.JSON,
      allowNull: false,
    },
    speed: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    accuracy: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    satellites: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    battery: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'Location',
    tableName: 'locations',
    timestamps: true,
  }
);

module.exports = Location;
