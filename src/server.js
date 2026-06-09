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
}));

// CORS
app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = [
      process.env.CLIENT_URL,
      process.env.ADMIN_URL,
      'http://localhost:3000',
      'http://localhost:3001',
      `http://localhost:${process.env.PORT || 5000}`,
      `http://127.0.0.1:${process.env.PORT || 5000}`,
    ].filter(Boolean);

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
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
  skip: (req) => req.path === '/api/v1/health',
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

    httpServer.listen(PORT, () => {
      logger.info(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
      logger.info(`🌐 API: http://localhost:${PORT}${API_PREFIX}`);
      logger.info(`📖 Docs: http://localhost:${PORT}/api-docs`);
      logger.info(`🔌 Socket.IO ready`);
    });
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
  httpServer.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received. Shutting down gracefully...');
  httpServer.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

startServer();

module.exports = { app, httpServer };
