const express = require('express');
const router = express.Router();
const ctrl = require('../monthlyPass.controller');
const { protect, restrictTo } = require('../../../middleware/auth');

router.use(protect);

// User routes
router.post('/my-passes', restrictTo('parking_user'), ctrl.createMonthlyPass);
router.get('/my-passes', restrictTo('parking_user'), ctrl.getMyMonthlyPasses);

// Admin/Staff routes
router.get('/', restrictTo('system_admin', 'parking_manager', 'parking_staff'), ctrl.getAllMonthlyPasses);
router.get('/verify', restrictTo('system_admin', 'parking_manager', 'parking_staff'), ctrl.verifyPassByCode);

// Shared
router.get('/:id', ctrl.getMonthlyPassById);
router.patch('/:id/change-vehicle', restrictTo('parking_user', 'system_admin', 'parking_manager'), ctrl.changeVehicle);
router.delete('/my-passes/:id', restrictTo('parking_user'), ctrl.cancelMyPass);

module.exports = router;
