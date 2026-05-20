const parkingSessionService = require('./parkingSession.service');
const ApiResponse = require('../../utils/ApiResponse');
const asyncHandler = require('../../utils/asyncHandler');
const { uploadEvidence } = require('../../config/cloudinary');

class ParkingSessionController {
  getSessions = asyncHandler(async (req, res) => {
    const { docs, pagination } = await parkingSessionService.getSessions(req.query, req.user);
    ApiResponse.paginated(res, 'Sessions retrieved.', docs, pagination);
  });

  getById = asyncHandler(async (req, res) => {
    const session = await parkingSessionService.getById(req.params.id);
    ApiResponse.success(res, 'Session retrieved.', session);
  });

  checkIn = asyncHandler(async (req, res) => {
    const io = req.app.get('io');
    const session = await parkingSessionService.checkIn(req.body, req.user._id, io);
    ApiResponse.created(res, 'Check-in successful.', session);
  });

  checkOut = asyncHandler(async (req, res) => {
    const io = req.app.get('io');
    const session = await parkingSessionService.checkOut(req.params.id, req.user._id, io);
    ApiResponse.success(res, 'Check-out successful. Please proceed to payment.', session);
  });

  findActive = asyncHandler(async (req, res) => {
    const session = await parkingSessionService.findActiveSession(req.query);
    ApiResponse.success(res, 'Active session found.', session);
  });

  getOverdue = asyncHandler(async (req, res) => {
    const sessions = await parkingSessionService.getOverdueSessions(req.query.parkingLotId);
    ApiResponse.success(res, 'Overdue sessions retrieved.', sessions);
  });

  addEvidence = asyncHandler(async (req, res) => {
    const { type = 'entry' } = req.body;
    const session = await parkingSessionService.addEvidenceImages(req.params.id, req.files, type);
    ApiResponse.success(res, 'Evidence images uploaded.', session.evidenceImages);
  });
}

module.exports = new ParkingSessionController();
