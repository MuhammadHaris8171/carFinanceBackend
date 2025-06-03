const { Customer, Payment } = require('../models');
const { Op } = require('sequelize');
const telegramService = require('./telegramService');

/**
 * Send reminders for payments due today
 */
const sendTodayReminders = async () => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const dueTodayPayments = await Payment.findAll({
      where: {
        dueDate: {
          [Op.gte]: today,
          [Op.lt]: tomorrow
        },
        status: 'pending'
      },
      include: [{ model: Customer, as: 'Customer' }]
    });
    
    console.log(`Found ${dueTodayPayments.length} payments due today`);
    
    for (const payment of dueTodayPayments) {
      await telegramService.sendPaymentReminder(payment, payment.Customer);
    }
    
    return dueTodayPayments;
  } catch (error) {
    console.error('Error sending today reminders:', error);
    return [];
  }
};

/**
 * Send reminders for upcoming payments (in 3 days)
 */
const sendUpcomingReminders = async () => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const threeDaysLater = new Date(today);
    threeDaysLater.setDate(threeDaysLater.getDate() + 3);
    
    const fourDaysLater = new Date(today);
    fourDaysLater.setDate(fourDaysLater.getDate() + 4);
    
    const upcomingPayments = await Payment.findAll({
      where: {
        dueDate: {
          [Op.gte]: threeDaysLater,
          [Op.lt]: fourDaysLater
        },
        status: 'pending'
      },
      include: [{ model: Customer, as: 'Customer' }]
    });
    
    console.log(`Found ${upcomingPayments.length} upcoming payments in 3 days`);
    
    for (const payment of upcomingPayments) {
      await telegramService.sendPaymentReminder(payment, payment.Customer);
    }
    
    return upcomingPayments;
  } catch (error) {
    console.error('Error sending upcoming reminders:', error);
    return [];
  }
};

/**
 * Send reminders for overdue payments
 */
const sendOverdueReminders = async () => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const overduePayments = await Payment.findAll({
      where: {
        dueDate: {
          [Op.lt]: today
        },
        status: 'pending'
      },
      include: [{ model: Customer, as: 'Customer' }]
    });
    
    console.log(`Found ${overduePayments.length} overdue payments`);
    
    const overdueItems = overduePayments.map(payment => ({
      payment,
      customer: payment.Customer
    }));
    
    await telegramService.sendOverdueNotification(overdueItems);
    
    return overduePayments;
  } catch (error) {
    console.error('Error sending overdue reminders:', error);
    return [];
  }
};

/**
 * Send daily summary of payments
 */
const sendDailySummary = async () => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Get payments due today
    const dueToday = await Payment.findAll({
      where: {
        dueDate: {
          [Op.gte]: today,
          [Op.lt]: tomorrow
        },
        status: 'pending'
      },
      include: [{ model: Customer, as: 'Customer' }]
    });
    
    // Get overdue payments
    const overdue = await Payment.findAll({
      where: {
        dueDate: {
          [Op.lt]: today
        },
        status: 'pending'
      },
      include: [{ model: Customer, as: 'Customer' }]
    });
    
    // Get payments paid today
    const paidToday = await Payment.findAll({
      where: {
        paymentDate: {
          [Op.gte]: today,
          [Op.lt]: tomorrow
        },
        status: 'paid'
      },
      include: [{ model: Customer, as: 'Customer' }]
    });
    
    const summary = {
      dueToday,
      dueTodayAmount: dueToday.reduce((sum, payment) => sum + parseFloat(payment.amount), 0),
      overdue,
      overdueAmount: overdue.reduce((sum, payment) => sum + parseFloat(payment.amount), 0),
      paidToday,
      paidTodayAmount: paidToday.reduce((sum, payment) => sum + parseFloat(payment.amount), 0)
    };
    
    await telegramService.sendDailySummary(summary);
    
    return summary;
  } catch (error) {
    console.error('Error sending daily summary:', error);
    return null;
  }
};

module.exports = {
  sendTodayReminders,
  sendUpcomingReminders,
  sendOverdueReminders,
  sendDailySummary
}; 