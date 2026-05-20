const ActivityLog = require('../utils/activityLog.model');
const logger = require('../utils/logger');

/**
 * Log user activity
 */
const logActivity = (action, resource = null) => {
  return async (req, res, next) => {
    // Store original send
    const originalSend = res.json.bind(res);

    res.json = async (body) => {
      // Log after response
      if (req.user && res.statusCode < 400) {
        try {
          await ActivityLog.create({
            user: req.user._id,
            action,
            resource,
            resourceId: req.params.id || body?.data?._id,
            description: `${action} - ${req.method} ${req.originalUrl}`,
            metadata: {
              body: req.body,
              params: req.params,
              query: req.query,
            },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            status: 'success',
          });
        } catch (err) {
          logger.error('Failed to log activity:', err.message);
        }
      }
      return originalSend(body);
    };

    next();
  };
};

module.exports = { logActivity };
