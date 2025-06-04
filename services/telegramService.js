const { Telegraf } = require('telegraf');
require('dotenv').config();

// Initialize the bot with your token
const bot = process.env.TELEGRAM_BOT_TOKEN ? 
  new Telegraf(process.env.TELEGRAM_BOT_TOKEN) : 
  null;

const chatId = process.env.TELEGRAM_CHAT_ID;

/**
 * Send a payment reminder message via Telegram
 * @param {Object} payment - The payment object
 * @param {Object} customer - The customer object
 * @returns {Promise<void>}
 */
const sendPaymentReminder = async (payment, customer) => {
  if (!bot || !chatId) {
    console.log('Telegram bot not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env file.');
    return;
  }

  try {
    const message = `🔔 Payment Reminder\n\nCustomer: ${customer.fullName}\nAmount: ₼${payment.amount}\nDue Date: ${new Date(payment.dueDate).toLocaleDateString()}\nPhone: ${customer.phoneNumber}\nCar: ${customer.carBrand} ${customer.carModel}`;
    
    await bot.telegram.sendMessage(chatId, message);
    console.log(`Reminder sent for customer ${customer.fullName}`);
  } catch (error) {
    console.error('Error sending Telegram message:', error);
  }
};

/**
 * Send a notification for overdue payments
 * @param {Array} overduePayments - Array of overdue payments with customer info
 * @returns {Promise<void>}
 */
const sendOverdueNotification = async (overduePayments) => {
  if (!bot || !chatId) {
    console.log('Telegram bot not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env file.');
    return;
  }

  try {
    if (overduePayments.length === 0) {
      return;
    }

    let message = `⚠️ Overdue Payments (${overduePayments.length})\n\n`;
    
    overduePayments.forEach((item, index) => {
      message += `${index + 1}. ${item.customer.fullName}: ₼${item.payment.amount} (${new Date(item.payment.dueDate).toLocaleDateString()})\n`;
    });
    
    await bot.telegram.sendMessage(chatId, message);
    console.log(`Overdue notification sent for ${overduePayments.length} payments`);
  } catch (error) {
    console.error('Error sending Telegram message:', error);
  }
};

/**
 * Send a daily summary of payments
 * @param {Object} summary - Payment summary object
 * @returns {Promise<void>}
 */
const sendDailySummary = async (summary) => {
  if (!bot || !chatId) {
    console.log('Telegram bot not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env file.');
    return;
  }

  try {
    const message = `📊 Daily Summary\n\nDue Today: ${summary.dueToday.length} payments (₼${summary.dueTodayAmount})\nOverdue: ${summary.overdue.length} payments (₼${summary.overdueAmount})\nPaid Today: ${summary.paidToday.length} payments (₼${summary.paidTodayAmount})`;
    
    await bot.telegram.sendMessage(chatId, message);
    console.log('Daily summary sent');
  } catch (error) {
    console.error('Error sending Telegram message:', error);
  }
};

// Start the bot
if (bot) {
  bot.launch().then(() => {
    console.log('Telegram bot started');
  }).catch(err => {
    console.error('Failed to start Telegram bot:', err);
  });

  // Enable graceful stop
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

module.exports = {
  sendPaymentReminder,
  sendOverdueNotification,
  sendDailySummary
}; 