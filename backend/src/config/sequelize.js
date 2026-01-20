const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');

const host = process.env.MYSQL_HOST || '127.0.0.1';
const port = parseInt(process.env.MYSQL_PORT || '3306', 10);
const database = process.env.MYSQL_DATABASE || 'gpstracker';
const username = process.env.MYSQL_USER || 'root';
const password = process.env.MYSQL_PASSWORD || '';

const loggingEnabled = String(process.env.MYSQL_LOGGING || '') === '1';

const sequelize = new Sequelize(database, username, password, {
  host,
  port: Number.isFinite(port) ? port : 3306,
  dialect: 'mysql',
  logging: loggingEnabled ? (msg) => logger.debug(msg) : false,
});

module.exports = sequelize;
