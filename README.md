# 🚗 Parking Building Management System - Backend API

> **Hệ thống quản lý tòa nhà gửi xe** - Full Backend với Node.js, Express, MongoDB, Socket.IO

[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.x-blue.svg)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-7+-green.svg)](https://www.mongodb.com/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.x-black.svg)](https://socket.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 📋 Mục Lục

- [Tổng quan](#-tổng-quan)
- [Kiến trúc hệ thống](#-kiến-trúc-hệ-thống)
- [Công nghệ sử dụng](#-công-nghệ-sử-dụng)
- [Cài đặt & Chạy](#-cài-đặt--chạy)
- [Biến môi trường](#-biến-môi-trường)
- [Database Setup](#-database-setup)
- [API Documentation](#-api-documentation)
- [Socket.IO Events](#-socketio-events)
- [Roles & Permissions](#-roles--permissions)
- [Deploy lên Railway](#-deploy-lên-railway)
- [API Examples](#-api-examples)
- [Cấu trúc thư mục](#-cấu-trúc-thư-mục)

---

## 🏢 Tổng quan

Hệ thống backend hoàn chỉnh cho **Parking Building Management System**, bao gồm:

- ✅ **Authentication** – JWT + Refresh Token + Email Verification
- ✅ **RBAC** – 4 role: System Admin, Parking Manager, Parking Staff, Parking User
- ✅ **Parking Management** – Tòa nhà, Tầng, Khu vực, Slot
- ✅ **Check-in / Check-out** – Quét QR, nhập biển số, tự động gán slot
- ✅ **Booking System** – Đặt chỗ trước với AI đề xuất slot tối ưu
- ✅ **Payment** – Cash, MoMo, VNPay (mock)
- ✅ **Realtime** – Socket.IO cho slot map, dashboard, thông báo
- ✅ **Reports & Analytics** – Doanh thu, lượt gửi xe, tỷ lệ lấp đầy
- ✅ **Notifications** – Realtime in-app notifications
- ✅ **Incident Management** – Quản lý sự cố
- ✅ **Feedback System** – Phản hồi & đánh giá

---

## 🏛️ Kiến trúc hệ thống

```
Clean Architecture + MVC + Repository Pattern

src/
├── config/           # Database, Cloudinary, Swagger config
├── middleware/        # Auth, Error Handler, Validation, Activity Log
├── modules/          # Feature modules (MVC structure)
│   ├── auth/         # Login, Register, JWT, Reset Password
│   ├── users/        # User CRUD, Avatar, Activity Logs
│   ├── parkingLots/  # Parking building management
│   ├── floors/       # Floor management
│   ├── zones/        # Zone management
│   ├── vehicleTypes/ # Vehicle type & pricing
│   ├── parkingSlots/ # Slot management + realtime
│   ├── bookings/     # Reservation system
│   ├── parkingSessions/ # Check-in/Check-out
│   ├── payments/     # Payment processing
│   ├── reports/      # Analytics & reporting
│   ├── notifications/ # Realtime notifications
│   ├── feedbacks/    # User feedback
│   └── incidents/    # Incident management
├── routes/           # Central route aggregator
├── sockets/          # Socket.IO server + event handlers
├── utils/            # Helpers, Logger, ApiError, Pagination
└── seeders/          # Database seed data
```

---

## 🔧 Công nghệ sử dụng

| Category       | Technology              |
|---------------|-------------------------|
| Runtime        | Node.js 20+             |
| Framework      | Express.js 4.x          |
| Database       | MongoDB + Mongoose 8.x  |
| Authentication | JWT + Refresh Token     |
| Realtime       | Socket.IO 4.x           |
| File Upload    | Multer + Cloudinary     |
| Email          | Nodemailer              |
| Security       | Helmet, CORS, Rate Limit, Mongo Sanitize |
| Validation     | express-validator       |
| Logging        | Winston + Morgan        |
| QR Code        | qrcode                  |
| Docs           | Swagger (swagger-jsdoc + swagger-ui-express) |
| Deploy         | Railway + Docker        |

---

## 🚀 Cài đặt & Chạy

### Prerequisites

- Node.js >= 18.0.0
- MongoDB >= 6.0 (local) hoặc MongoDB Atlas
- npm hoặc yarn

### 1. Clone & Install

```bash
git clone https://github.com/your-username/parking-backend.git
cd parking-backend
npm install
```

### 2. Cấu hình Environment

```bash
cp .env.example .env
```

Chỉnh sửa file `.env` với thông tin của bạn (xem [Biến môi trường](#-biến-môi-trường)).

### 3. Seed Database

```bash
# Seed dữ liệu mẫu
npm run seed

# Seed và xóa dữ liệu cũ
npm run seed:clear
```

### 4. Chạy Development

```bash
npm run dev
```

Server sẽ chạy tại: `http://localhost:5000`

### 5. Chạy Production

```bash
npm start
```

---

## 🔑 Biến môi trường

Tạo file `.env` từ `.env.example`:

```env
# Server
NODE_ENV=development
PORT=5000
API_PREFIX=/api/v1

# Database
MONGODB_URI=mongodb://localhost:27017/parking_management

# JWT (QUAN TRỌNG: đổi secret keys trước khi deploy)
JWT_ACCESS_SECRET=your_super_secret_access_key_min_32_chars
JWT_REFRESH_SECRET=your_super_secret_refresh_key_min_32_chars
JWT_ACCESS_EXPIRE=15m
JWT_REFRESH_EXPIRE=7d

# Cloudinary (cho upload ảnh)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Email (Gmail App Password)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password
EMAIL_FROM=Parking System <noreply@parking.com>

# Client URLs
CLIENT_URL=http://localhost:3000
ADMIN_URL=http://localhost:3001

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100

# BCrypt
BCRYPT_SALT_ROUNDS=12
```

---

## 🗄️ Database Setup

### MongoDB Local

```bash
# macOS (Homebrew)
brew install mongodb-community
brew services start mongodb-community

# Ubuntu
sudo systemctl start mongod

# Docker
docker run -d -p 27017:27017 --name parking-mongo mongo:7
```

### MongoDB Atlas (Production)

1. Tạo cluster tại [MongoDB Atlas](https://cloud.mongodb.com)
2. Tạo database user
3. Whitelist IP (hoặc 0.0.0.0/0 cho Railway)
4. Copy connection string vào `MONGODB_URI_PROD`

### Chạy Seeder

```bash
npm run seed
```

Seeder tạo:

| Role           | Email                  | Password    |
|---------------|------------------------|-------------|
| System Admin  | admin@parking.com      | Admin123!   |
| Manager       | manager@parking.com    | Manager123! |
| Staff         | staff@parking.com      | Staff123!   |
| User          | user@parking.com       | User123!    |

---

## 📖 API Documentation

Swagger UI tự động tạo từ JSDoc comments.

**Development:** `http://localhost:5000/api-docs`

**Swagger JSON:** `http://localhost:5000/api-docs.json`

### Authentication trong Swagger

1. Mở Swagger UI
2. Nhấn nút **Authorize** (🔓)
3. Nhập: `Bearer <accessToken>`
4. Nhấn **Authorize**

---

## 🔌 Socket.IO Events

### Client → Server

```javascript
const socket = io('http://localhost:5000', {
  auth: { token: 'Bearer <accessToken>' }
});

// Join parking lot room (nhận realtime updates)
socket.emit('joinParkingLot', 'parking_lot_id');

// Join floor room (slot map)
socket.emit('joinFloor', 'floor_id');

// Subscribe dashboard
socket.emit('subscribeDashboard', 'parking_lot_id');

// Ping
socket.emit('ping');
```

### Server → Client

```javascript
// Slot status changed
socket.on('slotStatusUpdated', (data) => {
  // { slotId, slotCode, status, floor, zone, sessionId }
});

// New parking session started (check-in)
socket.on('sessionStarted', (data) => {
  // { sessionId, sessionCode, licensePlate, slotCode }
});

// Session ended (check-out)
socket.on('sessionEnded', (data) => {
  // { sessionId, licensePlate, totalFee, durationHours }
});

// New notification
socket.on('newNotification', (data) => {
  // { id, type, title, message, data, createdAt }
});

// Overdue alert
socket.on('overdueAlert', (data) => {
  // { sessionId, licensePlate, overdueHours }
});

// Dashboard update
socket.on('dashboardUpdated', (stats) => {
  // { totalSessions, activeSessions, todayRevenue, slots, occupancyRate }
});

// Pong response
socket.on('pong', ({ timestamp }) => {});
```

---

## 👥 Roles & Permissions

| Chức năng                    | Admin | Manager | Staff | User |
|-----------------------------|:-----:|:-------:|:-----:|:----:|
| Quản lý Users                | ✅    | ❌      | ❌    | ❌   |
| Tạo Parking Lot              | ✅    | ❌      | ❌    | ❌   |
| Cập nhật Parking Lot         | ✅    | ✅      | ❌    | ❌   |
| Quản lý Floors/Zones/Slots   | ✅    | ✅      | ❌    | ❌   |
| Check-in / Check-out         | ✅    | ✅      | ✅    | ❌   |
| Xử lý Payment (Cash)         | ✅    | ✅      | ✅    | ❌   |
| Tạo Booking                  | ✅    | ✅      | ✅    | ✅   |
| Xem Booking của mình         | ✅    | ✅      | ✅    | ✅   |
| Xem tất cả Bookings          | ✅    | ✅      | ✅    | ❌   |
| Approve Booking              | ✅    | ✅      | ✅    | ❌   |
| Báo cáo & Dashboard          | ✅    | ✅      | ✅    | ❌   |
| Quản lý Incidents            | ✅    | ✅      | ✅    | ❌   |
| Gửi Feedback                 | ✅    | ✅      | ✅    | ✅   |
| Phản hồi Feedback            | ✅    | ✅      | ❌    | ❌   |

---

## 🚂 Deploy lên Railway

### Bước 1: Chuẩn bị

1. Đăng ký tài khoản tại [Railway](https://railway.app)
2. Tạo MongoDB Atlas cluster và lấy connection string

### Bước 2: Deploy từ GitHub

```bash
# Push code lên GitHub
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/your-username/parking-backend.git
git push -u origin main
```

Trên Railway:
1. **New Project** → **Deploy from GitHub repo**
2. Chọn repository
3. Railway tự detect Dockerfile và deploy

### Bước 3: Cấu hình Environment Variables

Trong Railway dashboard → **Variables**, thêm:

```
NODE_ENV=production
PORT=5000
MONGODB_URI_PROD=mongodb+srv://user:pass@cluster.mongodb.net/parking_management
JWT_ACCESS_SECRET=<strong_secret_32_chars>
JWT_REFRESH_SECRET=<strong_secret_32_chars>
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your@gmail.com
EMAIL_PASS=your_app_password
CLIENT_URL=https://your-frontend.vercel.app
```

### Bước 4: Custom Domain (Optional)

Railway → **Settings** → **Domains** → Generate domain hoặc add custom domain.

---

## 📡 API Examples

### Register

```bash
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Nguyễn Văn A",
    "email": "test@example.com",
    "password": "Test123!",
    "phone": "0912345678"
  }'
```

### Login

```bash
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@parking.com",
    "password": "Admin123!"
  }'
```

### Get Available Slots (AI Suggestion)

```bash
curl -X GET "http://localhost:5000/api/v1/parking-slots/available?parkingLotId=LOT_ID&vehicleTypeId=VT_ID" \
  -H "Authorization: Bearer <accessToken>"
```

### Create Booking

```bash
curl -X POST http://localhost:5000/api/v1/bookings \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "parkingLot": "LOT_ID",
    "vehicleType": "VT_ID",
    "scheduledDate": "2024-12-25",
    "startTime": "08:00",
    "endTime": "17:00",
    "vehicleInfo": {
      "licensePlate": "51A-12345",
      "vehicleModel": "Toyota Vios",
      "vehicleColor": "Trắng"
    }
  }'
```

### Check-in (Staff)

```bash
curl -X POST http://localhost:5000/api/v1/parking-sessions/check-in \
  -H "Authorization: Bearer <staffAccessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "parkingLotId": "LOT_ID",
    "vehicleTypeId": "MOTORBIKE_ID",
    "licensePlate": "59K-99999",
    "vehicleModel": "Honda Wave",
    "vehicleColor": "Đỏ"
  }'
```

### Check-out (Staff)

```bash
curl -X PATCH http://localhost:5000/api/v1/parking-sessions/SESSION_ID/check-out \
  -H "Authorization: Bearer <staffAccessToken>"
```

### Process Cash Payment

```bash
curl -X POST http://localhost:5000/api/v1/payments/cash \
  -H "Authorization: Bearer <staffAccessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "SESSION_ID",
    "cashReceived": 50000
  }'
```

### Get Dashboard Stats

```bash
curl -X GET "http://localhost:5000/api/v1/reports/dashboard?parkingLotId=LOT_ID" \
  -H "Authorization: Bearer <managerAccessToken>"
```

### Get Revenue Report

```bash
curl -X GET "http://localhost:5000/api/v1/reports/revenue?period=month&groupBy=day" \
  -H "Authorization: Bearer <managerAccessToken>"
```

---

## 📁 Cấu trúc thư mục

```
parking-backend/
├── src/
│   ├── config/
│   │   ├── database.js          # MongoDB connection
│   │   ├── cloudinary.js        # Cloudinary upload config
│   │   └── swagger.js           # Swagger/OpenAPI config
│   ├── middleware/
│   │   ├── auth.js              # JWT auth + RBAC middleware
│   │   ├── errorHandler.js      # Global error handler
│   │   ├── validate.js          # express-validator middleware
│   │   └── activityLogger.js    # Activity log middleware
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.service.js
│   │   │   ├── auth.controller.js
│   │   │   ├── auth.validator.js
│   │   │   └── routes/auth.routes.js
│   │   ├── users/
│   │   │   ├── user.model.js
│   │   │   ├── user.service.js
│   │   │   ├── user.controller.js
│   │   │   └── routes/user.routes.js
│   │   ├── parkingLots/
│   │   │   ├── parkingLot.model.js
│   │   │   ├── parkingLot.service.js
│   │   │   ├── parkingLot.controller.js
│   │   │   └── routes/parkingLot.routes.js
│   │   ├── floors/
│   │   │   ├── floor.model.js
│   │   │   ├── floor.service.js
│   │   │   └── routes/floor.routes.js
│   │   ├── zones/
│   │   │   ├── zone.model.js
│   │   │   └── routes/zone.routes.js
│   │   ├── vehicleTypes/
│   │   │   └── vehicleType.model.js
│   │   ├── parkingSlots/
│   │   │   ├── parkingSlot.model.js
│   │   │   ├── parkingSlot.service.js
│   │   │   ├── parkingSlot.controller.js
│   │   │   └── routes/parkingSlot.routes.js
│   │   ├── bookings/
│   │   │   ├── booking.model.js
│   │   │   ├── booking.service.js
│   │   │   ├── booking.controller.js
│   │   │   └── routes/booking.routes.js
│   │   ├── parkingSessions/
│   │   │   ├── parkingSession.model.js
│   │   │   ├── parkingSession.service.js
│   │   │   ├── parkingSession.controller.js
│   │   │   └── routes/parkingSession.routes.js
│   │   ├── payments/
│   │   │   ├── payment.model.js
│   │   │   ├── payment.service.js
│   │   │   ├── payment.controller.js
│   │   │   └── routes/payment.routes.js
│   │   ├── reports/
│   │   │   ├── report.service.js
│   │   │   └── routes/report.routes.js
│   │   ├── notifications/
│   │   │   ├── notification.model.js
│   │   │   ├── notification.service.js
│   │   │   └── routes/notification.routes.js
│   │   ├── feedbacks/
│   │   │   ├── feedback.model.js
│   │   │   ├── feedback.service.js
│   │   │   └── routes/feedback.routes.js
│   │   └── incidents/
│   │       ├── incident.model.js
│   │       └── routes/incident.routes.js
│   ├── routes/
│   │   └── index.js             # Central router
│   ├── sockets/
│   │   └── socket.server.js     # Socket.IO setup + events
│   ├── utils/
│   │   ├── ApiError.js          # Custom error class
│   │   ├── ApiResponse.js       # Response formatter
│   │   ├── asyncHandler.js      # Async wrapper
│   │   ├── pagination.js        # Reusable pagination
│   │   ├── helpers.js           # Utilities (fee calc, QR, etc.)
│   │   ├── email.js             # Email sender
│   │   ├── logger.js            # Winston logger
│   │   └── activityLog.model.js # Activity log model
│   └── seeders/
│       └── index.js             # Database seeder
├── .env.example
├── .gitignore
├── .dockerignore
├── Dockerfile
├── Procfile
├── railway.json
├── package.json
└── README.md
```

---

## 🧪 Testing với Postman

Import Postman Collection:

1. Mở Postman
2. **Import** → Paste URL: `http://localhost:5000/api-docs.json`
3. Hoặc tải Swagger JSON và import

### Setup Postman Environment

```json
{
  "BASE_URL": "http://localhost:5000/api/v1",
  "ACCESS_TOKEN": "",
  "REFRESH_TOKEN": "",
  "PARKING_LOT_ID": "",
  "VEHICLE_TYPE_ID": ""
}
```

### Pre-request Script (tự động set token)

```javascript
// Trong Collection → Pre-request Script
const token = pm.environment.get('ACCESS_TOKEN');
if (token) {
  pm.request.headers.add({
    key: 'Authorization',
    value: `Bearer ${token}`
  });
}
```

---

## 🔐 Security Features

- **Helmet** – Bảo vệ HTTP headers
- **Rate Limiting** – Giới hạn request (100/15min), Auth limit (10/15min)
- **MongoDB Sanitize** – Chống NoSQL injection
- **CORS** – Chỉ cho phép domain đã config
- **bcryptjs** – Hash password với salt rounds 12
- **JWT Refresh Token Rotation** – Tự động rotate khi refresh
- **Soft Delete** – Không xóa cứng dữ liệu
- **Account Status** – Hỗ trợ block/unblock user

---

## 📊 AI Features

Hệ thống có **smart logic** đơn giản:

- **Optimal Slot Suggestion** – Đề xuất slot gần lối vào nhất (tầng thấp, khu A trước)
- **Auto Slot Assignment** – Tự động gán slot khi check-in walk-in
- **Overtime Detection** – Tự động phát hiện xe quá giờ
- **Peak Hour Detection** – Nhận diện khung giờ cao điểm (7-9h, 17-20h)
- **Occupancy Rate Calculation** – Tính tỷ lệ lấp đầy theo thời gian thực

---

## 📞 Liên hệ

- **Author**: Senior Backend Engineer
- **Email**: dev@parking.com
- **API Docs**: `/api-docs`

---

*Built with ❤️ using Node.js, Express, MongoDB & Socket.IO*
