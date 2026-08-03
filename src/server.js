/**
 * Parking Building Management System - Backend Server
 * ====================================================
 * Architecture: Clean Architecture + MVC + Repository Pattern
 * Tech: Node.js, Express, MongoDB, Socket.IO
 */

require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const swaggerUi = require('swagger-ui-express');

const { connectDB } = require('./config/database');
const swaggerSpec = require('./config/swagger');
const { initSocket } = require('./sockets/socket.server');
const routes = require('./routes/index');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const logger = require('./utils/logger');
const { startOverdueWorker, stopOverdueWorker } = require('./workers/overdueSessionWorker');
const { startPendingPassWorker, stopPendingPassWorker } = require('./workers/pendingPassWorker');
const { startPendingBookingWorker, stopPendingBookingWorker } = require('./workers/pendingBookingWorker');
const { startNoShowBookingWorker, stopNoShowBookingWorker } = require('./workers/noShowBookingWorker');

// ========================
// STARTUP MIGRATION
// ========================
/**
 * One-time sync: recalculate totalSlots / availableSlots / occupiedSlots
 * for every ParkingLot from the actual ParkingSlot collection.
 * Runs once on each server boot so stale counts (e.g. from newly created lots)
 * are always corrected automatically — no manual button needed.
 */
async function syncAllLotSlotCounts() {
  try {
    const mongoose = require('mongoose');
    const ParkingLot = require('./modules/parkingLots/parkingLot.model');
    const ParkingSlot = require('./modules/parkingSlots/parkingSlot.model');

    const lots = await ParkingLot.find({ isDeleted: { $ne: true } }).select('_id name').lean();
    if (lots.length === 0) return;

    let updated = 0;
    for (const lot of lots) {
      const result = await ParkingSlot.aggregate([
        {
          $match: {
            parkingLot: new mongoose.Types.ObjectId(lot._id),
            isDeleted: { $ne: true },
          },
        },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]);

      const counts = { total: 0, available: 0, occupied: 0 };
      result.forEach(r => {
        counts[r._id] = r.count;
        counts.total += r.count;
      });

      await ParkingLot.findByIdAndUpdate(lot._id, {
        totalSlots: counts.total,
        availableSlots: counts.available || 0,
        occupiedSlots: counts.occupied || 0,
      });
      updated++;
    }
    logger.info(`✅ Synced slot counts for ${updated} parking lot(s)`);
  } catch (err) {
    logger.warn(`⚠️  Slot count sync failed (non-fatal): ${err.message}`);
  }
}

// ========================
// APP SETUP
// ========================
const app = express();
const httpServer = http.createServer(app);

// ========================
// SECURITY MIDDLEWARE
// ========================
app.use(helmet({
  contentSecurityPolicy: false, // Disabled to allow Swagger UI to work properly
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow cross-origin loading of resources
  crossOriginOpenerPolicy: false,
}));

// CORS
app.use(cors({
  origin: (origin, callback) => {
    const rawOrigins = [
      process.env.CLIENT_URL,
      process.env.ADMIN_URL,
      'http://localhost:3000',
      'http://localhost:3001',
      `http://localhost:${process.env.PORT || 5000}`,
      `http://127.0.0.1:${process.env.PORT || 5000}`,
    ].filter(Boolean);

    // Support comma-separated origins in env variables
    const parsedOrigins = [];
    rawOrigins.forEach(originStr => {
      if (originStr.includes(',')) {
        parsedOrigins.push(...originStr.split(',').map(item => item.trim()));
      } else {
        parsedOrigins.push(originStr.trim());
      }
    });

    if (process.env.ALLOWED_ORIGINS) {
      parsedOrigins.push(...process.env.ALLOWED_ORIGINS.split(',').map(item => item.trim()));
    }

    // Sanitize origins by stripping trailing slashes
    const allowedOrigins = parsedOrigins.map(url => url.replace(/\/$/, ''));

    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      logger.warn(`CORS Blocked: Origin '${origin}' is not in allowed origins: ${JSON.stringify(allowedOrigins)}`);
      callback(new Error(`Not allowed by CORS: '${origin}'`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  message: { success: false, message: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/api/v1/health' || process.env.NODE_ENV === 'development',
});

// More strict rate limit for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many authentication attempts, please try again in 15 minutes.' },
  skipSuccessfulRequests: true,
});

app.use('/api/', limiter);
app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/auth/register', authLimiter);
app.use('/api/v1/auth/forgot-password', authLimiter);

// ========================
// GENERAL MIDDLEWARE
// ========================
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(mongoSanitize()); // Prevent NoSQL injection
// Serve local evidence images with cross-origin policy so frontend can display them
app.use('/uploads', (req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(path.join(__dirname, '../public/uploads')));

// HTTP request logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', {
    stream: logger.stream,
  }));
}

// ========================
// SWAGGER DOCS
// ========================
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Parking System API',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
    },
  }));
  logger.info(`📖 Swagger docs available at http://localhost:${process.env.PORT || 5000}/api-docs`);


// Swagger JSON endpoint
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// ========================
// API ROUTES
// ========================
const API_PREFIX = process.env.API_PREFIX || '/api/v1';
app.use(API_PREFIX, routes);

// Root route
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🚗 Parking Building Management System API',
    version: '1.0.0',
    docs: `/api-docs`,
    health: `${API_PREFIX}/health`,
  });
});

// ========================
// ERROR HANDLING
// ========================
app.use(notFound);
app.use(errorHandler);

// ========================
// SOCKET.IO
// ========================
const io = initSocket(httpServer);
app.set('io', io); // Make io accessible in controllers

// ========================
// DATABASE + START
// ========================
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();

    // Sync slot counts for all lots on startup (fixes stale totalSlots/availableSlots)
    await syncAllLotSlotCounts();

    httpServer.listen(PORT, () => {
      logger.info(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
      logger.info(`🌐 API: http://localhost:${PORT}${API_PREFIX}`);
      logger.info(`📖 Docs: http://localhost:${PORT}/api-docs`);
      logger.info(`🔌 Socket.IO ready`);
    });

    // ========================
    // BACKGROUND WORKERS
    // ========================
    startOverdueWorker();        // Scan overdue sessions every 60s & push real-time alerts
    startPendingPassWorker();    // Auto-cancel unpaid monthly passes after 5 min
    startPendingBookingWorker(); // Auto-cancel unpaid bookings after 10 min
    startNoShowBookingWorker();  // Auto-mark bookings as no_show if not checked in by end time
  } catch (error) {
    logger.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  }
};

// ========================
// PROCESS HANDLERS
// ========================
process.on('unhandledRejection', (err) => {
  logger.error(`UNHANDLED REJECTION: ${err.message}`);
  logger.error(err.stack);
  httpServer.close(() => process.exit(1));
});

process.on('uncaughtException', (err) => {
  logger.error(`UNCAUGHT EXCEPTION: ${err.message}`);
  logger.error(err.stack);
  process.exit(1);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  stopOverdueWorker();
  stopPendingPassWorker();
  stopPendingBookingWorker();
  stopNoShowBookingWorker();
  httpServer.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received. Shutting down gracefully...');
  stopOverdueWorker();
  stopPendingPassWorker();
  stopPendingBookingWorker();
  stopNoShowBookingWorker();
  httpServer.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

startServer();

module.exports = { app, httpServer };
