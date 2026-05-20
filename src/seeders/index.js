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
      name: 'Xe ô tô',
      code: 'CAR',
      description: 'Ô tô 4 chỗ đến 7 chỗ',
      size: 'large',
      pricing: { hourlyRate: 5000, dailyRate: 80000, monthlyRate: 1500000 },
      isActive: true,
    },
    {
      name: 'Xe máy',
      code: 'MOTORBIKE',
      description: 'Xe máy, xe mô tô',
      size: 'small',
      pricing: { hourlyRate: 2000, dailyRate: 20000, monthlyRate: 400000 },
      isActive: true,
    },
    {
      name: 'Xe đạp',
      code: 'BICYCLE',
      description: 'Xe đạp thường và xe đạp điện nhẹ',
      size: 'small',
      pricing: { hourlyRate: 1000, dailyRate: 10000, monthlyRate: 150000 },
      isActive: true,
    },
    {
      name: 'Xe đạp điện',
      code: 'ELECTRIC_BIKE',
      description: 'Xe đạp điện và xe điện nhỏ',
      size: 'small',
      pricing: { hourlyRate: 2000, dailyRate: 25000, monthlyRate: 500000 },
      isActive: true,
    },
    {
      name: 'Xe tải nhỏ',
      code: 'SMALL_TRUCK',
      description: 'Xe tải nhỏ và xe van',
      size: 'extra_large',
      pricing: { hourlyRate: 10000, dailyRate: 150000, monthlyRate: 3000000 },
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

const seedParkingLot = async (managerUser) => {
  console.log('🏢 Seeding parking lots...');

  const lot = await ParkingLot.create({
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
  });

  console.log(`✅ Created parking lot: ${lot.name}`);
  return lot;
};

const seedFloorsAndZones = async (lot, vehicleTypes) => {
  console.log('🏗️  Seeding floors and zones...');

  const carType = vehicleTypes.find(v => v.code === 'CAR');
  const motoType = vehicleTypes.find(v => v.code === 'MOTORBIKE');
  const bikeType = vehicleTypes.find(v => v.code === 'BICYCLE');
  const eBikeType = vehicleTypes.find(v => v.code === 'ELECTRIC_BIKE');

  const floors = [
    {
      parkingLot: lot._id,
      floorNumber: -1,
      name: 'Tầng Hầm B1',
      floorType: 'basement',
      allowedVehicleTypes: [motoType._id, bikeType._id, eBikeType._id],
      status: 'active',
    },
    {
      parkingLot: lot._id,
      floorNumber: 1,
      name: 'Tầng 1 (Trệt)',
      floorType: 'ground',
      allowedVehicleTypes: [carType._id, motoType._id],
      status: 'active',
    },
    {
      parkingLot: lot._id,
      floorNumber: 2,
      name: 'Tầng 2',
      floorType: 'above_ground',
      allowedVehicleTypes: [carType._id],
      status: 'active',
    },
    {
      parkingLot: lot._id,
      floorNumber: 3,
      name: 'Tầng 3',
      floorType: 'above_ground',
      allowedVehicleTypes: [carType._id],
      status: 'active',
    },
  ];

  const createdFloors = await Floor.insertMany(floors);
  console.log(`✅ Created ${createdFloors.length} floors`);

  // Create zones for each floor
  const zones = [];
  for (const floor of createdFloors) {
    zones.push(
      { floor: floor._id, parkingLot: lot._id, name: 'Khu A', code: `F${floor.floorNumber}A`, status: 'active', allowedVehicleTypes: floor.allowedVehicleTypes },
      { floor: floor._id, parkingLot: lot._id, name: 'Khu B', code: `F${floor.floorNumber}B`, status: 'active', allowedVehicleTypes: floor.allowedVehicleTypes },
    );
  }

  const createdZones = await Zone.insertMany(zones);
  console.log(`✅ Created ${createdZones.length} zones`);

  return { createdFloors, createdZones };
};

const seedParkingSlots = async (lot, floors, zones, vehicleTypes) => {
  console.log('🅿️  Seeding parking slots...');

  const carType = vehicleTypes.find(v => v.code === 'CAR');
  const motoType = vehicleTypes.find(v => v.code === 'MOTORBIKE');
  const bikeType = vehicleTypes.find(v => v.code === 'BICYCLE');

  const slots = [];

  // Floor B1: Motorbike & Bicycle slots
  const b1Floor = floors.find(f => f.floorNumber === -1);
  const b1Zones = zones.filter(z => z.floor.toString() === b1Floor._id.toString());
  const b1ZoneA = b1Zones.find(z => z.code.includes('A'));
  const b1ZoneB = b1Zones.find(z => z.code.includes('B'));

  for (let i = 1; i <= 30; i++) {
    slots.push({
      slotCode: `B1A-${String(i).padStart(3, '0')}`,
      parkingLot: lot._id,
      floor: b1Floor._id,
      zone: b1ZoneA._id,
      vehicleType: motoType._id,
      status: 'available',
      position: { row: 'A', column: i },
    });
  }
  for (let i = 1; i <= 10; i++) {
    slots.push({
      slotCode: `B1B-${String(i).padStart(3, '0')}`,
      parkingLot: lot._id,
      floor: b1Floor._id,
      zone: b1ZoneB._id,
      vehicleType: bikeType._id,
      status: 'available',
      position: { row: 'B', column: i },
    });
  }

  // Floor 1: Car + Motorbike
  const f1Floor = floors.find(f => f.floorNumber === 1);
  const f1Zones = zones.filter(z => z.floor.toString() === f1Floor._id.toString());
  const f1ZoneA = f1Zones.find(z => z.code.includes('A'));
  const f1ZoneB = f1Zones.find(z => z.code.includes('B'));

  for (let i = 1; i <= 20; i++) {
    slots.push({
      slotCode: `F1A-${String(i).padStart(3, '0')}`,
      parkingLot: lot._id,
      floor: f1Floor._id,
      zone: f1ZoneA._id,
      vehicleType: carType._id,
      status: 'available',
      position: { row: 'A', column: i },
    });
  }
  for (let i = 1; i <= 15; i++) {
    slots.push({
      slotCode: `F1B-${String(i).padStart(3, '0')}`,
      parkingLot: lot._id,
      floor: f1Floor._id,
      zone: f1ZoneB._id,
      vehicleType: motoType._id,
      status: 'available',
      position: { row: 'B', column: i },
    });
  }

  // Floor 2 & 3: Car only
  for (const floorNum of [2, 3]) {
    const floor = floors.find(f => f.floorNumber === floorNum);
    const floorZones = zones.filter(z => z.floor.toString() === floor._id.toString());
    const zoneA = floorZones.find(z => z.code.includes('A'));
    const zoneB = floorZones.find(z => z.code.includes('B'));

    for (let i = 1; i <= 25; i++) {
      slots.push({
        slotCode: `F${floorNum}A-${String(i).padStart(3, '0')}`,
        parkingLot: lot._id,
        floor: floor._id,
        zone: zoneA._id,
        vehicleType: carType._id,
        status: 'available',
        position: { row: 'A', column: i },
      });
    }
    for (let i = 1; i <= 25; i++) {
      slots.push({
        slotCode: `F${floorNum}B-${String(i).padStart(3, '0')}`,
        parkingLot: lot._id,
        floor: floor._id,
        zone: zoneB._id,
        vehicleType: carType._id,
        status: 'available',
        position: { row: 'B', column: i },
        features: { hasEVCharger: i <= 5 }, // First 5 slots have EV charger
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

    const lot = await seedParkingLot(managerUser);

    // Update users with correct lot
    await User.updateMany(
      { role: { $in: ['parking_manager', 'parking_staff'] } },
      { assignedParkingLot: lot._id }
    );

    // Add staff to lot
    await ParkingLot.findByIdAndUpdate(lot._id, {
      staff: staffUsers.map(s => s._id),
    });

    // 5. Floors and zones
    const { createdFloors, createdZones } = await seedFloorsAndZones(lot, vehicleTypes);

    // 6. Parking slots
    const createdSlots = await seedParkingSlots(lot, createdFloors, createdZones, vehicleTypes);

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
    console.log(`   Parking Lots: 1`);
    console.log(`   Floors: ${createdFloors.length}`);
    console.log(`   Zones: ${createdZones.length}`);
    console.log(`   Parking Slots: ${createdSlots.length}`);
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
};

runSeeder();
