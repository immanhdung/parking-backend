const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../modules/users/user.model');
const logger = require('../utils/logger');

let io;

const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        const rawOrigins = [
          process.env.CLIENT_URL,
          process.env.ADMIN_URL,
          'http://localhost:3000',
          'http://localhost:3001',
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
          logger.warn(`Socket.IO CORS Blocked: Origin '${origin}' is not in allowed origins: ${JSON.stringify(allowedOrigins)}`);
          callback(new Error(`Not allowed by CORS: '${origin}'`));
        }
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // ========================
  // AUTH MIDDLEWARE
  // ========================
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.split(' ')[1];

      if (!token) {
        // Allow unauthenticated connections for public rooms
        socket.user = null;
        return next();
      }

      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      const user = await User.findById(decoded.id).select('fullName role status assignedParkingLot');

      if (!user || user.status !== 'active') {
        return next(new Error('Authentication failed'));
      }

      socket.user = user;
      next();
    } catch (err) {
      socket.user = null;
      next(); // Allow anonymous for public views
    }
  });

  // ========================
  // CONNECTION HANDLER
  // ========================
  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id} | User: ${socket.user?.fullName || 'Anonymous'}`);

    // ---- Join user's personal room ----
    if (socket.user) {
      socket.join(`user:${socket.user._id}`);
      logger.debug(`User ${socket.user.fullName} joined personal room`);

      // Staff/manager join their assigned parking lot room
      if (socket.user.assignedParkingLot) {
        socket.join(`parkingLot:${socket.user.assignedParkingLot}`);
        logger.debug(`User ${socket.user.fullName} joined lot:${socket.user.assignedParkingLot}`);
      }

      // Admin joins all admin room
      if (socket.user.role === 'system_admin') {
        socket.join('admin:global');
      }
    }

    // ---- Client: join specific parking lot room ----
    socket.on('joinParkingLot', (parkingLotId) => {
      if (!parkingLotId) return;
      socket.join(`parkingLot:${parkingLotId}`);
      socket.emit('joinedParkingLot', { parkingLotId });
      logger.debug(`Socket ${socket.id} joined parkingLot:${parkingLotId}`);
    });

    // ---- Client: leave parking lot room ----
    socket.on('leaveParkingLot', (parkingLotId) => {
      socket.leave(`parkingLot:${parkingLotId}`);
    });

    // ---- Client: join floor room for slot map ----
    socket.on('joinFloor', (floorId) => {
      if (!floorId) return;
      socket.join(`floor:${floorId}`);
      socket.emit('joinedFloor', { floorId });
    });

    socket.on('leaveFloor', (floorId) => {
      socket.leave(`floor:${floorId}`);
    });

    // ---- Ping/pong health check ----
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });

    // ---- Dashboard subscription (admin/manager) ----
    socket.on('subscribeDashboard', (parkingLotId) => {
      if (!socket.user) return;
      const room = parkingLotId ? `dashboard:${parkingLotId}` : 'dashboard:global';
      socket.join(room);
      socket.emit('dashboardSubscribed', { room });
    });

    // ---- Disconnect ----
    socket.on('disconnect', (reason) => {
      logger.info(`Socket disconnected: ${socket.id} | Reason: ${reason}`);
    });

    socket.on('error', (err) => {
      logger.error(`Socket error: ${err.message}`);
    });
  });

  logger.info('✅ Socket.IO server initialized');
  return io;
};

// ========================
// EMIT HELPERS
// ========================

/**
 * Emit to a specific user
 */
const emitToUser = (userId, event, data) => {
  if (io) io.to(`user:${userId}`).emit(event, data);
};

/**
 * Emit to all sockets in a parking lot room
 */
const emitToParkingLot = (parkingLotId, event, data) => {
  if (io) io.to(`parkingLot:${parkingLotId}`).emit(event, data);
};

/**
 * Emit slot status update
 */
const emitSlotUpdate = (parkingLotId, slotData) => {
  emitToParkingLot(parkingLotId, 'slotStatusUpdated', slotData);
};

/**
 * Emit dashboard stats update
 */
const emitDashboardUpdate = (parkingLotId, stats) => {
  if (io) {
    if (parkingLotId) {
      io.to(`dashboard:${parkingLotId}`).emit('dashboardUpdated', stats);
    }
    io.to('dashboard:global').emit('dashboardUpdated', stats);
    io.to('admin:global').emit('dashboardUpdated', stats);
  }
};

/**
 * Emit overdue alert
 */
const emitOverdueAlert = (parkingLotId, sessionData) => {
  emitToParkingLot(parkingLotId, 'overdueAlert', sessionData);
};

/**
 * Get Socket.IO instance
 */
const getIO = () => {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
};

module.exports = {
  initSocket,
  getIO,
  emitToUser,
  emitToParkingLot,
  emitSlotUpdate,
  emitDashboardUpdate,
  emitOverdueAlert,
};
