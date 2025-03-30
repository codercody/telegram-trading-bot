# Telegram Trading Bot

A mock trading bot for Telegram that allows users to trade stocks with simulated money.

## Features

- Real-time market data from Yahoo Finance
- Support for market and limit orders
- Demo mode with simulated prices
- Bilingual support (English/Chinese)
- PIN verification for security
- Market hours trading restrictions

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy the environment template:
   ```bash
   cp .env.example .env
   ```

3. Update the .env file with your Telegram bot token and other settings

4. Start the bot:
   ```bash
   npm start
   ```

## Development

Run in development mode with auto-reload:
```bash
npm run dev
```

## Available Commands

- /start - Start the bot
- /help - Show help message
- /balance - Check account balance
- /positions - View current positions
- /pnl - Check profit/loss
- /buy - Place a buy order
- /sell - Place a sell order
- /orders - View pending orders
- /demo - Toggle demo mode
- /mode - Show current trading mode
- /market - Check market status
- /cancel - Cancel a pending order

## Security

- All transactions require a 4-digit PIN
- PIN is required for all operations
- Market orders are only accepted during market hours
- Demo mode available for testing

## License

MIT
