const lprService = require('./lpr.service');
const ApiResponse = require('../../utils/ApiResponse');
const asyncHandler = require('../../utils/asyncHandler');
const Vehicle = require('../vehicles/vehicle.model');
const MonthlyPass = require('../monthlyPasses/monthlyPass.model');

(async () => {
  try {
    const fs = require('fs');
    const plateRegex = new RegExp(`^5[-.\\s]*1[-.\\s]*F[-.\\s]*9[-.\\s]*7[-.\\s]*0[-.\\s]*2[-.\\s]*2$`, 'i');
    const v = await Vehicle.findOne({ licensePlate: { $regex: plateRegex } }).lean();
    const m = await MonthlyPass.findOne({ licensePlate: { $regex: plateRegex } }).lean();
    const v2 = await Vehicle.findOne({ licensePlate: '51F-97022' }).lean();
    
    fs.writeFileSync(require('path').join(__dirname, 'test-output.txt'), JSON.stringify({
      foundVehicleRegex: !!v,
      foundPassRegex: !!m,
      foundVehicleExact: !!v2,
      vehicleObj: v
    }, null, 2));
  } catch(err) {
    console.error(err);
  }
})();

class LPRController {
  /**
   * POST /lpr/recognize
   * Accept image via multipart/form-data (field: "image") or JSON { imageBase64 }
   * Returns recognized license plate + confidence + registration info
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

    let isRegistered = false;
    let isMonthlyPass = false;
    let passDetails = null;

    if (result.licensePlate && result.licensePlate !== 'UNRECOGNIZED') {
      const normalizedScanned = result.licensePlate.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      const regexPattern = normalizedScanned.split('').join('[-.\\s]*');
      const plateRegex = new RegExp(`^${regexPattern}$`, 'i');

      const vehicle = await Vehicle.findOne({ licensePlate: { $regex: plateRegex } }).lean();
      if (vehicle) {
        isRegistered = true;
      }

      const activePass = await MonthlyPass.findOne({
        licensePlate: { $regex: plateRegex },
        status: 'active',
        endDate: { $gte: new Date() }
      }).lean();

      if (activePass) {
        isMonthlyPass = true;
        passDetails = activePass;
      }
    }

    ApiResponse.success(res, 'License plate recognized.', {
      licensePlate: result.licensePlate,
      confidence: result.confidence,
      engine: result.engine,
      processingTimeMs: result.processingTimeMs,
      candidates: result.candidates || [],
      raw: result.raw,
      isRegistered,
      isMonthlyPass,
      passDetails
    });
  });
}

module.exports = new LPRController();
