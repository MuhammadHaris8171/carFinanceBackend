const reminderService = require('./reminderService');

/**
 * Schedule a function to run at a specific time each day
 * @param {Function} fn - The function to run
 * @param {number} hour - The hour to run (0-23)
 * @param {number} minute - The minute to run (0-59)
 */
const scheduleDaily = (fn, hour, minute) => {
  const now = new Date();
  let scheduledTime = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hour,
    minute,
    0
  );
  
  // If the time has already passed today, schedule for tomorrow
  if (scheduledTime < now) {
    scheduledTime.setDate(scheduledTime.getDate() + 1);
  }
  
  const timeToWait = scheduledTime.getTime() - now.getTime();
  
  setTimeout(() => {
    fn();
    // Schedule again for the next day
    scheduleDaily(fn, hour, minute);
  }, timeToWait);
  
  console.log(`Scheduled ${fn.name} for ${scheduledTime.toLocaleString()}`);
};

/**
 * Initialize all scheduled tasks
 */
const initScheduler = () => {
  // Send reminders for payments due today at 9:00 AM
  scheduleDaily(reminderService.sendTodayReminders, 9, 0);
  
  // Send reminders for upcoming payments at 10:00 AM
  scheduleDaily(reminderService.sendUpcomingReminders, 10, 0);
  
  // Send reminders for overdue payments at 11:00 AM
  scheduleDaily(reminderService.sendOverdueReminders, 11, 0);
  
  // Send daily summary at 8:00 PM
  scheduleDaily(reminderService.sendDailySummary, 20, 0);
  
  console.log('Payment reminder scheduler initialized');
};

module.exports = {
  initScheduler
}; 