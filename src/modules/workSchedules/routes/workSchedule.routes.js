const express = require('express');
const router = express.Router();
const workScheduleController = require('../workSchedule.controller');
const { protect, restrictTo } = require('../../../middleware/auth');

router.use(protect);

router.post('/', restrictTo('parking_staff'), workScheduleController.createOrUpdate);
router.get('/my', restrictTo('parking_staff'), workScheduleController.getMySchedules);
router.get('/availability', restrictTo('parking_staff'), workScheduleController.getAvailability);

router.get('/manager', restrictTo('parking_manager', 'system_admin'), workScheduleController.getManagerSchedules);
router.put('/:id/status', restrictTo('parking_manager', 'system_admin'), workScheduleController.updateStatus);

module.exports = router;
