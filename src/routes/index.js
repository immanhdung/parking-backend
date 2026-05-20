const express = require('express');
const router = express.Router();

// Module routes
const authRoutes = require('../modules/auth/routes/auth.routes');
const userRoutes = require('../modules/users/routes/user.routes');
const parkingLotRoutes = require('../modules/parkingLots/routes/parkingLot.routes');
const floorRoutes = require('../modules/floors/routes/floor.routes');
const { zoneRouter, vehicleTypeRouter } = require('../modules/zones/routes/zone.routes');
const parkingSlotRoutes = require('../modules/parkingSlots/routes/parkingSlot.routes');
const bookingRoutes = require('../modules/bookings/routes/booking.routes');
const parkingSessionRoutes = require('../modules/parkingSessions/routes/parkingSession.routes');
const paymentRoutes = require('../modules/payments/routes/payment.routes');
const reportRoutes = require('../modules/reports/routes/report.routes');
const notificationRoutes = require('../modules/notifications/routes/notification.routes');
const feedbackRoutes = require('../modules/feedbacks/routes/feedback.routes');
const incidentRoutes = require('../modules/incidents/routes/incident.routes');

// Mount routes
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/parking-lots', parkingLotRoutes);
router.use('/floors', floorRoutes);
router.use('/zones', zoneRouter);
router.use('/vehicle-types', vehicleTypeRouter);
router.use('/parking-slots', parkingSlotRoutes);
router.use('/bookings', bookingRoutes);
router.use('/parking-sessions', parkingSessionRoutes);
router.use('/payments', paymentRoutes);
router.use('/reports', reportRoutes);
router.use('/notifications', notificationRoutes);
router.use('/feedbacks', feedbackRoutes);
router.use('/incidents', incidentRoutes);

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Parking Building Management API is running',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

module.exports = router;
