const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const ApiError = require('../../utils/ApiError');
const logger = require('../../utils/logger');

class LPRService {
  /**
   * Recognize license plate from image buffer
   * Pipeline: Image → Sharp preprocessing → Tesseract OCR → Regex extraction
   * @param {Buffer} imageBuffer - Raw image buffer from multer
   * @returns {Object} { licensePlate, confidence, raw, processingTimeMs }
   */
  async recognizePlate(imageBuffer) {
    if (!imageBuffer || imageBuffer.length === 0) {
      throw ApiError.badRequest('Image buffer is empty.');
    }

    const startTime = Date.now();

    // Try Plate Recognizer API first (if configured)
    if (process.env.PLATE_RECOGNIZER_API_KEY) {
      try {
        const result = await this._recognizeWithPlateRecognizer(imageBuffer);
        if (result) {
          result.processingTimeMs = Date.now() - startTime;
          result.engine = 'plate_recognizer';
          logger.info(`[LPR] Plate Recognizer result: ${result.licensePlate} (${result.confidence}%)`);
          return result;
        }
      } catch (err) {
        const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
        logger.warn(`[LPR] Plate Recognizer failed (${err.response?.status || 'N/A'}): ${detail}`);
      }
    }

    // Fallback: Tesseract.js with preprocessing
    try {
      const result = await this._recognizeWithTesseract(imageBuffer);
      result.processingTimeMs = Date.now() - startTime;
      result.engine = 'tesseract';
      logger.info(`[LPR] Tesseract result: ${result.licensePlate} (${result.confidence}%) in ${result.processingTimeMs}ms`);
      return result;
    } catch (err) {
      logger.error(`[LPR] Tesseract OCR failed: ${err.message}`);
      throw ApiError.internal('License plate recognition failed. Please try again or enter manually.');
    }
  }

  /**
   * Preprocess image with Sharp for better OCR accuracy
   * - Convert to grayscale
   * - Increase contrast
   * - Sharpen edges
   * - Resize to optimal width
   */
  async _preprocessImage(imageBuffer) {
    try {
      const processed = await sharp(imageBuffer)
        .grayscale()                          // Convert to grayscale
        .normalize()                          // Auto contrast/brightness
        .sharpen({ sigma: 2 })                // Sharpen edges for text clarity
        .resize({ width: 800, withoutEnlargement: true }) // Standardize size
        .threshold(140)                       // Binary threshold for cleaner text
        .png()                                // Output as PNG (lossless)
        .toBuffer();

      return processed;
    } catch (err) {
      logger.warn(`[LPR] Preprocessing failed, using original image: ${err.message}`);
      return imageBuffer;
    }
  }

  /**
   * OCR with Tesseract.js
   */
  async _recognizeWithTesseract(imageBuffer) {
    // Preprocess for better accuracy
    const processedImage = await this._preprocessImage(imageBuffer);

    // Run Tesseract with optimized settings for license plates
    const result = await Tesseract.recognize(processedImage, 'eng', {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          // Silent during recognition
        }
      },
    });

    const rawText = result.data.text || '';
    const meanConfidence = result.data.confidence || 0;

    logger.info(`[LPR] Raw OCR text: "${rawText.trim()}" | Confidence: ${meanConfidence}%`);

    // Extract license plate from raw OCR text
    const extracted = this._extractLicensePlate(rawText);

    return {
      licensePlate: extracted.plate,
      confidence: extracted.confidence || Math.round(meanConfidence),
      raw: rawText.trim(),
      candidates: extracted.candidates,
    };
  }

  /**
   * Call Plate Recognizer API (optional, high accuracy)
   * Free tier: 2500 lookups/month
   * https://platerecognizer.com/
   */
  async _recognizeWithPlateRecognizer(imageBuffer) {
    const axios = require('axios');
    const FormData = require('form-data');

    // Use multipart form upload (more reliable than JSON base64)
    const form = new FormData();
    form.append('upload', imageBuffer, {
      filename: 'plate.jpg',
      contentType: 'image/jpeg',
    });
    // Regions hint for better accuracy (Vietnam)
    form.append('regions', 'vn');

    const response = await axios.post(
      'https://api.platerecognizer.com/v1/plate-reader/',
      form,
      {
        headers: {
          Authorization: `Token ${process.env.PLATE_RECOGNIZER_API_KEY}`,
          ...form.getHeaders(),
        },
        timeout: 15000,
        maxContentLength: 20 * 1024 * 1024,
      }
    );

    logger.info(`[LPR] Plate Recognizer raw response: ${JSON.stringify(response.data)}`);

    const results = response.data?.results;
    if (!results || results.length === 0) {
      logger.warn('[LPR] Plate Recognizer returned no results');
      return null;
    }

    const best = results[0];
    const rawPlate = best.plate.toUpperCase();
    const formattedPlate = this._formatVietnamesePlate(rawPlate);
    return {
      licensePlate: formattedPlate,
      confidence: Math.round(best.score * 100),
      raw: rawPlate,
      region: best.region?.code || 'unknown',
      vehicleType: best.vehicle?.type || 'unknown',
      candidates: results.map((r) => ({
        plate: this._formatVietnamesePlate(r.plate.toUpperCase()),
        confidence: Math.round(r.score * 100),
      })),
    };
  }

  /**
   * Format raw plate string into Vietnamese license plate format
   *
   * Input examples:  '12B116888', '30A12345', '51F199999'
   * Output examples: '12-B1 168.88', '30A-123.45', '51F1-999.99'
   *
   * Vietnamese plate formats:
   * - Motorcycle: XX-YZ DDD.DD  (e.g. 12-B1 168.88)
   * - Car:        XXY-DDD.DD    (e.g. 30A-123.45)
   * - Car:        XXY-DDDDD     (e.g. 51A-12345)
   */
  _formatVietnamesePlate(raw) {
    if (!raw) return raw;

    // Remove all existing separators to normalize
    const cleaned = raw.replace(/[-\s\.]/g, '').toUpperCase();

    // Motorcycle pattern: 2 digits + 1 letter + 1 digit + 5 digits
    // e.g. 12B116888 → 12-B1 168.88
    const motoMatch = cleaned.match(/^(\d{2})([A-Z])(\d)(\d{3})(\d{2})$/);
    if (motoMatch) {
      const [, province, series, seriesNum, numPart1, numPart2] = motoMatch;
      return `${province}-${series}${seriesNum} ${numPart1}.${numPart2}`;
    }

    // Car pattern variant 1: 2 digits + 1 letter + 5 digits
    // e.g. 30A12345 → 30A-123.45
    const carMatch1 = cleaned.match(/^(\d{2})([A-Z])(\d{3})(\d{2})$/);
    if (carMatch1) {
      const [, province, series, numPart1, numPart2] = carMatch1;
      return `${province}${series}-${numPart1}.${numPart2}`;
    }

    // Car pattern variant 2: 2 digits + 2 letters + 5-6 digits
    // e.g. 51F19999 → 51F1-999.99 or 30A123456 → 30A-123.456
    const carMatch2 = cleaned.match(/^(\d{2})([A-Z])(\d)(\d{3})(\d{2,3})$/);
    if (carMatch2) {
      const [, province, series, seriesNum, numPart1, numPart2] = carMatch2;
      return `${province}-${series}${seriesNum} ${numPart1}.${numPart2}`;
    }

    // Fallback: 2 digits + letter(s) + remaining digits, insert dash
    const genericMatch = cleaned.match(/^(\d{2})([A-Z]{1,2}\d?)(\d+)$/);
    if (genericMatch) {
      const [, province, series, numbers] = genericMatch;
      if (numbers.length === 5) {
        return `${province}${series}-${numbers.substring(0, 3)}.${numbers.substring(3)}`;
      }
      return `${province}${series}-${numbers}`;
    }

    // If no pattern matched, return as-is
    return raw;
  }

  /**
   * Extract Vietnamese license plate patterns from raw OCR text
   *
   * Vietnamese plate formats:
   * - 2-wheel: 29-B1 123.45 or 30A-123.45
   * - 4-wheel: 30A-123.45 or 51A-12345
   * - General: XX[A-Z]-XXXXX or XX[A-Z] XXXXX
   */
  _extractLicensePlate(rawText) {
    // Clean up OCR artifacts
    let text = rawText
      .replace(/\n/g, ' ')
      .replace(/[^A-Z0-9\-\.\s]/gi, '')
      .toUpperCase()
      .trim();

    // Vietnamese plate patterns (most specific first)
    const patterns = [
      // Standard 4-wheel: 30A-12345 or 51A-123.45
      /(\d{2}[A-Z]\d?\s*[-.\s]\s*\d{3,5}\.?\d{0,2})/g,
      // With space: 30A 12345
      /(\d{2}[A-Z]\d?\s+\d{3,5})/g,
      // Compact: 30A12345
      /(\d{2}[A-Z]\d?\d{4,5})/g,
      // Motorcycle: 29-B1 123.45
      /(\d{2}\s*[-]\s*[A-Z]\d\s+\d{3}\.?\d{0,2})/g,
      // Generic alphanumeric sequence (fallback)
      /([A-Z0-9]{2,3}[-.\s][A-Z0-9]{3,6})/g,
    ];

    const candidates = [];

    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches) {
        for (const match of matches) {
          const cleaned = match.replace(/\s+/g, '').replace(/\./g, '.').trim();
          if (cleaned.length >= 6 && cleaned.length <= 12) {
            candidates.push({
              plate: cleaned,
              confidence: this._calculatePlateConfidence(cleaned),
            });
          }
        }
      }
    }

    // Sort by confidence descending
    candidates.sort((a, b) => b.confidence - a.confidence);

    if (candidates.length > 0) {
      return {
        plate: candidates[0].plate,
        confidence: candidates[0].confidence,
        candidates: candidates.slice(0, 5),
      };
    }

    // If no pattern matched, return cleaned text as-is
    const fallback = text.replace(/\s+/g, '-').substring(0, 12);
    return {
      plate: fallback || 'UNRECOGNIZED',
      confidence: fallback ? 30 : 0,
      candidates: [],
    };
  }

  /**
   * Calculate confidence score based on plate format validity
   */
  _calculatePlateConfidence(plate) {
    let score = 50;

    // Vietnamese plate pattern check
    if (/^\d{2}[A-Z]\d?[-.]?\d{3,5}\.?\d{0,2}$/.test(plate)) {
      score += 40; // Strong match
    } else if (/^\d{2}[-][A-Z]\d\d{3,5}$/.test(plate)) {
      score += 35; // Motorcycle
    } else if (/^[A-Z0-9]{2,3}[-][A-Z0-9]{3,6}$/.test(plate)) {
      score += 20; // Generic
    }

    // Length bonus (7-10 chars is typical for VN plates)
    if (plate.length >= 7 && plate.length <= 10) {
      score += 10;
    }

    return Math.min(score, 99);
  }
}

module.exports = new LPRService();
