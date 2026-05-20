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
 *     responses:
 *       201:
 *         description: Parking lot created
 */
router.get('/', ctrl.getAll);
router.post('/', restrictTo('system_admin'), ctrl.create);

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

module.exports = router;
