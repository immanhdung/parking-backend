const ParkingSession = require('../parkingSessions/parkingSession.model');
const Payment = require('../payments/payment.model');
const Booking = require('../bookings/booking.model');
const ParkingSlot = require('../parkingSlots/parkingSlot.model');
const User = require('../users/user.model');
const { getDateRange, isPeakHour } = require('../../utils/helpers');
const mongoose = require('mongoose');

class ReportService {
  /**
   * Dashboard overview statistics
   */
  async getDashboardStats(parkingLotId, user) {
    const filter = {};
    if (user.role === 'parking_manager' || user.role === 'parking_staff') {
      filter.parkingLot = new mongoose.Types.ObjectId(user.assignedParkingLot);
    } else if (parkingLotId) {
      filter.parkingLot = new mongoose.Types.ObjectId(parkingLotId);
    }

    const today = getDateRange('today');

    const [
      totalSessions,
      activeSessions,
      todaySessions,
      todayRevenue,
      slotStats,
      totalUsers,
    ] = await Promise.all([
      ParkingSession.countDocuments({ ...filter }),
      ParkingSession.countDocuments({ ...filter, status: 'active' }),
      ParkingSession.countDocuments({
        ...filter,
        entryTime: { $gte: today.start, $lte: today.end },
      }),
      Payment.aggregate([
        {
          $match: {
            ...filter,
            status: 'completed',
            paidAt: { $gte: today.start, $lte: today.end },
          },
        },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      ParkingSlot.aggregate([
        { $match: { ...(filter.parkingLot ? { parkingLot: filter.parkingLot } : {}), isDeleted: { $ne: true } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      User.countDocuments({ role: 'parking_user', isDeleted: { $ne: true } }),
    ]);

    const slotSummary = { total: 0, available: 0, occupied: 0, reserved: 0, maintenance: 0, locked: 0 };
    slotStats.forEach(s => {
      slotSummary[s._id] = s.count;
      slotSummary.total += s.count;
    });
    const occupancyRate = slotSummary.total > 0
      ? Math.round((slotSummary.occupied / slotSummary.total) * 100)
      : 0;

    return {
      totalSessions,
      activeSessions,
      todaySessions,
      todayRevenue: todayRevenue[0]?.total || 0,
      slots: slotSummary,
      occupancyRate,
      totalUsers,
    };
  }

  /**
   * Revenue report by period
   */
  async getRevenueReport(query, user) {
    const { period = 'month', parkingLotId, groupBy = 'day' } = query;
    const { start, end } = getDateRange(period);

    const match = {
      status: 'completed',
      paidAt: { $gte: start, $lte: end },
    };

    if (user.role === 'parking_manager') {
      match.parkingLot = new mongoose.Types.ObjectId(user.assignedParkingLot);
    } else if (parkingLotId) {
      match.parkingLot = new mongoose.Types.ObjectId(parkingLotId);
    }

    let dateGroup;
    if (groupBy === 'hour') {
      dateGroup = { year: { $year: '$paidAt' }, month: { $month: '$paidAt' }, day: { $dayOfMonth: '$paidAt' }, hour: { $hour: '$paidAt' } };
    } else if (groupBy === 'day') {
      dateGroup = { year: { $year: '$paidAt' }, month: { $month: '$paidAt' }, day: { $dayOfMonth: '$paidAt' } };
    } else if (groupBy === 'month') {
      dateGroup = { year: { $year: '$paidAt' }, month: { $month: '$paidAt' } };
    } else {
      dateGroup = { year: { $year: '$paidAt' } };
    }

    const revenue = await Payment.aggregate([
      { $match: match },
      {
        $group: {
          _id: dateGroup,
          totalRevenue: { $sum: '$amount' },
          count: { $sum: 1 },
          avgRevenue: { $avg: '$amount' },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.hour': 1 } },
    ]);

    // Revenue by payment method
    const byMethod = await Payment.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$method',
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]);

    const totalRevenue = revenue.reduce((sum, r) => sum + r.totalRevenue, 0);
    const totalTransactions = revenue.reduce((sum, r) => sum + r.count, 0);

    return {
      period,
      start,
      end,
      totalRevenue,
      totalTransactions,
      avgPerTransaction: totalTransactions > 0 ? totalRevenue / totalTransactions : 0,
      chart: revenue,
      byMethod,
    };
  }

  /**
   * Session report - sessions count and duration
   */
  async getSessionReport(query, user) {
    const { period = 'month', parkingLotId } = query;
    const { start, end } = getDateRange(period);

    const match = {
      entryTime: { $gte: start, $lte: end },
      status: 'completed',
    };

    if (user.role === 'parking_manager') {
      match.parkingLot = new mongoose.Types.ObjectId(user.assignedParkingLot);
    } else if (parkingLotId) {
      match.parkingLot = new mongoose.Types.ObjectId(parkingLotId);
    }

    const [sessionsByDay, byVehicleType, avgDuration, peakHours] = await Promise.all([
      // Sessions grouped by day
      ParkingSession.aggregate([
        { $match: match },
        {
          $group: {
            _id: {
              year: { $year: '$entryTime' },
              month: { $month: '$entryTime' },
              day: { $dayOfMonth: '$entryTime' },
            },
            count: { $sum: 1 },
            totalFee: { $sum: '$totalFee' },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
      ]),

      // By vehicle type
      ParkingSession.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$vehicleType',
            count: { $sum: 1 },
            totalRevenue: { $sum: '$totalFee' },
          },
        },
        {
          $lookup: {
            from: 'vehicletypes',
            localField: '_id',
            foreignField: '_id',
            as: 'vehicleType',
          },
        },
        { $unwind: '$vehicleType' },
        { $sort: { count: -1 } },
      ]),

      // Avg duration
      ParkingSession.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            avgDurationHours: { $avg: '$durationHours' },
            avgFee: { $avg: '$totalFee' },
            totalSessions: { $sum: 1 },
            totalOvertime: { $sum: { $cond: ['$isOvertime', 1, 0] } },
          },
        },
      ]),

      // Peak hours
      ParkingSession.aggregate([
        { $match: match },
        {
          $group: {
            _id: { $hour: '$entryTime' },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),
    ]);

    return {
      period,
      chart: sessionsByDay,
      byVehicleType,
      summary: avgDuration[0] || { avgDurationHours: 0, avgFee: 0, totalSessions: 0, totalOvertime: 0 },
      peakHours,
    };
  }

  /**
   * Occupancy rate report
   */
  async getOccupancyReport(parkingLotId, user) {
    const lotId = user.role === 'parking_manager' ? user.assignedParkingLot : parkingLotId;

    const slotStats = await ParkingSlot.aggregate([
      {
        $match: {
          parkingLot: new mongoose.Types.ObjectId(lotId),
          isDeleted: { $ne: true },
        },
      },
      {
        $group: {
          _id: { vehicleType: '$vehicleType', status: '$status' },
          count: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: 'vehicletypes',
          localField: '_id.vehicleType',
          foreignField: '_id',
          as: 'vehicleType',
        },
      },
      { $unwind: '$vehicleType' },
    ]);

    return slotStats;
  }

  /**
   * Export report as CSV data
   */
  async exportSessionsCSV(query, user) {
    const { period = 'month', parkingLotId } = query;
    const { start, end } = getDateRange(period);

    const filter = {
      status: 'completed',
      entryTime: { $gte: start, $lte: end },
    };

    if (user.role === 'parking_manager') {
      filter.parkingLot = user.assignedParkingLot;
    } else if (parkingLotId) {
      filter.parkingLot = parkingLotId;
    }

    const sessions = await ParkingSession.find(filter)
      .populate('vehicleType', 'name')
      .populate('slot', 'slotCode')
      .populate('floor', 'name')
      .populate('payment', 'invoiceCode method')
      .sort('-entryTime')
      .limit(5000);

    return sessions;
  }
}

module.exports = new ReportService();
