const { DataTypes } = require('sequelize');
const logger = require('../utils/logger');
const { sequelize } = require('../models');

async function ensureColumn({ tableName, columnName, attributes }) {
  try {
    const qi = sequelize.getQueryInterface();
    const desc = await qi.describeTable(tableName);
    if (desc && !Object.prototype.hasOwnProperty.call(desc, columnName)) {
      await qi.addColumn(tableName, columnName, attributes);
      try { logger.info(`[db] Added column ${tableName}.${columnName}`); } catch {}
    }
  } catch (e) {
    try { logger.warn(`[db] ensureColumn skipped for ${tableName}.${columnName}: ${e.message}`); } catch {}
  }
}

const connectDB = async () => {
  try {
    await sequelize.authenticate();
    logger.info(`MySQL Connected: ${process.env.MYSQL_HOST || '127.0.0.1'}`);
    await sequelize.sync();

    // Safe schema patching for existing DBs (sequelize.sync() does not alter columns)
    await ensureColumn({
      tableName: 'locations',
      columnName: 'altitude',
      attributes: { type: DataTypes.FLOAT, allowNull: true },
    });

    await ensureColumn({
      tableName: 'users',
      columnName: 'signupIp',
      attributes: { type: DataTypes.STRING(64), allowNull: true },
    });
    await ensureColumn({
      tableName: 'users',
      columnName: 'signupLocation',
      attributes: { type: DataTypes.JSON, allowNull: true },
    });
    await ensureColumn({
      tableName: 'users',
      columnName: 'signupUserAgent',
      attributes: { type: DataTypes.STRING(255), allowNull: true },
    });
  } catch (error) {
    logger.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

// Close the MySQL connection when the Node process is terminated
process.on('SIGINT', async () => {
  try {
    await sequelize.close();
    logger.info('MySQL connection closed through app termination');
    process.exit(0);
  } catch (err) {
    logger.error(`Error closing MySQL connection: ${err}`);
    process.exit(1);
  }
});

module.exports = connectDB;
