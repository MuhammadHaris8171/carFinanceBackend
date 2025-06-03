# Car Nihat Telegram Bot

A Telegram bot for the Car Financing System that allows users to check customer information and payment details.

## Bot Information

- Bot Username: @car_nihat_bot
- Access the bot at: [t.me/car_nihat_bot](https://t.me/car_nihat_bot)

## Features

- Customer information lookup
- Payment status checking
- Quick help and information

## Setup Instructions

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the bot:
   ```bash
   npm start
   ```

   For development with auto-restart:
   ```bash
   npm run dev
   ```

## Available Commands

- `/start` - Start the bot
- `/help` - Show help information
- `/about` - About this bot
- `/customers` - Get customer count
- `/payments` - Get payment information

## Integration with Main Application

This bot connects to the Car Financing System's database to provide real-time information about customers and payments.

## Security

The bot token is stored securely and should not be shared publicly.

## Customization

To customize the bot:
1. Update the bot's profile picture and description using BotFather
2. Modify the commands and responses in `index.js`
3. Add additional features as needed 