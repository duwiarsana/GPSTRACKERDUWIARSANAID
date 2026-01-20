const sequelize = require('../config/sequelize');
const User = require('./User');
const Device = require('./Device');
const Location = require('./Location');

User.hasMany(Device, {
  foreignKey: 'userId',
  sourceKey: '_id',
  as: 'devices',
  onDelete: 'CASCADE',
});

Device.belongsTo(User, {
  foreignKey: 'userId',
  targetKey: '_id',
  as: 'user',
});

Device.hasMany(Location, {
  foreignKey: 'deviceId',
  sourceKey: '_id',
  as: 'locations',
  onDelete: 'CASCADE',
});

Location.belongsTo(Device, {
  foreignKey: 'deviceId',
  targetKey: '_id',
  as: 'device',
});

module.exports = { sequelize, User, Device, Location };
