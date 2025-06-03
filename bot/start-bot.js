/**
 * Script to run the Car Nihat Telegram Bot
 */

// Import the database connector
const dbConnector = require('./db-connector');

// Import the bot
const bot = require('./index');

// Test the database connection
dbConnector.testConnection()
  .then(connected => {
    if (connected) {
      console.log('Starting Car Nihat Telegram Bot...');
      console.log('Press Ctrl+C to stop the bot');
    } else {
      console.error('Bot could not start due to database connection issues.');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('Error during startup:', error);
    process.exit(1);
  }); 