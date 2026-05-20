const express = require('express');
const router = express.Router();
const Incident = require('../incident.model');
const ApiError = require('../../../utils/ApiError');
const Pagination = require('../../../utils/pagination');
const ApiResponse = require('../../../utils/ApiResponse');
const asyncHandler = require('../../../utils/asyncHandler');
const { protect, restrictTo } = require('../../../middleware/auth');

// ===== SERVICE =====
class IncidentService {
  async getAll(query, user) {
    const { page = 1, limit = 10, sort = '-createdAt', status, type, severity, parkingLot } = query;
    const filter = {};

    if (user.role === 'parking_manager') filter.parkingLot = user.assignedParkingLot;
    if (user.role === 'parking_staff') filter.parkingLot = user.assignedParkingLot;
    if (parkingLot && user.role === 'system_admin') filter.parkingLot = parkingLot;
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (severity) filter.severity = severity;

    return Pagination.paginate(Incident, filter, {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: Pagination.buildSort(sort),
      populate: [
        { path: 'reportedBy', select: 'fullName role' },
        { path: 'parkingLot', select: 'name code' },
        { path: 'slot', select: 'slotCode' },
        { path: 'assignedTo', select: 'fullName' },
      ],
    });
  }

  async getById(id) {
    const incident = await Incident.findById(id)
      .populate('reportedBy', 'fullName email role')
      .populate('parkingLot', 'name code')
      .populate('parkingSession', 'sessionCode vehicleInfo')
      .populate('booking', 'bookingCode')
      .populate('slot', 'slotCode floor zone')
      .populate('assignedTo', 'fullName email')
      .populate('resolution.resolvedBy', 'fullName');
    if (!incident) throw ApiError.notFound('Incident not found.');
    return incident;
  }

  async create(data, staffId) {
    const { v4: uuidv4 } = require('uuid');
    const incidentCode = `INC-${Date.now().toString(36).toUpperCase()}-${uuidv4().substring(0, 4).toUpperCase()}`;

    const incident = await Incident.create({ ...data, reportedBy: staffId, incidentCode });
    return incident;
  }

  async update(id, data) {
    const incident = await Incident.findByIdAndUpdate(id, data, { new: true, runValidators: true });
    if (!incident) throw ApiError.notFound('Incident not found.');
    return incident;
  }

  async resolve(id, resolutionData, staffId) {
    const incident = await Incident.findByIdAndUpdate(
      id,
      {
        status: 'resolved',
        resolution: { ...resolutionData, resolvedBy: staffId, resolvedAt: new Date() },
      },
      { new: true }
    );
    if (!incident) throw ApiError.notFound('Incident not found.');
    return incident;
  }

  async assign(id, assigneeId) {
    const incident = await Incident.findByIdAndUpdate(
      id,
      { assignedTo: assigneeId, status: 'in_progress' },
      { new: true }
    ).populate('assignedTo', 'fullName');
    if (!incident) throw ApiError.notFound('Incident not found.');
    return incident;
  }
}

const incidentService = new IncidentService();

// ===== ROUTES =====
router.use(protect);

/**
 * @swagger
 * /incidents:
 *   get:
 *     summary: Get all incidents
 *     tags: [Incidents]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [open, in_progress, resolved, closed, escalated] }
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [lost_ticket, wrong_license_plate, overdue, wrong_zone, slot_occupied, slot_damaged, vehicle_damage, theft, other] }
 *       - in: query
 *         name: severity
 *         schema: { type: string, enum: [low, medium, high, critical] }
 *     responses:
 *       200:
 *         description: Incident list
 *   post:
 *     summary: Report an incident
 *     tags: [Incidents]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [parkingLot, type, title, description]
 *             properties:
 *               parkingLot:
 *                 type: string
 *               type:
 *                 type: string
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               severity:
 *                 type: string
 *                 enum: [low, medium, high, critical]
 *               parkingSession:
 *                 type: string
 *               slot:
 *                 type: string
 *     responses:
 *       201:
 *         description: Incident reported
 */
router.get('/', asyncHandler(async (req, res) => {
  const { docs, pagination } = await incidentService.getAll(req.query, req.user);
  ApiResponse.paginated(res, 'Incidents retrieved.', docs, pagination);
}));

router.post('/', restrictTo('system_admin', 'parking_manager', 'parking_staff'), asyncHandler(async (req, res) => {
  const incident = await incidentService.create(req.body, req.user._id);
  ApiResponse.created(res, 'Incident reported.', incident);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const incident = await incidentService.getById(req.params.id);
  ApiResponse.success(res, 'Incident retrieved.', incident);
}));

router.put('/:id', restrictTo('system_admin', 'parking_manager', 'parking_staff'), asyncHandler(async (req, res) => {
  const incident = await incidentService.update(req.params.id, req.body);
  ApiResponse.success(res, 'Incident updated.', incident);
}));

/**
 * @swagger
 * /incidents/{id}/resolve:
 *   patch:
 *     summary: Resolve an incident
 *     tags: [Incidents]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               description:
 *                 type: string
 *               extraCharge:
 *                 type: number
 *     responses:
 *       200:
 *         description: Incident resolved
 */
router.patch('/:id/resolve', restrictTo('system_admin', 'parking_manager'), asyncHandler(async (req, res) => {
  const incident = await incidentService.resolve(req.params.id, req.body, req.user._id);
  ApiResponse.success(res, 'Incident resolved.', incident);
}));

router.patch('/:id/assign', restrictTo('system_admin', 'parking_manager'), asyncHandler(async (req, res) => {
  const incident = await incidentService.assign(req.params.id, req.body.assigneeId);
  ApiResponse.success(res, 'Incident assigned.', incident);
}));

module.exports = router;
