const express = require('express');
const router = express.Router();
const ctrl = require('../parkingLot.controller');
const { protect, restrictTo } = require('../../../middleware/auth');

router.use(protect);

/**
 * @swagger
 * /parking-lots:
 *   get:
 *     summary: Get all parking lots
 *     tags: [Parking Lots]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [active, inactive, maintenance, closed] }
 *     responses:
 *       200:
 *         description: List of parking lots
 *   post:
 *     summary: Create parking lot (admin only)
 *     tags: [Parking Lots]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, code, address]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Bãi Xe Tòa Nhà Vincom
 *               code:
 *                 type: string
 *                 example: VCBP01
 *               address:
 *                 type: object
 *                 properties:
 *                   street:
 *                     type: string
 *                   district:
 *                     type: string
 *                   city:
 *                     type: string
 *               manager:
 *                 type: string
 *                 description: ObjectId of a user with role parking_manager
 *     responses:
 *       201:
 *         description: Parking lot created
 *       400:
 *         description: Invalid manager role
 *       409:
 *         description: Code already exists
 */
router.get('/', ctrl.getAll);
router.post('/', restrictTo('parking_manager'), ctrl.create);

/**
 * @swagger
 * /parking-lots/available-staff:
 *   get:
 *     summary: Get unassigned staff (manager/admin)
 *     tags: [Parking Lots - Staff Assignment]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search by name, email or phone
 *     responses:
 *       200:
 *         description: List of available staff
 */
router.get('/available-staff', restrictTo('parking_manager'), ctrl.getAvailableStaff);

/**
 * @swagger
 * /parking-lots/{id}:
 *   get:
 *     summary: Get parking lot by ID
 *     tags: [Parking Lots]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Parking lot data
 *   put:
 *     summary: Update parking lot
 *     tags: [Parking Lots]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Updated
 *   delete:
 *     summary: Delete parking lot (admin)
 *     tags: [Parking Lots]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Deleted
 */
router.get('/:id', ctrl.getById);
router.put('/:id', restrictTo('system_admin', 'parking_manager'), ctrl.update);
router.delete('/:id', restrictTo('system_admin'), ctrl.delete);
router.get('/:id/slots-summary', ctrl.getSlotsSummary);

/**
 * @swagger
 * /parking-lots/{id}/staff:
 *   get:
 *     summary: Get staff assigned to a parking lot
 *     tags: [Parking Lots - Staff Assignment]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Parking lot ID
 *     responses:
 *       200:
 *         description: List of assigned staff
 *   post:
 *     summary: Assign staff to a parking lot
 *     tags: [Parking Lots - Staff Assignment]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [staffId]
 *             properties:
 *               staffId:
 *                 type: string
 *                 description: User ID of the staff member
 *                 example: 60d5ec49f1b2c72b9c8e4d3a
 *     responses:
 *       200:
 *         description: Staff assigned
 *       409:
 *         description: Staff already assigned
 */
router.get('/:id/staff', restrictTo('parking_manager'), ctrl.getStaff);
router.post('/:id/staff', restrictTo('parking_manager'), ctrl.assignStaff);

/**
 * @swagger
 * /parking-lots/{id}/staff/{staffId}:
 *   delete:
 *     summary: Remove staff from a parking lot
 *     tags: [Parking Lots - Staff Assignment]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Parking lot ID
 *       - in: path
 *         name: staffId
 *         required: true
 *         schema: { type: string }
 *         description: Staff user ID
 *     responses:
 *       200:
 *         description: Staff removed
 *       404:
 *         description: Staff not found in this lot
 */
router.delete('/:id/staff/:staffId', restrictTo('parking_manager'), ctrl.removeStaff);

module.exports = router;
