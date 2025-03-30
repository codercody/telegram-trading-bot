require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { TradingService } = require('./tradingService');

// Initialize bot with your token
const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// Initialize trading service
const tradingService = new TradingService();

// Translations
const translations = {
  welcome: {
    en: `Welcome to the Mock Trading Bot! 🚀\n\nAvailable commands:\n`,
    zh: `欢迎使用模拟交易机器人！🚀\n\n可用命令：\n`
  },
  commands: {
    balance: {
      en: `/balance - Check your account balance`,
      zh: `/balance - 查看账户余额`
    },
    positions: {
      en: `/positions - View your current positions`,
      zh: `/positions - 查看当前持仓`
    },
    pnl: {
      en: `/pnl - Check your profit/loss`,
      zh: `/pnl - 查看盈亏情况`
    },
    buy: {
      en: `/buy <symbol> <quantity> [limit <price>] - Place a buy order`,
      zh: `/buy <股票代码> <数量> [limit <价格>] - 下买单`
    },
    sell: {
      en: `/sell <symbol> <quantity> [limit <price>] - Place a sell order`,
      zh: `/sell <股票代码> <数量> [limit <价格>] - 下卖单`
    },
    orders: {
      en: `/orders - View your pending limit orders`,
      zh: `/orders - 查看待执行的限价单`
    },
    demo: {
      en: `/demo - Toggle demo mode (simulated prices)`,
      zh: `/demo - 切换演示模式（模拟价格）`
    },
    mode: {
      en: `/mode - Show current trading mode`,
      zh: `/mode - 显示当前交易模式`
    },
    market: {
      en: `/market - Check if market is open`,
      zh: `/market - 检查市场是否开放`
    },
    help: {
      en: `/help - Show this help message`,
      zh: `/help - 显示帮助信息`
    },
    cancel: {
      en: `/cancel <orderId> - Cancel a pending limit order`,
      zh: `/cancel <订单ID> - 取消待执行的限价单`
    }
  },
  messages: {
    noPositions: {
      en: 'You have no open positions.',
      zh: '您当前没有持仓。'
    },
    positions: {
      en: 'Your current positions:\n',
      zh: '您的当前持仓：\n'
    },
    positionFormat: {
      en: (symbol, quantity, avgPrice) => `${symbol}: ${quantity} shares (Avg Price: $${avgPrice.toFixed(2)})`,
      zh: (symbol, quantity, avgPrice) => `${symbol}: ${quantity} 股 (平均价格: $${avgPrice.toFixed(2)})`
    },
    noPendingOrders: {
      en: 'You have no pending orders.',
      zh: '您没有待执行的订单。'
    },
    pendingOrders: {
      en: 'Your pending orders:\n',
      zh: '您的待执行订单：\n'
    },
    orderFormat: {
      en: (orderId, type, quantity, symbol, price) => `ID: ${orderId}\n${type} ${quantity} ${symbol} @ $${price.toFixed(2)}`,
      zh: (orderId, type, quantity, symbol, price) => `ID: ${orderId}\n${type === 'BUY' ? '买入' : '卖出'} ${quantity} ${symbol} @ $${price.toFixed(2)}`
    },
    balance: {
      en: (amount) => `Your current balance: $${amount.toFixed(2)}`,
      zh: (amount) => `您的当前余额: $${amount.toFixed(2)}`
    },
    pnl: {
      en: (amount) => `Your current P&L: $${amount.toFixed(2)}`,
      zh: (amount) => `您的当前盈亏: $${amount.toFixed(2)}`
    },
    marketOrderExecuted: {
      en: (type, symbol, quantity, price) => `Market ${type.toLowerCase()} order executed!\nSymbol: ${symbol}\nQuantity: ${quantity}\nPrice: $${price.toFixed(2)}`,
      zh: (type, symbol, quantity, price) => `市价${type === 'BUY' ? '买入' : '卖出'}订单已执行！\n股票代码: ${symbol}\n数量: ${quantity}\n价格: $${price.toFixed(2)}`
    },
    limitOrderPlaced: {
      en: (message) => message,
      zh: (message) => message.replace('Limit', '限价').replace('buy', '买入').replace('sell', '卖出').replace('shares of', '股')
    },
    demoMode: {
      en: (enabled) => `Demo mode ${enabled ? 'enabled' : 'disabled'}. You are now using ${enabled ? 'simulated' : 'real'} market prices.`,
      zh: (enabled) => `演示模式已${enabled ? '启用' : '禁用'}。您现在使用${enabled ? '模拟' : '实时'}市场价格。`
    },
    currentMode: {
      en: (isDemo) => `Current trading mode: ${isDemo ? 'Demo Mode (simulated prices)' : 'Live Mode (real market prices)'}`,
      zh: (isDemo) => `当前交易模式: ${isDemo ? '演示模式（模拟价格）' : '实盘模式（实时价格）'}`
    },
    marketStatus: {
      en: (isOpen, time) => `Market is currently ${isOpen ? 'OPEN' : 'CLOSED'} (ET: ${time})`,
      zh: (isOpen, time) => `市场当前${isOpen ? '开放' : '关闭'} (美东时间: ${time})`
    },
    orderCancelled: {
      en: (type, symbol, quantity, price) => `Order cancelled successfully!\nType: ${type}\nSymbol: ${symbol}\nQuantity: ${quantity}\nLimit Price: $${price.toFixed(2)}`,
      zh: (type, symbol, quantity, price) => `订单已成功取消！\n类型: ${type === 'BUY' ? '买入' : '卖出'}\n股票代码: ${symbol}\n数量: ${quantity}\n限价: $${price.toFixed(2)}`
    },
    orderNotFound: {
      en: 'Order not found. Please check the order ID and try again.',
      zh: '未找到订单。请检查订单ID后重试。'
    },
    pinRequired: {
      en: 'Please enter your 4-digit PIN to confirm the transaction:',
      zh: '请输入4位数字PIN码以确认交易：'
    },
    invalidPin: {
      en: 'Invalid PIN. Transaction cancelled.',
      zh: 'PIN码无效。交易已取消。'
    },
    pinPrompt: {
      en: 'Enter PIN:',
      zh: '输入PIN码：'
    }
  }
};

// Helper function to send bilingual messages
function sendBilingualMessage(chatId, enMessage, zhMessage) {
  bot.sendMessage(chatId, `${enMessage}\n\n${zhMessage}`);
}

// Start checking limit orders periodically
setInterval(async () => {
  try {
    await tradingService.checkLimitOrders();
  } catch (error) {
    console.error('Error checking limit orders:', error);
  }
}, 30000); // Check every 30 seconds

// Add PIN verification state tracking
const userStates = new Map();

function startPinVerification(chatId, action, params) {
  userStates.set(chatId, {
    action,
    params,
    attempts: 0
  });
  
  sendBilingualMessage(
    chatId,
    translations.messages.pinRequired.en,
    translations.messages.pinRequired.zh
  );
}

function handlePinInput(chatId, pin) {
  const state = userStates.get(chatId);
  if (!state) {
    return false;
  }

  state.attempts++;
  if (state.attempts > 3) {
    userStates.delete(chatId);
    return false;
  }

  // Verify PIN against trading service
  try {
    tradingService.verifyPin(pin);
    return true;
  } catch (error) {
    return false;
  }
}

// Command handlers
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const enMessage = translations.welcome.en + Object.values(translations.commands).map(cmd => cmd.en).join('\n');
  const zhMessage = translations.welcome.zh + Object.values(translations.commands).map(cmd => cmd.zh).join('\n');
  sendBilingualMessage(chatId, enMessage, zhMessage);
});

bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const enMessage = Object.values(translations.commands).map(cmd => cmd.en).join('\n');
  const zhMessage = Object.values(translations.commands).map(cmd => cmd.zh).join('\n');
  sendBilingualMessage(chatId, enMessage, zhMessage);
});

bot.onText(/\/balance/, (msg) => {
  const chatId = msg.chat.id;
  startPinVerification(chatId, 'balance');
});

bot.onText(/\/positions/, (msg) => {
  const chatId = msg.chat.id;
  startPinVerification(chatId, 'positions');
});

bot.onText(/\/orders/, (msg) => {
  const chatId = msg.chat.id;
  const pendingOrders = tradingService.getPendingOrders();
  
  if (pendingOrders.length === 0) {
    sendBilingualMessage(
      chatId,
      translations.messages.noPendingOrders.en,
      translations.messages.noPendingOrders.zh
    );
    return;
  }
  
  const enMessage = translations.messages.pendingOrders.en + 
    pendingOrders.map(order => translations.messages.orderFormat.en(order.orderId, order.type, order.quantity, order.symbol, order.limitPrice)).join('\n');
  
  const zhMessage = translations.messages.pendingOrders.zh + 
    pendingOrders.map(order => translations.messages.orderFormat.zh(order.orderId, order.type, order.quantity, order.symbol, order.limitPrice)).join('\n');
  
  sendBilingualMessage(chatId, enMessage, zhMessage);
});

bot.onText(/\/pnl/, (msg) => {
  const chatId = msg.chat.id;
  startPinVerification(chatId, 'pnl');
});

bot.onText(/\/buy (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const args = match[1].split(' ');
  
  if (args.length < 2) {
    sendBilingualMessage(
      chatId,
      'Please provide both symbol and quantity. Example: /buy AAPL 10 or /buy AAPL 10 limit 150.50',
      '请提供股票代码和数量。例如: /buy AAPL 10 或 /buy AAPL 10 limit 150.50'
    );
    return;
  }

  const symbol = args[0];
  const quantity = parseInt(args[1]);
  let orderType = 'MARKET';
  let limitPrice = null;

  if (args.length >= 4 && args[2].toLowerCase() === 'limit') {
    orderType = 'LIMIT';
    limitPrice = parseFloat(args[3]);
  }

  startPinVerification(chatId, 'buy', { symbol, quantity, orderType, limitPrice });
});

bot.onText(/\/sell (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const args = match[1].split(' ');
  
  if (args.length < 2) {
    sendBilingualMessage(
      chatId,
      'Please provide both symbol and quantity. Example: /sell AAPL 10 or /sell AAPL 10 limit 150.50',
      '请提供股票代码和数量。例如: /sell AAPL 10 或 /sell AAPL 10 limit 150.50'
    );
    return;
  }

  const symbol = args[0];
  const quantity = parseInt(args[1]);
  let orderType = 'MARKET';
  let limitPrice = null;

  if (args.length >= 4 && args[2].toLowerCase() === 'limit') {
    orderType = 'LIMIT';
    limitPrice = parseFloat(args[3]);
  }

  startPinVerification(chatId, 'sell', { symbol, quantity, orderType, limitPrice });
});

bot.onText(/\/demo/, (msg) => {
  const chatId = msg.chat.id;
  startPinVerification(chatId, 'demo');
});

bot.onText(/\/mode/, (msg) => {
  const chatId = msg.chat.id;
  startPinVerification(chatId, 'mode');
});

bot.onText(/\/market/, (msg) => {
  const chatId = msg.chat.id;
  startPinVerification(chatId, 'market');
});

bot.onText(/\/cancel (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const orderId = match[1];
  startPinVerification(chatId, 'cancel', { orderId });
});

// Update PIN input handler
bot.onText(/^\d{4}$/, async (msg) => {
  const chatId = msg.chat.id;
  const pin = msg.text;
  const state = userStates.get(chatId);

  if (!state) {
    return;
  }

  if (!handlePinInput(chatId, pin)) {
    sendBilingualMessage(
      chatId,
      translations.messages.invalidPin.en,
      translations.messages.invalidPin.zh
    );
    return;
  }

  try {
    let result;
    switch (state.action) {
      case 'balance':
        const balance = tradingService.getBalance(pin);
        sendBilingualMessage(
          chatId,
          translations.messages.balance.en(balance),
          translations.messages.balance.zh(balance)
        );
        break;

      case 'positions':
        const positions = tradingService.getPositions(pin);
        if (positions.length === 0) {
          sendBilingualMessage(
            chatId,
            translations.messages.noPositions.en,
            translations.messages.noPositions.zh
          );
        } else {
          const enMessage = translations.messages.positions.en + 
            positions.map(pos => translations.messages.positionFormat.en(pos.symbol, pos.quantity, pos.avgPrice)).join('\n');
          
          const zhMessage = translations.messages.positions.zh + 
            positions.map(pos => translations.messages.positionFormat.zh(pos.symbol, pos.quantity, pos.avgPrice)).join('\n');
          
          sendBilingualMessage(chatId, enMessage, zhMessage);
        }
        break;

      case 'pnl':
        const pnl = await tradingService.getPnL(pin);
        sendBilingualMessage(
          chatId,
          translations.messages.pnl.en(pnl),
          translations.messages.pnl.zh(pnl)
        );
        break;

      case 'demo':
        const currentMode = tradingService.isDemoMode(pin);
        tradingService.setDemoMode(!currentMode, pin);
        const newMode = tradingService.isDemoMode(pin);
        sendBilingualMessage(
          chatId,
          translations.messages.demoMode.en(newMode),
          translations.messages.demoMode.zh(newMode)
        );
        break;

      case 'mode':
        const isDemo = tradingService.isDemoMode(pin);
        sendBilingualMessage(
          chatId,
          translations.messages.currentMode.en(isDemo),
          translations.messages.currentMode.zh(isDemo)
        );
        break;

      case 'market':
        const isOpen = tradingService.isMarketOpen(pin);
        const now = new Date();
        const etTime = new Date(now.getTime() + (tradingService.isDST(now) ? -4 : -5) * 60 * 60 * 1000);
        const timeString = etTime.toLocaleTimeString('en-US', { timeZone: 'America/New_York' });
        
        sendBilingualMessage(
          chatId,
          translations.messages.marketStatus.en(isOpen, timeString),
          translations.messages.marketStatus.zh(isOpen, timeString)
        );
        break;

      case 'buy':
        result = await tradingService.placeBuyOrder(
          state.params.symbol,
          state.params.quantity,
          state.params.orderType,
          state.params.limitPrice,
          pin
        );
        if (result.orderType === 'MARKET') {
          sendBilingualMessage(
            chatId,
            translations.messages.marketOrderExecuted.en('BUY', state.params.symbol, state.params.quantity, result.price),
            translations.messages.marketOrderExecuted.zh('BUY', state.params.symbol, state.params.quantity, result.price)
          );
        } else {
          sendBilingualMessage(
            chatId,
            translations.messages.limitOrderPlaced.en(result.message),
            translations.messages.limitOrderPlaced.zh(result.message)
          );
        }
        break;

      case 'sell':
        result = await tradingService.placeSellOrder(
          state.params.symbol,
          state.params.quantity,
          state.params.orderType,
          state.params.limitPrice,
          pin
        );
        if (result.orderType === 'MARKET') {
          sendBilingualMessage(
            chatId,
            translations.messages.marketOrderExecuted.en('SELL', state.params.symbol, state.params.quantity, result.price),
            translations.messages.marketOrderExecuted.zh('SELL', state.params.symbol, state.params.quantity, result.price)
          );
        } else {
          sendBilingualMessage(
            chatId,
            translations.messages.limitOrderPlaced.en(result.message),
            translations.messages.limitOrderPlaced.zh(result.message)
          );
        }
        break;

      case 'cancel':
        result = tradingService.cancelOrder(state.params.orderId, pin);
        sendBilingualMessage(
          chatId,
          translations.messages.orderCancelled.en(result.type, result.symbol, result.quantity, result.limitPrice),
          translations.messages.orderCancelled.zh(result.type, result.symbol, result.quantity, result.limitPrice)
        );
        break;
    }
  } catch (error) {
    if (error.message === 'Invalid PIN') {
      sendBilingualMessage(
        chatId,
        translations.messages.invalidPin.en,
        translations.messages.invalidPin.zh
      );
    } else {
      sendBilingualMessage(
        chatId,
        `Error: ${error.message}`,
        `错误: ${error.message}`
      );
    }
  } finally {
    userStates.delete(chatId);
  }
});

console.log('Bot is running...'); 