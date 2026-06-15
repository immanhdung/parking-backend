const lprService = require('./lpr.service');
const ApiResponse = require('../../utils/ApiResponse');
const asyncHandler = require('../../utils/asyncHandler');

class LPRController {
  /**
   * POST /lpr/recognize
   * Accept image via multipart/form-data (field: "image") or JSON { imageBase64 }
   * Returns recognized license plate + confidence
   */
  recognizePlate = asyncHandler(async (req, res) => {
    let imageBuffer;

    // Option 1: Multipart upload (from camera capture / file input)
    if (req.file) {
      imageBuffer = req.file.buffer;
    }
    // Option 2: Base64 encoded image (from canvas.toDataURL)
    else if (req.body.imageBase64) {
      const base64Data = req.body.imageBase64.replace(/^data:image\/\w+;base64,/, '');
      imageBuffer = Buffer.from(base64Data, 'base64');
    }
    // No image provided
    else {
      return res.status(400).json({
        success: false,
        message: 'No image provided. Send as multipart "image" field or JSON "imageBase64".',
      });
    }

    const result = await lprService.recognizePlate(imageBuffer);

    ApiResponse.success(res, 'License plate recognized.', {
      licensePlate: result.licensePlate,
      confidence: result.confidence,
      engine: result.engine,
      processingTimeMs: result.processingTimeMs,
      candidates: result.candidates || [],
      raw: result.raw,
    });
  });
}

module.exports = new LPRController();
