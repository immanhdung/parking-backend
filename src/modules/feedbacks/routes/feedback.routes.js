const express = require('express');
const router = express.Router();
const feedbackService = require('../feedback.service');
const ApiResponse = require('../../../utils/ApiResponse');
const asyncHandler = require('../../../utils/asyncHandler');
const { protect, restrictTo } = require('../../../middleware/auth');

router.use(protect);

/**
 * @swagger
 * /feedbacks:
 *   get:
 *     summary: Get feedbacks
 *     tags: [Feedbacks]
 *     parameters:
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [general, complaint, suggestion, issue_report, compliment] }
 *       - in: query
 *         name: rating
 *         schema: { type: integer, minimum: 1, maximum: 5 }
 *     responses:
 *       200:
 *         description: Feedback list
 *   post:
 *     summary: Submit feedback
 *     tags: [Feedbacks]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [parkingLot, rating, title, content]
 *             properties:
 *               parkingLot:
 *                 type: string
 *               rating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               title:
 *                 type: string
 *               content:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [general, complaint, suggestion, issue_report, compliment]
 *               parkingSession:
 *                 type: string
 *     responses:
 *       201:
 *         description: Feedback submitted
 */
router.get('/', asyncHandler(async (req, res) => {
  const { docs, pagination } = await feedbackService.getAll(req.query, req.user);
  ApiResponse.paginated(res, 'Feedbacks retrieved.', docs, pagination);
}));

router.post('/', asyncHandler(async (req, res) => {
  const fb = await feedbackService.create(req.body, req.user._id);
  ApiResponse.created(res, 'Feedback submitted.', fb);
}));

router.get('/stats', restrictTo('system_admin', 'parking_manager'), asyncHandler(async (req, res) => {
  const stats = await feedbackService.getStats(req.query.parkingLotId);
  ApiResponse.success(res, 'Feedback stats.', stats);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const fb = await feedbackService.getById(req.params.id);
  ApiResponse.success(res, 'Feedback retrieved.', fb);
}));

/**
 * @swagger
 * /feedbacks/{id}/respond:
 *   patch:
 *     summary: Respond to feedback (manager)
 *     tags: [Feedbacks]
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
 *             required: [response]
 *             properties:
 *               response:
 *                 type: string
 *     responses:
 *       200:
 *         description: Response recorded
 */
router.patch('/:id/respond', restrictTo('system_admin', 'parking_manager'), asyncHandler(async (req, res) => {
  const fb = await feedbackService.respond(req.params.id, req.body.response, req.user._id);
  ApiResponse.success(res, 'Response recorded.', fb);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  await feedbackService.delete(req.params.id, req.user._id, req.user.role);
  ApiResponse.success(res, 'Feedback deleted.');
}));

module.exports = router;
