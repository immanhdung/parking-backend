const express = require('express');
const router = express.Router();
const workScheduleController = require('../workSchedule.controller');
const { protect, restrictTo } = require('../../../middleware/auth');

router.use(protect);

router.post('/', restrictTo('parking_staff'), workScheduleController.createOrUpdate);
router.put('/:id/leave-request', restrictTo('parking_staff'), workScheduleController.requestLeave);
router.get('/my', restrictTo('parking_staff'), workScheduleController.getMySchedules);
router.get('/availability', restrictTo('parking_staff'), workScheduleController.getAvailability);

router.get('/manager', restrictTo('parking_manager', 'system_admin'), workScheduleController.getManagerSchedules);
router.post('/assign', restrictTo('parking_manager', 'system_admin'), workScheduleController.assignStaffToShift);
router.put('/:id/status', restrictTo('parking_manager', 'system_admin'), workScheduleController.updateStatus);

module.exports = router;
