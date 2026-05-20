const reportService = require('../report.service');
const ApiResponse = require('../../../utils/ApiResponse');
const asyncHandler = require('../../../utils/asyncHandler');

class ReportController {
  getDashboard = asyncHandler(async (req, res) => {
    const stats = await reportService.getDashboardStats(req.query.parkingLotId, req.user);
    ApiResponse.success(res, 'Dashboard stats retrieved.', stats);
  });

  getRevenueReport = asyncHandler(async (req, res) => {
    const report = await reportService.getRevenueReport(req.query, req.user);
    ApiResponse.success(res, 'Revenue report retrieved.', report);
  });

  getSessionReport = asyncHandler(async (req, res) => {
    const report = await reportService.getSessionReport(req.query, req.user);
    ApiResponse.success(res, 'Session report retrieved.', report);
  });

  getOccupancyReport = asyncHandler(async (req, res) => {
    const data = await reportService.getOccupancyReport(req.query.parkingLotId, req.user);
    ApiResponse.success(res, 'Occupancy report retrieved.', data);
  });

  exportSessions = asyncHandler(async (req, res) => {
    const sessions = await reportService.exportSessionsCSV(req.query, req.user);

    // Convert to CSV
    const csvHeader = 'Session Code,License Plate,Vehicle Type,Entry Time,Exit Time,Duration (h),Base Fee,Overtime Fee,Total Fee,Payment Method,Invoice Code\n';
    const csvRows = sessions.map(s =>
      [
        s.sessionCode,
        s.vehicleInfo?.licensePlate,
        s.vehicleType?.name,
        s.entryTime?.toISOString(),
        s.exitTime?.toISOString(),
        s.durationHours,
        s.baseFee,
        s.overtimeFee,
        s.totalFee,
        s.payment?.method || '',
        s.payment?.invoiceCode || '',
      ].join(',')
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=sessions_${Date.now()}.csv`);
    res.send(csvHeader + csvRows);
  });
}

module.exports = new ReportController();

// ===== ROUTES =====
const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../../../middleware/auth');
const ctrl = new ReportController();

router.use(protect);
router.use(restrictTo('system_admin', 'parking_manager', 'parking_staff'));

/**
 * @swagger
 * /reports/dashboard:
 *   get:
 *     summary: Get dashboard overview statistics
 *     tags: [Reports]
 *     parameters:
 *       - in: query
 *         name: parkingLotId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Dashboard statistics
 */
router.get('/dashboard', ctrl.getDashboard);

/**
 * @swagger
 * /reports/revenue:
 *   get:
 *     summary: Get revenue report
 *     tags: [Reports]
 *     parameters:
 *       - in: query
 *         name: period
 *         schema: { type: string, enum: [today, week, month, year] }
 *       - in: query
 *         name: groupBy
 *         schema: { type: string, enum: [hour, day, month, year] }
 *       - in: query
 *         name: parkingLotId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Revenue chart data and totals
 */
router.get('/revenue', ctrl.getRevenueReport);

/**
 * @swagger
 * /reports/sessions:
 *   get:
 *     summary: Get session report with peak hours analysis
 *     tags: [Reports]
 *     parameters:
 *       - in: query
 *         name: period
 *         schema: { type: string, enum: [today, week, month, year] }
 *     responses:
 *       200:
 *         description: Session statistics and charts
 */
router.get('/sessions', ctrl.getSessionReport);

/**
 * @swagger
 * /reports/occupancy:
 *   get:
 *     summary: Get occupancy rate by vehicle type
 *     tags: [Reports]
 *     parameters:
 *       - in: query
 *         name: parkingLotId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Occupancy data
 */
router.get('/occupancy', ctrl.getOccupancyReport);

/**
 * @swagger
 * /reports/export/sessions:
 *   get:
 *     summary: Export sessions as CSV
 *     tags: [Reports]
 *     parameters:
 *       - in: query
 *         name: period
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: CSV file download
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 */
router.get('/export/sessions', ctrl.exportSessions);

module.exports = router;
