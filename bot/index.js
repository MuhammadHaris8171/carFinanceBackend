const { Telegraf } = require('telegraf');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const integrations = require('./integrations');

// Initialize bot with token from config
const bot = new Telegraf(config.BOT_TOKEN);

// Set bot commands
bot.telegram.setMyCommands([
  { command: 'start', description: 'Start the bot' },
  { command: 'help', description: 'Show help information' },
  { command: 'about', description: 'About this bot' },
  { command: 'customers', description: 'Get customer count' },
  { command: 'payments', description: 'Get payment information' },
  { command: 'search', description: 'Search for a customer' },
]);

// Start command
bot.command('start', (ctx) => {
  ctx.reply('Welcome to Car Nihat Bot! I can help you with car financing information. Use /help to see available commands.');
});

// Help command
bot.command('help', (ctx) => {
  ctx.reply(
    'Available commands:\n\n' +
    '/start - Start the bot\n' +
    '/help - Show this help message\n' +
    '/about - Information about this bot\n' +
    '/customers - Get customer count\n' +
    '/payments - Get payment information\n' +
    '/search <name or id> - Search for a customer'
  );
});

// About command
bot.command('about', (ctx) => {
  ctx.reply('Car Nihat Bot - A Telegram bot for the Car Financing System. Use this bot to check customer information and payment details.');
});

// Customers command - now using integration
bot.command('customers', async (ctx) => {
  try {
    const customerData = await integrations.getCustomerCount();
    ctx.reply(
      '📊 *Customer Statistics*\n\n' +
      `Total Customers: *${customerData.total}*\n` +
      `Active Customers: *${customerData.active}*\n` +
      `Inactive Customers: *${customerData.inactive}*`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Error fetching customer data:', error);
    ctx.reply('Sorry, I could not fetch customer information at this time.');
  }
});

// Payments command - now using integration
bot.command('payments', async (ctx) => {
  try {
    const paymentData = await integrations.getPaymentSummary();
    ctx.reply(
      '💰 *Payment Statistics*\n\n' +
      `Total Payments: *${paymentData.totalPayments}*\n` +
      `Completed Payments: *${paymentData.completedPayments}*\n` +
      `Pending Payments: *${paymentData.pendingPayments}*\n` +
      `Total Amount: *$${paymentData.totalAmount.toLocaleString()}*`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Error fetching payment data:', error);
    ctx.reply('Sorry, I could not fetch payment information at this time.');
  }
});

// Search command - to search for customers
bot.command('search', async (ctx) => {
  const searchTerm = ctx.message.text.split('/search ')[1];
  
  if (!searchTerm) {
    return ctx.reply('Please provide a customer name or ID to search. Example: /search John');
  }
  
  try {
    const customer = await integrations.getCustomerDetails(searchTerm);
    
    if (!customer) {
      return ctx.reply(`No customer found matching "${searchTerm}"`);
    }
    
    ctx.reply(
      `🧑‍💼 *Customer Details*\n\n` +
      `ID: *${customer.id}*\n` +
      `Name: *${customer.name}*\n` +
      `Phone: *${customer.phone}*\n` +
      `Car Model: *${customer.carModel}*\n` +
      `Payment Status: *${customer.paymentStatus}*\n` +
      `Next Payment: *${customer.nextPaymentDate}*`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Error searching for customer:', error);
    ctx.reply('Sorry, I could not complete the search at this time.');
  }
});

// Handle text messages
bot.on('text', (ctx) => {
  ctx.reply('I can only respond to commands. Use /help to see available commands.');
});

// Error handling
bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  ctx.reply('An error occurred while processing your request.');
});

// Start the bot
bot.launch()
  .then(() => {
    console.log('Bot started successfully!');
    console.log(`Bot username: @${config.BOT_USERNAME}`);
  })
  .catch((err) => {
    console.error('Failed to start bot:', err);
  });

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

module.exports = bot; 