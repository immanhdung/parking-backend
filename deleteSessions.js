const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mongoose = require(path.join(__dirname, 'node_modules', 'mongoose'));

async function run() {
  try {
    const uri = process.env.MONGODB_URI_PROD || process.env.MONGODB_URI;
    console.log('Connecting to DB...', uri);
    await mongoose.connect(uri);
    console.log('Connected to DB');

    const result = await mongoose.connection.collection('parkingsessions').deleteMany({});
    console.log(`Deleted ${result.deletedCount} documents from parkingsessions`);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
