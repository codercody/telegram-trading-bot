# Telegram Mock Trading Bot

A Telegram bot that allows you to perform mock trading operations. This bot provides a simple interface to check your positions, P&L, and place buy/sell orders.

## Features

- Check account balance
- View current positions
- Check profit/loss (P&L)
- Place buy orders
- Place sell orders
- Mock price simulation

## Setup

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the root directory with your Telegram bot token:
   ```
   TELEGRAM_BOT_TOKEN=your_bot_token_here
   ```
   To get a bot token, talk to [@BotFather](https://t.me/botfather) on Telegram.

4. Start the bot:
   ```bash
   npm start
   ```

## Usage

Start a chat with your bot on Telegram and use the following commands:

- `/start` - Start the bot and see available commands
- `/help` - Show help message with available commands
- `/balance` - Check your account balance
- `/positions` - View your current positions
- `/pnl` - Check your profit/loss
- `/buy <symbol> <quantity>` - Place a buy order (e.g., `/buy AAPL 10`)
- `/sell <symbol> <quantity>` - Place a sell order (e.g., `/sell AAPL 10`)

## Deployment to Vercel

1. Push your code to a GitHub repository
2. Connect your repository to Vercel
3. Add your `TELEGRAM_BOT_TOKEN` as an environment variable in your Vercel project settings
4. Deploy!

## Note

This is a mock trading bot that uses simulated prices. It's meant for learning and testing purposes only. The initial balance is set to $100,000 for demonstration purposes. 