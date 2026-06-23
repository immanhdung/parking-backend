/**
 * Database Seeder
 * Run: node src/seeders/index.js
 * Run with clear: node src/seeders/index.js --clear
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { connectDB } = require('../config/database');

// Models
const User = require('../modules/users/user.model');
const ParkingLot = require('../modules/parkingLots/parkingLot.model');
const Floor = require('../modules/floors/floor.model');
const Zone = require('../modules/zones/zone.model');
const VehicleType = require('../modules/vehicleTypes/vehicleType.model');
const ParkingSlot = require('../modules/parkingSlots/parkingSlot.model');

const clearDB = async () => {
  console.log('🧹 Clearing database...');
  await Promise.all([
    User.deleteMany({}),
    ParkingLot.deleteMany({}),
    Floor.deleteMany({}),
    Zone.deleteMany({}),
    VehicleType.deleteMany({}),
    ParkingSlot.deleteMany({}),
  ]);
  console.log('✅ Database cleared');
};

const seedVehicleTypes = async () => {
  console.log('🚗 Seeding vehicle types...');

  const vehicleTypes = [
    {
      name: 'Car',
      code: 'CAR',
      description: 'Car, sedan, SUV, van',
      size: 'large',
      pricing: { dayBlockRate: 5000, dailyRate: 80000, monthlyRate: 1500000 },
      isActive: true,
    },
    {
      name: 'Electric Car',
      code: 'ELECTRIC_CAR',
      description: 'Electric car, large electric vehicle',
      size: 'large',
      pricing: { dayBlockRate: 6000, dailyRate: 90000, monthlyRate: 1700000 },
      isActive: true,
    },
    {
      name: 'Motorcycle',
      code: 'MOTORBIKE',
      description: 'Motorcycle, scooter',
      size: 'small',
      pricing: { dayBlockRate: 2000, dailyRate: 20000, monthlyRate: 400000 },
      isActive: true,
    },
    {
      name: 'Bicycle',
      code: 'BICYCLE',
      description: 'Regular bicycle',
      size: 'small',
      pricing: { dayBlockRate: 1000, dailyRate: 10000, monthlyRate: 150000 },
      isActive: true,
    },
    {
      name: 'Electric Bicycle',
      code: 'ELECTRIC_BIKE',
      description: 'Electric bicycle and electric scooter',
      size: 'small',
      pricing: { dayBlockRate: 2000, dailyRate: 25000, monthlyRate: 500000 },
      isActive: true,
    },
    {
      name: 'Small Truck',
      code: 'SMALL_TRUCK',
      description: 'Small truck and van',
      size: 'extra_large',
      pricing: { dayBlockRate: 10000, dailyRate: 150000, monthlyRate: 3000000 },
      isActive: true,
    },
  ];

  const created = await VehicleType.insertMany(vehicleTypes);
  console.log(`✅ Created ${created.length} vehicle types`);
  return created;
};

const seedUsers = async (parkingLot) => {
  console.log('👥 Seeding users...');

  const users = [
    {
      fullName: 'System Administrator',
      email: 'admin@parking.com',
      password: 'Admin123!',
      phone: '0901234567',
      role: 'system_admin',
      status: 'active',
      isEmailVerified: true,
    },
    {
      fullName: 'Nguyễn Văn Manager',
      email: 'manager@parking.com',
      password: 'Manager123!',
      phone: '0902234567',
      role: 'parking_manager',
      status: 'active',
      isEmailVerified: true,
      assignedParkingLot: parkingLot._id,
    },
    {
      fullName: 'Trần Thị Staff',
      email: 'staff@parking.com',
      password: 'Staff123!',
      phone: '0903234567',
      role: 'parking_staff',
      status: 'active',
      isEmailVerified: true,
      assignedParkingLot: parkingLot._id,
    },
    {
      fullName: 'Staff 2',
      email: 'staff2@parking.com',
      password: 'Staff123!',
      phone: '0903334567',
      role: 'parking_staff',
      status: 'active',
      isEmailVerified: true,
      assignedParkingLot: parkingLot._id,
    },
    {
      fullName: 'Lê Minh User',
      email: 'user@parking.com',
      password: 'User123!',
      phone: '0904234567',
      role: 'parking_user',
      status: 'active',
      isEmailVerified: true,
    },
    {
      fullName: 'Phạm Thị Lan',
      email: 'user2@parking.com',
      password: 'User123!',
      phone: '0905234567',
      role: 'parking_user',
      status: 'active',
      isEmailVerified: true,
    },
    {
      fullName: 'Hoàng Văn Nam',
      email: 'user3@parking.com',
      password: 'User123!',
      phone: '0906234567',
      role: 'parking_user',
      status: 'active',
      isEmailVerified: true,
    },
  ];

  const created = await User.create(users);
  console.log(`✅ Created ${created.length} users`);
  return created;
};

const seedParkingLots = async (managerUser) => {
  console.log('🏢 Seeding parking lots...');

  const lotsToCreate = [
    {
      name: 'Bãi Xe Tòa Nhà Văn Phòng 123',
      code: 'VP123',
      description: 'Bãi xe hiện đại, an toàn, 24/7 CCTV, tự động hóa hoàn toàn',
      address: {
        street: '123 Nguyễn Huệ',
        ward: 'Phường Bến Nghé',
        district: 'Quận 1',
        city: 'TP. Hồ Chí Minh',
        coordinates: { lat: 10.7769, lng: 106.7009 },
      },
      manager: managerUser._id,
      contactPhone: '028-1234-5678',
      contactEmail: 'parking@vp123.com',
      operatingHours: { open: '06:00', close: '22:00', is24Hours: false },
      amenities: ['CCTV', 'Bảo vệ 24/7', 'Thang máy', 'Sạc điện EV', 'Wifi miễn phí'],
      status: 'active',
      settings: {
        allowBooking: true,
        maxBookingHours: 24,
        maxAdvanceBookingDays: 7,
        overtimeGracePeriodMinutes: 15,
      },
    },
    {
      name: 'Bãi xe Bitexco Financial Tower',
      code: 'BTX01',
      description: 'Bãi xe trung tâm quận 1, an ninh cao',
      address: {
        street: '2 Hải Triều',
        ward: 'Phường Bến Nghé',
        district: 'Quận 1',
        city: 'TP. Hồ Chí Minh',
        coordinates: { lat: 10.7716, lng: 106.7044 },
      },
      manager: managerUser._id,
      contactPhone: '028-1234-5679',
      contactEmail: 'parking@bitexco.com',
      operatingHours: { open: '00:00', close: '23:59', is24Hours: true },
      amenities: ['CCTV', 'Bảo vệ 24/7', 'Thang máy', 'Sạc điện EV', 'Rửa xe'],
      status: 'active',
      settings: {
        allowBooking: true,
        maxBookingHours: 24,
        maxAdvanceBookingDays: 7,
        overtimeGracePeriodMinutes: 15,
      },
    },
    {
      name: 'Bãi xe Vincom Center Đồng Khởi',
      code: 'VNDK01',
      description: 'Bãi xe tầng hầm Vincom Center',
      address: {
        street: '72 Lê Thánh Tôn',
        ward: 'Phường Bến Nghé',
        district: 'Quận 1',
        city: 'TP. Hồ Chí Minh',
        coordinates: { lat: 10.7781, lng: 106.7020 },
      },
      manager: managerUser._id,
      contactPhone: '028-1234-5680',
      contactEmail: 'parking@vincom.com',
      operatingHours: { open: '08:00', close: '22:00', is24Hours: false },
      amenities: ['CCTV', 'Bảo vệ 24/7', 'Thang máy', 'Xe đẩy'],
      status: 'active',
      settings: {
        allowBooking: true,
        maxBookingHours: 12,
        maxAdvanceBookingDays: 3,
        overtimeGracePeriodMinutes: 15,
      },
    },
    {
      name: 'Bãi xe sân bay Tân Sơn Nhất (Quốc Nội)',
      code: 'TSN01',
      description: 'Bãi xe ga quốc nội TSN, hoạt động 24/7',
      address: {
        street: 'Trường Sơn',
        ward: 'Phường 2',
        district: 'Tân Bình',
        city: 'TP. Hồ Chí Minh',
        coordinates: { lat: 10.8146, lng: 106.6661 },
      },
      manager: managerUser._id,
      contactPhone: '028-1234-5681',
      contactEmail: 'parking@tsn.com',
      operatingHours: { open: '00:00', close: '23:59', is24Hours: true },
      amenities: ['CCTV', 'Bảo vệ 24/7', 'Sạc điện EV', 'Xe buýt trung chuyển'],
      status: 'active',
      settings: {
        allowBooking: true,
        maxBookingHours: 72,
        maxAdvanceBookingDays: 30,
        overtimeGracePeriodMinutes: 60,
      },
    }
  ];

  const lots = await ParkingLot.insertMany(lotsToCreate);
  console.log(`✅ Created ${lots.length} parking lots`);
  return lots;
};

const seedFloorsAndZones = async (lot, vehicleTypes) => {
  console.log('🏗️  Seeding floors and zones...');

  const carType = vehicleTypes.find(v => v.code === 'CAR');
  const eCarType = vehicleTypes.find(v => v.code === 'ELECTRIC_CAR');
  const motoType = vehicleTypes.find(v => v.code === 'MOTORBIKE');
  const bikeType = vehicleTypes.find(v => v.code === 'BICYCLE');
  const eBikeType = vehicleTypes.find(v => v.code === 'ELECTRIC_BIKE');

  const floors = [
    {
      parkingLot: lot._id,
      floorNumber: -1,
      name: 'Basement B1',
      floorType: 'basement',
      allowedVehicleTypes: [carType._id],
      status: 'active',
    },
    {
      parkingLot: lot._id,
      floorNumber: 1,
      name: 'Floor 1 (Ground Floor)',
      floorType: 'ground',
      allowedVehicleTypes: [eCarType._id, bikeType._id],
      status: 'active',
    },
    {
      parkingLot: lot._id,
      floorNumber: 2,
      name: 'Floor 2',
      floorType: 'above_ground',
      allowedVehicleTypes: [motoType._id],
      status: 'active',
    },
    {
      parkingLot: lot._id,
      floorNumber: 3,
      name: 'Floor 3',
      floorType: 'above_ground',
      allowedVehicleTypes: [eBikeType._id],
      status: 'active',
    },
  ];

  const createdFloors = await Floor.insertMany(floors);
  console.log(`✅ Created ${createdFloors.length} floors`);

  // Create zones for each floor
  const zones = [];
  for (const floor of createdFloors) {
    // For Ground Floor (1), we have eCar and Bike, so separate zones
    if (floor.floorNumber === 1) {
      zones.push(
        { floor: floor._id, parkingLot: lot._id, name: 'Khu A (Electric Car)', code: `F1A`, status: 'active', allowedVehicleTypes: [eCarType._id] },
        { floor: floor._id, parkingLot: lot._id, name: 'Khu B (Bicycle)', code: `F1B`, status: 'active', allowedVehicleTypes: [bikeType._id] },
      );
    }
    // For others, just create Zone A and Zone B for the same vehicle type
    else {
      zones.push(
        { floor: floor._id, parkingLot: lot._id, name: 'Khu A', code: `F${floor.floorNumber === -1 ? 'B1' : floor.floorNumber}A`, status: 'active', allowedVehicleTypes: floor.allowedVehicleTypes },
        { floor: floor._id, parkingLot: lot._id, name: 'Khu B', code: `F${floor.floorNumber === -1 ? 'B1' : floor.floorNumber}B`, status: 'active', allowedVehicleTypes: floor.allowedVehicleTypes },
      );
    }
  }

  const createdZones = await Zone.insertMany(zones);
  console.log(`✅ Created ${createdZones.length} zones`);

  return { createdFloors, createdZones };
};

const seedParkingSlots = async (lot, floors, zones, vehicleTypes) => {
  console.log('🅿️  Seeding parking slots...');

  const carType = vehicleTypes.find(v => v.code === 'CAR');
  const eCarType = vehicleTypes.find(v => v.code === 'ELECTRIC_CAR');
  const motoType = vehicleTypes.find(v => v.code === 'MOTORBIKE');
  const bikeType = vehicleTypes.find(v => v.code === 'BICYCLE');
  const eBikeType = vehicleTypes.find(v => v.code === 'ELECTRIC_BIKE');

  const slots = [];

  // Floor B1: CAR
  const b1Floor = floors.find(f => f.floorNumber === -1);
  const b1Zones = zones.filter(z => z.floor.toString() === b1Floor._id.toString());

  for (const zone of b1Zones) {
    const rowCode = zone.code.slice(-1); // A or B
    for (let i = 1; i <= 30; i++) {
      slots.push({
        slotCode: `B1${rowCode}-${String(i).padStart(3, '0')}`,
        parkingLot: lot._id,
        floor: b1Floor._id,
        zone: zone._id,
        vehicleType: carType._id,
        status: 'available',
        position: { row: rowCode, column: i },
      });
    }
  }

  // Floor 1: Electric Car (Zone A) & Bicycle (Zone B)
  const f1Floor = floors.find(f => f.floorNumber === 1);
  const f1Zones = zones.filter(z => z.floor.toString() === f1Floor._id.toString());
  const f1ZoneA = f1Zones.find(z => z.code.includes('A'));
  const f1ZoneB = f1Zones.find(z => z.code.includes('B'));

  for (let i = 1; i <= 15; i++) {
    slots.push({
      slotCode: `F1A-${String(i).padStart(3, '0')}`,
      parkingLot: lot._id,
      floor: f1Floor._id,
      zone: f1ZoneA._id,
      vehicleType: eCarType._id,
      status: 'available',
      position: { row: 'A', column: i },
      features: { hasEVCharger: true }, // all electric cars have EV charger
    });
  }
  for (let i = 1; i <= 20; i++) {
    slots.push({
      slotCode: `F1B-${String(i).padStart(3, '0')}`,
      parkingLot: lot._id,
      floor: f1Floor._id,
      zone: f1ZoneB._id,
      vehicleType: bikeType._id,
      status: 'available',
      position: { row: 'B', column: i },
    });
  }

  // Floor 2: Motorbike
  const f2Floor = floors.find(f => f.floorNumber === 2);
  const f2Zones = zones.filter(z => z.floor.toString() === f2Floor._id.toString());
  for (const zone of f2Zones) {
    const rowCode = zone.code.slice(-1); // A or B
    for (let i = 1; i <= 40; i++) {
      slots.push({
        slotCode: `F2${rowCode}-${String(i).padStart(3, '0')}`,
        parkingLot: lot._id,
        floor: f2Floor._id,
        zone: zone._id,
        vehicleType: motoType._id,
        status: 'available',
        position: { row: rowCode, column: i },
      });
    }
  }

  // Floor 3: Electric Bike
  const f3Floor = floors.find(f => f.floorNumber === 3);
  const f3Zones = zones.filter(z => z.floor.toString() === f3Floor._id.toString());
  for (const zone of f3Zones) {
    const rowCode = zone.code.slice(-1); // A or B
    for (let i = 1; i <= 40; i++) {
      slots.push({
        slotCode: `F3${rowCode}-${String(i).padStart(3, '0')}`,
        parkingLot: lot._id,
        floor: f3Floor._id,
        zone: zone._id,
        vehicleType: eBikeType._id,
        status: 'available',
        position: { row: rowCode, column: i },
        features: { hasEVCharger: true }, // EV chargers for electric bikes
      });
    }
  }

  const createdSlots = await ParkingSlot.insertMany(slots);
  console.log(`✅ Created ${createdSlots.length} parking slots`);

  // Update floor slot counts
  for (const floor of floors) {
    const floorSlots = createdSlots.filter(s => s.floor.toString() === floor._id.toString());
    await Floor.findByIdAndUpdate(floor._id, {
      totalSlots: floorSlots.length,
      availableSlots: floorSlots.length,
      occupiedSlots: 0,
    });
  }

  // Update zone slot counts
  for (const zone of zones) {
    const zoneSlots = createdSlots.filter(s => s.zone?.toString() === zone._id.toString());
    await Zone.findByIdAndUpdate(zone._id, {
      totalSlots: zoneSlots.length,
      availableSlots: zoneSlots.length,
    });
  }

  // Update parking lot counts
  await ParkingLot.findByIdAndUpdate(lot._id, {
    totalFloors: floors.length,
    totalSlots: createdSlots.length,
    availableSlots: createdSlots.length,
    occupiedSlots: 0,
  });

  return createdSlots;
};

const runSeeder = async () => {
  try {
    await connectDB();

    const shouldClear = process.argv.includes('--clear');
    if (shouldClear) {
      await clearDB();
    }

    console.log('\n🌱 Starting database seeding...\n');

    // 1. Vehicle types first
    const vehicleTypes = await seedVehicleTypes();

    // 2. Create a temporary parking lot for user assignment
    const tempLot = await ParkingLot.create({
      name: 'Temp Lot',
      code: 'TEMP001',
      address: { street: 'temp', district: 'temp', city: 'temp' },
      status: 'active',
    });

    // 3. Seed users (need parking lot ref for manager/staff)
    const users = await seedUsers(tempLot);

    // 4. Real parking lot with manager
    const managerUser = users.find(u => u.role === 'parking_manager');
    const staffUsers = users.filter(u => u.role === 'parking_staff');

    await ParkingLot.deleteOne({ code: 'TEMP001' });

    const lots = await seedParkingLots(managerUser);

    // Update users with correct lot
    await User.updateMany(
      { role: { $in: ['parking_manager', 'parking_staff'] } },
      { assignedParkingLot: lots[0]._id }
    );

    // Add staff to lot
    await ParkingLot.findByIdAndUpdate(lots[0]._id, {
      staff: staffUsers.map(s => s._id),
    });

    let totalFloors = 0;
    let totalZones = 0;
    let totalSlots = 0;

    for (const lot of lots) {
      // 5. Floors and zones
      const { createdFloors, createdZones } = await seedFloorsAndZones(lot, vehicleTypes);

      // 6. Parking slots
      const createdSlots = await seedParkingSlots(lot, createdFloors, createdZones, vehicleTypes);

      totalFloors += createdFloors.length;
      totalZones += createdZones.length;
      totalSlots += createdSlots.length;
    }

    console.log('\n🎉 Seeding completed successfully!\n');
    console.log('='.repeat(50));
    console.log('📋 SEED ACCOUNTS:');
    console.log('='.repeat(50));
    console.log('👑 System Admin:');
    console.log('   Email: admin@parking.com');
    console.log('   Password: Admin123!');
    console.log('');
    console.log('🏢 Parking Manager:');
    console.log('   Email: manager@parking.com');
    console.log('   Password: Manager123!');
    console.log('');
    console.log('👷 Parking Staff:');
    console.log('   Email: staff@parking.com');
    console.log('   Password: Staff123!');
    console.log('');
    console.log('🚗 Parking User:');
    console.log('   Email: user@parking.com');
    console.log('   Password: User123!');
    console.log('='.repeat(50));
    console.log(`\n📊 Stats:`);
    console.log(`   Vehicle Types: ${vehicleTypes.length}`);
    console.log(`   Users: ${users.length}`);
    console.log(`   Parking Lots: ${lots.length}`);
    console.log(`   Floors: ${totalFloors}`);
    console.log(`   Zones: ${totalZones}`);
    console.log(`   Parking Slots: ${totalSlots}`);
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
};

runSeeder();
