const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

/**
 * Run validation results and throw error if any
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(err => ({
      field: err.path || err.param,
      message: err.msg,
      value: err.value,
    }));
    throw ApiError.unprocessable('Validation failed', formattedErrors);
  }
  next();
};

module.exports = { validate };
