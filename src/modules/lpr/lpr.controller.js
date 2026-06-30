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
    let predictedVehicleTypeId = null;

    if (result.licensePlate && result.licensePlate !== 'UNRECOGNIZED') {
      const normalizedScanned = result.licensePlate.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      const regexPattern = normalizedScanned.split('').join('[-.\\s]*');
      const plateRegex = new RegExp(`^${regexPattern}$`, 'i');

      const vehicle = await Vehicle.findOne({ licensePlate: { $regex: plateRegex } }).lean();
      
      if (vehicle) {
        isRegistered = true;
        predictedVehicleTypeId = vehicle.vehicleType;
      }

      const activePass = await MonthlyPass.findOne({
        licensePlate: { $regex: plateRegex },
        status: 'active',
        endDate: { $gte: new Date() }
      }).lean();

      if (activePass) {
        isMonthlyPass = true;
        passDetails = activePass;
        predictedVehicleTypeId = activePass.vehicleType;
      }

      // If not in DB, guess based on plate format
      if (!predictedVehicleTypeId) {
        const VehicleType = require('../vehicleTypes/vehicleType.model');
        const types = await VehicleType.find({}).lean();
        
        let isMotorbike = false;
        const cleanPlate = result.licensePlate.replace(/[^A-Z0-9]/gi, '').toUpperCase();
        
        if (cleanPlate.length === 9 && !/^(LD|KT|NN|NG|DA|R)/.test(cleanPlate.substring(2))) {
            // 9 chars is usually Motorbike (4 prefix + 5 suffix)
            isMotorbike = true;
        } else if (cleanPlate.length === 8) {
            // 8 chars can be Car (3+5) or Motorbike (4+4)
            // Check if 4th char is a letter (e.g. 29AA1234) -> Motorbike
            if (/[A-Z]/.test(cleanPlate[3])) {
                isMotorbike = true;
            } else {
                // Try to find if original string groups it as 4 chars
                // e.g. 12-B1 1234 -> 12B1 1234
                const groups = result.licensePlate.toUpperCase().split(/[-\s.]+/);
                if (groups.length >= 2) {
                    const prefix = groups[0] + (groups.length > 2 && groups[0].length === 2 ? groups[1] : '');
                    if (prefix.length === 4) isMotorbike = true;
                }
            }
        }
        
        const typeMatch = types.find(t => 
           isMotorbike ? (t.code.includes('MOTOR') || t.code.includes('BIKE')) 
                       : (t.code.includes('CAR') || t.code.includes('OTO'))
        ) || types[0];
        
        if (typeMatch) {
            predictedVehicleTypeId = typeMatch._id;
        }
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
      passDetails,
      predictedVehicleTypeId
    });
  });
}

module.exports = new LPRController();
