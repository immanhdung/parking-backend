const bookingService = require('./booking.service');
const ApiResponse = require('../../utils/ApiResponse');
const asyncHandler = require('../../utils/asyncHandler');

class BookingController {
  getBookings = asyncHandler(async (req, res) => {
    const { docs, pagination } = await bookingService.getBookings(req.query, req.user);
    ApiResponse.paginated(res, 'Bookings retrieved.', docs, pagination);
  });

  getById = asyncHandler(async (req, res) => {
    const booking = await bookingService.getById(req.params.id, req.user);
    ApiResponse.success(res, 'Booking retrieved.', booking);
  });

  create = asyncHandler(async (req, res) => {
    const booking = await bookingService.create(req.body, req.user._id);
    ApiResponse.created(res, 'Booking created successfully.', booking);
  });

  approve = asyncHandler(async (req, res) => {
    const booking = await bookingService.approve(req.params.id, req.user._id);
    ApiResponse.success(res, 'Booking approved.', booking);
  });

  cancel = asyncHandler(async (req, res) => {
    const booking = await bookingService.cancel(
      req.params.id,
      req.user._id,
      req.user.role,
      req.body.reason
    );
    ApiResponse.success(res, 'Booking cancelled.', booking);
  });

  myBookings = asyncHandler(async (req, res) => {
    const { docs, pagination } = await bookingService.getUserBookings(req.user._id, req.query);
    ApiResponse.paginated(res, 'My bookings retrieved.', docs, pagination);
  });
}

module.exports = new BookingController();
