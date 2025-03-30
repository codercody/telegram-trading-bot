const fs = require('fs');
const path = require('path');

const BUILD_DIR = path.join(__dirname, '..', 'dist');
const SRC_DIR = path.join(__dirname, '..', 'src');

// Clean build directory
function cleanBuildDir() {
  if (fs.existsSync(BUILD_DIR)) {
    fs.rmSync(BUILD_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(BUILD_DIR, { recursive: true });
}

// Copy source files
function copySourceFiles() {
  // Create src directory in build
  const buildSrcDir = path.join(BUILD_DIR, 'src');
  fs.mkdirSync(buildSrcDir, { recursive: true });

  // Copy all source files
  const files = fs.readdirSync(SRC_DIR);
  files.forEach(file => {
    if (file.endsWith('.js')) {
      fs.copyFileSync(
        path.join(SRC_DIR, file),
        path.join(buildSrcDir, file)
      );
    }
  });
}

// Create production .env template
function createEnvTemplate() {
  const envTemplate = `# Telegram Bot Token
TELEGRAM_BOT_TOKEN=your_bot_token_here

# Trading Settings
INITIAL_BALANCE=100000
PIN=0720

# Market Settings
PRICE_CACHE_DURATION=60000
`;

  fs.writeFileSync(path.join(BUILD_DIR, '.env.example'), envTemplate);
}

// Create README
function createReadme() {
  const readme = `# Telegram Trading Bot

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
   \`\`\`bash
   npm install
   \`\`\`

2. Copy the environment template:
   \`\`\`bash
   cp .env.example .env
   \`\`\`

3. Update the .env file with your Telegram bot token and other settings

4. Start the bot:
   \`\`\`bash
   npm start
   \`\`\`

## Development

Run in development mode with auto-reload:
\`\`\`bash
npm run dev
\`\`\`

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
`;

  fs.writeFileSync(path.join(BUILD_DIR, 'README.md'), readme);
}

// Copy package.json with production settings
function createPackageJson() {
  const packageJson = require('../package.json');
  
  // Remove devDependencies and scripts
  delete packageJson.devDependencies;
  delete packageJson.scripts;
  
  // Add production scripts
  packageJson.scripts = {
    start: 'node src/bot.js'
  };

  fs.writeFileSync(
    path.join(BUILD_DIR, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );
}

// Main build function
function build() {
  console.log('Starting build process...');
  
  // Clean build directory
  cleanBuildDir();
  
  // Copy source files
  console.log('Copying source files...');
  copySourceFiles();
  
  // Create environment template
  console.log('Creating environment template...');
  createEnvTemplate();
  
  // Create README
  console.log('Creating README...');
  createReadme();
  
  // Create production package.json
  console.log('Creating package.json...');
  createPackageJson();
  
  console.log('Build completed successfully!');
}

// Handle clean command
if (process.argv[2] === 'clean') {
  cleanBuildDir();
  console.log('Build directory cleaned.');
} else {
  build();
} 