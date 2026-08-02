const WorkSchedule = require('./workSchedule.model');
const User = require('../users/user.model');
const ApiError = require('../../utils/ApiError');
const mongoose = require('mongoose');
const dayjs = require('dayjs');
const { sendShiftAssignmentEmail } = require('../../utils/email');

exports.createOrUpdate = async (req, res, next) => {
  try {
    const { parkingLotId, monthYear, shifts } = req.body;

    // Check if exists
    let schedule = await WorkSchedule.findOne({
      staff: req.user._id,
      parkingLot: parkingLotId,
      monthYear
    });

    const now = dayjs();

    if (schedule) {
      const existingShifts = schedule.shifts;
      const newShifts = [];

      const lockedShifts = existingShifts.filter(s => {
        const isLockedStatus = s.status !== 'pending';
        const shiftDate = dayjs(`${s.date} 00:00:00`);
        const isTooClose = shiftDate.diff(now, 'hours') < 48;
        return isLockedStatus || isTooClose;
      });

      for (const s of shifts) {
        const shiftDate = dayjs(`${s.date} 00:00:00`);
        if (shiftDate.diff(now, 'hours') < 48) {
          const isExisting = lockedShifts.some(ls => ls.date === s.date && ls.shiftType === s.shiftType);
          if (!isExisting) {
            return next(ApiError.badRequest(`Cannot register/edit shift on ${s.date} (must be 48h in advance).`));
          }
        }
      }

      const lockedMap = {};
      lockedShifts.forEach(ls => {
        lockedMap[`${ls.date}_${ls.shiftType}`] = ls;
      });

      const shiftsToAdd = [];
      shifts.forEach(s => {
        const key = `${s.date}_${s.shiftType}`;
        if (!lockedMap[key]) {
          shiftsToAdd.push({ ...s, status: 'pending' });
        }
      });
      
      const ParkingLot = require('../parkingLots/parkingLot.model');
      const lot = await ParkingLot.findById(parkingLotId);
      const shiftQuotas = lot?.settings?.shiftQuotas || { morning: 2, afternoon: 2, night: 2 };
      
      const allSchedules = await WorkSchedule.find({ parkingLot: parkingLotId, monthYear });
      const getStaffCountForShift = (dateStr, shiftType) => {
        let count = 0;
        allSchedules.forEach(sched => {
          if (sched.staff.toString() === req.user._id.toString()) return; 
          sched.shifts.forEach(sh => {
            if (sh.date === dateStr && sh.shiftType === shiftType && sh.status !== 'rejected' && sh.status !== 'leave_approved') {
              count++;
            }
          });
        });
        return count;
      };

      for (const s of shiftsToAdd) {
        const currentCount = getStaffCountForShift(s.date, s.shiftType);
        const maxQuota = shiftQuotas[s.shiftType] || 2;
        if (currentCount >= maxQuota) {
           return next(ApiError.badRequest(`Shift ${s.shiftType} on ${s.date} is already full (Max ${maxQuota} staff).`));
        }
      }

      shiftsToAdd.forEach(s => newShifts.push(s));

      Object.values(lockedMap).forEach(ls => newShifts.push(ls));

      schedule.shifts = newShifts;
      schedule.status = 'pending';
      await schedule.save();
    } else {
      for (const s of shifts) {
        const shiftDate = dayjs(`${s.date} 00:00:00`);
        if (shiftDate.diff(now, 'hours') < 48) {
          return next(ApiError.badRequest(`Cannot register shift on ${s.date} (must be 48h in advance).`));
        }
      }

      const ParkingLot = require('../parkingLots/parkingLot.model');
      const lot = await ParkingLot.findById(parkingLotId);
      const shiftQuotas = lot?.settings?.shiftQuotas || { morning: 2, afternoon: 2, night: 2 };
      
      const allSchedules = await WorkSchedule.find({ parkingLot: parkingLotId, monthYear });
      const getStaffCountForShift = (dateStr, shiftType) => {
        let count = 0;
        allSchedules.forEach(sched => {
          sched.shifts.forEach(sh => {
            if (sh.date === dateStr && sh.shiftType === shiftType && sh.status !== 'rejected') {
              count++;
            }
          });
        });
        return count;
      };

      for (const s of shifts) {
        const currentCount = getStaffCountForShift(s.date, s.shiftType);
        const maxQuota = shiftQuotas[s.shiftType] || 2;
        if (currentCount >= maxQuota) {
           return next(ApiError.badRequest(`Shift ${s.shiftType} on ${s.date} is already full (Max ${maxQuota} staff).`));
        }
      }

      schedule = await WorkSchedule.create({
        staff: req.user._id,
        parkingLot: parkingLotId,
        monthYear,
        shifts: shifts.map(s => ({ ...s, status: 'pending' })),
        status: 'pending'
      });
    }

    res.status(200).json({
      success: true,
      data: schedule
    });
  } catch (error) {
    next(error);
  }
};

exports.getMySchedules = async (req, res, next) => {
  try {
    const { parkingLotId } = req.query;
    const filter = { staff: req.user._id };
    if (parkingLotId) filter.parkingLot = parkingLotId;

    const schedules = await WorkSchedule.find(filter).sort('-monthYear');

    // Auto-fix inconsistent statuses
    for (const schedule of schedules) {
      if (schedule.status === 'pending' || schedule.status === 'rejected') {
        const hasPending = schedule.shifts.some(s => s.status === 'pending');
        if (!hasPending && schedule.shifts.length > 0) {
          schedule.status = 'approved';
          await schedule.save();
        }
      }
    }

    res.status(200).json({
      success: true,
      data: schedules
    });
  } catch (error) {
    next(error);
  }
};

exports.getAvailability = async (req, res, next) => {
  try {
    const { parkingLotId, monthYear } = req.query;
    if (!parkingLotId || !monthYear) {
      return next(ApiError.badRequest('parkingLotId and monthYear are required'));
    }
    const ParkingLot = require('../parkingLots/parkingLot.model');
    const lot = await ParkingLot.findById(parkingLotId);
    const shiftQuotas = lot?.settings?.shiftQuotas || { morning: 2, afternoon: 2, night: 2 };
    
    const allSchedules = await WorkSchedule.find({ parkingLot: parkingLotId, monthYear });
    
    const counts = {};
    allSchedules.forEach(sched => {
      sched.shifts.forEach(s => {
        if (s.status !== 'rejected' && s.status !== 'leave_approved') {
          const key = `${s.date}_${s.shiftType}`;
          counts[key] = (counts[key] || 0) + 1;
        }
      });
    });
    
    const fullShifts = [];
    Object.keys(counts).forEach(key => {
      const shiftType = key.split('_')[1];
      const max = shiftQuotas[shiftType] || 2;
      if (counts[key] >= max) {
        fullShifts.push(key);
      }
    });
    
    res.status(200).json({
      success: true,
      data: {
        shiftQuotas,
        fullShifts
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.getManagerSchedules = async (req, res, next) => {
  try {
    const { parkingLotId } = req.query;
    const filter = {};
    if (parkingLotId) filter.parkingLot = parkingLotId;
    if (req.user.role === 'parking_manager' && req.user.assignedParkingLot) {
      const assigned = req.user.assignedParkingLot;
      if (parkingLotId) {
        filter.parkingLot = parkingLotId;
      } else if (Array.isArray(assigned) && assigned.length > 0) {
        filter.parkingLot = { $in: assigned };
      } else if (assigned) {
        filter.parkingLot = assigned;
      }
    }

    const schedules = await WorkSchedule.find(filter)
      .populate('staff', 'fullName email phone')
      .populate('parkingLot', 'name code')
      .sort('-monthYear');

    // Auto-fix inconsistent statuses
    for (const schedule of schedules) {
      if (schedule.status === 'pending' || schedule.status === 'rejected') {
        const hasPending = schedule.shifts.some(s => s.status === 'pending');
        if (!hasPending && schedule.shifts.length > 0) {
          schedule.status = 'approved';
          await schedule.save();
        }
      }
    }

    res.status(200).json({
      success: true,
      data: schedules
    });
  } catch (error) {
    next(error);
  }
};

exports.updateStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, managerNote, shiftId, bulk } = req.body;

    const schedule = await WorkSchedule.findById(id);
    if (!schedule) {
      return next(ApiError.notFound('Schedule not found'));
    }

    if (bulk) {
      // Approve all pending shifts
      schedule.shifts.forEach(s => {
        if (s.status === 'pending') {
          s.status = status;
          if (managerNote !== undefined) s.managerNote = managerNote;
        }
      });
      // Optionally update global status
      schedule.status = status;
    } else if (shiftId) {
      // Approve specific shift
      const shift = schedule.shifts.id(shiftId);
      if (!shift) return next(ApiError.notFound('Shift not found'));
      shift.status = status;
      if (managerNote !== undefined) shift.managerNote = managerNote;
    } else {
      // Fallback for global
      schedule.status = status;
      if (managerNote !== undefined) schedule.managerNote = managerNote;
    }

    // Auto-update global status if all shifts are approved
    if (!bulk && !shiftId && status === 'published') {
      schedule.shifts.forEach(s => {
        if (s.status === 'approved') s.status = 'published';
      });
    }

    // Auto-update parent status if there are no pending shifts left
    if (schedule.status === 'pending' || schedule.status === 'rejected') {
      const hasPending = schedule.shifts.some(s => s.status === 'pending');
      if (!hasPending && schedule.shifts.length > 0) {
        schedule.status = 'approved';
      }
    }

    await schedule.save();

    res.status(200).json({
      success: true,
      data: schedule
    });
  } catch (error) {
    next(error);
  }
};

exports.requestLeave = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { date, shiftType, leaveReason } = req.body;

    const schedule = await WorkSchedule.findOne({ _id: id, staff: req.user._id });
    if (!schedule) {
      return next(ApiError.notFound('Schedule not found'));
    }

    const shift = schedule.shifts.find(s => s.date === date && s.shiftType === shiftType);
    if (!shift) {
      return next(ApiError.notFound('Shift not found'));
    }

    if (shift.status !== 'approved' && shift.status !== 'published') {
      return next(ApiError.badRequest('Can only request leave for approved or published shifts'));
    }

    shift.status = 'leave_pending';
    shift.leaveReason = leaveReason;

    await schedule.save();

    res.status(200).json({
      success: true,
      data: schedule
    });
  } catch (error) {
    next(error);
  }
};

exports.assignStaffToShift = async (req, res, next) => {
  try {
    const { parkingLotId, staffId, date, shiftType } = req.body;
    if (!parkingLotId || !staffId || !date || !shiftType) {
      return next(ApiError.badRequest('Missing required fields'));
    }

    const monthYear = date.substring(0, 7); 
    let schedule = await WorkSchedule.findOne({ staff: staffId, parkingLot: parkingLotId, monthYear });
    
    if (!schedule) {
      schedule = new WorkSchedule({ staff: staffId, parkingLot: parkingLotId, monthYear, shifts: [], status: 'approved' });
    }

    const existing = schedule.shifts.find(s => s.date === date && s.shiftType === shiftType);
    if (existing) {
       if (existing.status === 'approved' || existing.status === 'published' || existing.status === 'pending') {
          return next(ApiError.badRequest('Staff is already assigned or requested this shift'));
       }
       existing.status = 'approved';
    } else {
       schedule.shifts.push({ date, shiftType, status: 'approved' });
    }
    
    await schedule.save();

    // Send email notification
    try {
      const staffUser = await User.findById(staffId);
      if (staffUser && staffUser.email) {
        await sendShiftAssignmentEmail(staffUser, { date, shiftType });
      }
    } catch (emailErr) {
      console.error('Failed to send shift assignment email:', emailErr);
    }

    res.status(200).json({ success: true, data: schedule });
  } catch (error) {
    next(error);
  }
};
