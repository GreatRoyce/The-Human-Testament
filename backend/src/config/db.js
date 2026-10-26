
const mongoose = require("mongoose");
mongoose.connection.on('disconnected', () => console.warn({ event: 'database_disconnected' }));
mongoose.connection.on('error', () => console.error({ event: 'database_error' }));

const connectDB = async () => {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error("MONGODB_URI is missing from the .env file.");
  }

  try {
    const connection = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 15000,
      waitQueueTimeoutMS: 5000,
      maxPoolSize: 20,
      minPoolSize: 0,
      bufferCommands: false,
      autoCreate: false,
      autoIndex: false,
    });

    console.info({ event: 'database_connected' });

    return connection;
  } catch (error) {
    console.error('MongoDB connection failed.', { name: error.name, code: error.code ?? 'DATABASE_ERROR' });
    throw error;
  }
};

module.exports = connectDB;
