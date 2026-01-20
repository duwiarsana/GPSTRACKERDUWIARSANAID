const logger = require('../utils/logger');
const { sequelize } = require('../models');

const connectDB = async () => {
  try {
    await sequelize.authenticate();
    logger.info(`MySQL Connected: ${process.env.MYSQL_HOST || '127.0.0.1'}`);
    await sequelize.sync();
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
