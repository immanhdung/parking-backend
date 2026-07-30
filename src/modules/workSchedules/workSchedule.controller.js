const WorkSchedule = require('./workSchedule.model');
const ApiError = require('../../utils/ApiError');
const mongoose = require('mongoose');

exports.createOrUpdate = async (req, res, next) => {
  try {
    const { parkingLotId, monthYear, shifts } = req.body;
    
    // Check if exists
    let schedule = await WorkSchedule.findOne({
      staff: req.user._id,
      parkingLot: parkingLotId,
      monthYear
    });
    
    if (schedule && schedule.status !== 'pending') {
      return next(ApiError.badRequest('Cannot edit a schedule that is already approved or rejected'));
    }
    
    if (schedule) {
      schedule.shifts = shifts;
      schedule.status = 'pending'; // Reset status if edited
      await schedule.save();
    } else {
      schedule = await WorkSchedule.create({
        staff: req.user._id,
        parkingLot: parkingLotId,
        monthYear,
        shifts,
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
    res.status(200).json({
      success: true,
      data: schedules
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
      filter.parkingLot = req.user.assignedParkingLot;
    }
    
    const schedules = await WorkSchedule.find(filter)
      .populate('staff', 'fullName email phone')
      .populate('parkingLot', 'name code')
      .sort('-monthYear');
      
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
    const { status, managerNote } = req.body;
    
    const schedule = await WorkSchedule.findById(id);
    if (!schedule) {
      return next(ApiError.notFound('Schedule not found'));
    }
    
    schedule.status = status;
    if (managerNote !== undefined) schedule.managerNote = managerNote;
    
    await schedule.save();
    
    res.status(200).json({
      success: true,
      data: schedule
    });
  } catch (error) {
    next(error);
  }
};
