const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Parking Building Management System API',
      version: '1.0.0',
      description: `
## Hệ thống quản lý tòa nhà gửi xe

### Authentication
Sử dụng Bearer Token (JWT) để xác thực.
Đăng nhập để lấy accessToken, sau đó thêm vào header:
\`Authorization: Bearer <accessToken>\`

### Roles
- **system_admin**: Quản trị viên hệ thống
- **parking_manager**: Quản lý bãi xe  
- **parking_staff**: Nhân viên bãi xe
- **parking_user**: Người dùng / Tài xế
      `,
      contact: {
        name: 'API Support',
        email: 'support@parking.com',
      },
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 5000}/api/v1`,
        description: 'Development Server',
      },
      {
        url: 'https://web-production-a1e70.up.railway.app/api/v1',
        description: 'Production Server',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter JWT token',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string' },
            errors: { type: 'array', items: { type: 'object' } },
          },
        },
        Pagination: {
          type: 'object',
          properties: {
            total: { type: 'integer' },
            page: { type: 'integer' },
            limit: { type: 'integer' },
            totalPages: { type: 'integer' },
            hasNextPage: { type: 'boolean' },
            hasPrevPage: { type: 'boolean' },
          },
        },
      },
    },
    security: [{ BearerAuth: [] }],
    tags: [
      { name: 'Auth', description: 'Authentication & Authorization' },
      { name: 'Users', description: 'User Management' },
      { name: 'Parking Lots', description: 'Parking Building Management' },
      { name: 'Floors', description: 'Floor Management' },
      { name: 'Zones', description: 'Zone Management' },
      { name: 'Vehicle Types', description: 'Vehicle Type Management' },
      { name: 'Parking Slots', description: 'Parking Slot Management' },
      { name: 'Bookings', description: 'Booking / Reservation' },
      { name: 'Parking Sessions', description: 'Entry/Exit Management' },
      { name: 'Payments', description: 'Payment System' },
      { name: 'Reports', description: 'Reports & Analytics' },
      { name: 'Dashboard', description: 'Dashboard Statistics' },
      { name: 'Notifications', description: 'Notification System' },
      { name: 'Feedbacks', description: 'Feedback System' },
      { name: 'Incidents', description: 'Incident Management' },
    ],
  },
  apis: [
    './src/modules/*/routes/*.js',
    './src/routes/*.js',
    './src/docs/*.yaml',
  ],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
