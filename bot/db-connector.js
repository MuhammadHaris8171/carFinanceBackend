/**
 * Database connector for the Telegram bot
 * This file provides functions to connect to the main application's database
 */

const path = require('path');
const { Sequelize } = require('sequelize');

// Path to the SQLite database file
const dbPath = path.join(__dirname, '..', 'database.sqlite');

// Create a new Sequelize instance
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: dbPath,
  logging: false
});

// Test the connection
async function testConnection() {
  try {
    await sequelize.authenticate();
    console.log('Bot successfully connected to the database.');
    return true;
  } catch (error) {
    console.error('Bot could not connect to the database:', error);
    return false;
  }
}

// Export the sequelize instance and helper functions
module.exports = {
  sequelize,
  testConnection
}; 