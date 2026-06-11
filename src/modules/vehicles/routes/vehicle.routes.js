const express = require('express');
const router = express.Router();
const vehicleController = require('../vehicle.controller');
const { protect } = require('../../../middleware/auth');

/**
 * @swagger
 * tags:
 *   name: Vehicles
 *   description: User vehicle management
 */

// All routes require authentication
router.use(protect);

/**
 * @swagger
 * /vehicles:
 *   get:
 *     summary: Get my vehicles
 *     tags: [Vehicles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: List of user vehicles
 *   post:
 *     summary: Add a new vehicle
 *     tags: [Vehicles]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [vehicleType, licensePlate]
 *             properties:
 *               vehicleType:
 *                 type: string
 *                 description: MongoDB ObjectId of VehicleType
 *                 example: "60d5ec49f1b2c72b9c8e4d3a"
 *               licensePlate:
 *                 type: string
 *                 example: "29A-12345"
 *               vehicleModel:
 *                 type: string
 *                 example: "Honda Civic 2024"
 *               vehicleColor:
 *                 type: string
 *                 example: "Trắng"
 *               vehicleBrand:
 *                 type: string
 *                 example: "Honda"
 *               nickname:
 *                 type: string
 *                 example: "Xe đi làm"
 *               isDefault:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       201:
 *         description: Vehicle added
 *       409:
 *         description: Duplicate license plate
 */
router.get('/', vehicleController.getMyVehicles);
router.post('/', vehicleController.addVehicle);

/**
 * @swagger
 * /vehicles/default:
 *   get:
 *     summary: Get my default vehicle
 *     tags: [Vehicles]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Default vehicle data
 */
router.get('/default', vehicleController.getDefaultVehicle);

/**
 * @swagger
 * /vehicles/{id}:
 *   get:
 *     summary: Get vehicle by ID
 *     tags: [Vehicles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Vehicle data
 *       404:
 *         description: Vehicle not found
 *   put:
 *     summary: Update vehicle
 *     tags: [Vehicles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               vehicleType:
 *                 type: string
 *               licensePlate:
 *                 type: string
 *               vehicleModel:
 *                 type: string
 *               vehicleColor:
 *                 type: string
 *               vehicleBrand:
 *                 type: string
 *               nickname:
 *                 type: string
 *               isDefault:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Vehicle updated
 *       404:
 *         description: Vehicle not found
 *   delete:
 *     summary: Delete vehicle
 *     tags: [Vehicles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Vehicle deleted
 */
router.get('/:id', vehicleController.getVehicleById);
router.put('/:id', vehicleController.updateVehicle);
router.delete('/:id', vehicleController.deleteVehicle);

/**
 * @swagger
 * /vehicles/{id}/default:
 *   patch:
 *     summary: Set vehicle as default
 *     tags: [Vehicles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Default vehicle updated
 */
router.patch('/:id/default', vehicleController.setDefault);

module.exports = router;
