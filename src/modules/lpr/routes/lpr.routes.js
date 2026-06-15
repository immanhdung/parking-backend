const express = require('express');
const router = express.Router();
const multer = require('multer');
const ctrl = require('../lpr.controller');
const { protect, restrictTo } = require('../../../middleware/auth');

// Memory storage: keep image in buffer (no disk/cloud save needed for OCR)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed (jpg, jpeg, png, webp)'), false);
    }
  },
});

// All LPR routes require authentication
router.use(protect);

/**
 * @swagger
 * tags:
 *   name: LPR
 *   description: AI License Plate Recognition (OCR)
 */

/**
 * @swagger
 * /lpr/recognize:
 *   post:
 *     summary: Recognize license plate from camera image
 *     description: |
 *       Upload a camera-captured image to extract the license plate using AI/OCR.
 *       Supports two input methods:
 *       - **Multipart**: Send image as form-data field "image"
 *       - **Base64**: Send JSON body with "imageBase64" field
 *
 *       Uses Plate Recognizer API (if configured) with Tesseract.js fallback.
 *     tags: [LPR]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Camera-captured image file
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               imageBase64:
 *                 type: string
 *                 description: Base64 encoded image (data URI or raw base64)
 *     responses:
 *       200:
 *         description: License plate recognized successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: License plate recognized.
 *                 data:
 *                   type: object
 *                   properties:
 *                     licensePlate:
 *                       type: string
 *                       example: 30A-12345
 *                     confidence:
 *                       type: number
 *                       example: 92
 *                     engine:
 *                       type: string
 *                       enum: [tesseract, plate_recognizer]
 *                     processingTimeMs:
 *                       type: number
 *                       example: 1250
 *                     candidates:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           plate:
 *                             type: string
 *                           confidence:
 *                             type: number
 *       400:
 *         description: No image provided
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.post(
  '/recognize',
  restrictTo('system_admin', 'parking_manager', 'parking_staff'),
  upload.single('image'),
  ctrl.recognizePlate
);

module.exports = router;
