require('dotenv').config({ path: process.cwd() + '/.env' });
const connectDB = require('../config/db');
const User = require('../models/User');
const { sequelize } = require('../models');

(async () => {
  try {
    await connectDB();

    const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@admin.com';
    const ADMIN_NAME = process.env.ADMIN_NAME || 'admin';
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

    let user = await User.scope('withPassword').findOne({ where: { email: ADMIN_EMAIL } });

    if (user) {
      console.log(`[seed] Admin user already exists: ${ADMIN_EMAIL}`);
    } else {
      user = await User.create({
        name: ADMIN_NAME,
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        role: 'admin',
      });
      console.log(`[seed] Admin user created: ${ADMIN_EMAIL} / password: ${ADMIN_PASSWORD}`);
    }
  } catch (err) {
    console.error('[seed] Failed:', err);
    process.exitCode = 1;
  } finally {
    try {
      await sequelize.close();
    } catch {}
  }
})();
