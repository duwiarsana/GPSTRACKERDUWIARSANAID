const express = require('express');
const path = require('path');
const cors = require('cors');
const mqttService = require('./services/mqttService');
const telegramService = require('./services/telegramService');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');
const { bootstrapInactivityTimers } = require('./utils/inactivity');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Load env vars
require('dotenv').config({ path: './.env' });

// Connect to database
connectDB()
  .then(() => {
    try {
      bootstrapInactivityTimers();
    } catch (e) {
      logger.error(`Inactivity bootstrap failed: ${e.message}`);
    }
  })
  .catch((e) => {
    logger.error(`DB connect failed: ${e.message}`);
  });

// Connect to MQTT broker
mqttService.connect();

// Route files
const authRoutes = require('./routes/auth');
const deviceRoutes = require('./routes/devices');
const userRoutes = require('./routes/users');

const app = express();

// Set static folder
app.use(express.static(path.join(__dirname, 'public')));

// Body parser
app.use(express.json());

// Enable CORS
app.use(cors());

// Security: set trust proxy (for rate limit behind proxies)
app.set('trust proxy', 1);

// Security: helmet and rate limiting
app.use(helmet());
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: 'draft-7', legacyHeaders: false });
app.use(limiter);

// Set security headers
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization'
  );
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, DELETE, OPTIONS'
  );
  next();
});

// Mount routers
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/devices', deviceRoutes);
app.use('/api/v1/users', userRoutes);

// Lightweight reverse geocoding proxy to avoid browser-level 403 from Nominatim
app.get('/api/v1/reverse-geocode', async (req, res) => {
  try {
    const lat = parseFloat(String(req.query.lat ?? ''));
    const lng = parseFloat(String(req.query.lng ?? ''));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ success: false, message: 'Invalid lat/lng' });
    }

    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
      lat,
    )}&lon=${encodeURIComponent(lng)}&zoom=18&addressdetails=1`;

    const nomRes = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'gpstracker-backend/1.0 (reverse-geocode)',
      },
    });

    if (!nomRes.ok) {
      logger.warn(`Reverse geocode failed: HTTP ${nomRes.status}`);
      return res.status(502).json({ success: false, message: `Upstream error ${nomRes.status}` });
    }

    const data = await nomRes.json();
    const display =
      typeof data.display_name === 'string' && data.display_name.trim().length > 0
        ? data.display_name.trim()
        : null;

    return res.status(200).json({ success: true, address: display, raw: data });
  } catch (err) {
    logger.error(`Reverse geocode error: ${err.message}`);
    return res.status(500).json({ success: false, message: 'Reverse geocode failed' });
  }
});

// Telegram notify test endpoint
app.post('/api/v1/notify/telegram', async (req, res) => {
  try {
    const { chatId, text } = req.body || {};
    if (!chatId || !text) {
      return res.status(400).json({ success: false, message: 'chatId and text are required' });
    }
    const result = await telegramService.sendMessage(chatId, text);
    return res.status(200).json({ success: true, result });
  } catch (err) {
    logger.error(`Telegram notify error: ${err.message}`);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Error handler middleware
app.use(errorHandler);

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  logger.error(`Error: ${err.message}`);
  // Close server & exit process
  server.close(() => process.exit(1));
});

const http = require('http');
const { init: initSocket } = require('./utils/socket');
const PORT = process.env.PORT || 5000;

const server = http.createServer(app);
initSocket(server);
server.listen(
  PORT,
  () => logger.info(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`)
);

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  logger.error(`Error: ${err.message}`);
  // Close server & exit process
  server.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught Exception: ${err.message}`);
  process.exit(1);
});

// Handle SIGTERM
process.on('SIGTERM', () => {
  logger.info('SIGTERM RECEIVED. Shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated!');
  });
});

module.exports = app;
