class ApiResponse {
  constructor(statusCode, message, data = null, meta = null) {
    this.success = statusCode < 400;
    this.message = message;
    if (data !== null) this.data = data;
    if (meta !== null) this.meta = meta;
  }

  static success(res, message = 'Success', data = null, statusCode = 200) {
    return res.status(statusCode).json(new ApiResponse(statusCode, message, data));
  }

  static created(res, message = 'Created successfully', data = null) {
    return res.status(201).json(new ApiResponse(201, message, data));
  }

  static paginated(res, message = 'Success', data, pagination) {
    return res.status(200).json(new ApiResponse(200, message, data, { pagination }));
  }

  static noContent(res) {
    return res.status(204).send();
  }
}

module.exports = ApiResponse;
