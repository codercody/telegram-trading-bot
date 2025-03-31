const { TradingService } = require('../src/tradingService');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

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
    },
    enterPin: {
      en: 'Please enter your 4-digit PIN:',
      zh: '请输入您的4位数字PIN码：'
    },
    noPendingAction: {
      en: 'No pending action. Please use the command format.',
      zh: '没有待执行的操作。请使用命令格式。'
    },
    error: {
      en: (message) => `Error: ${message}`,
      zh: (message) => `错误: ${message}`
    }
  }
};

// Helper function to send bilingual messages
async function sendBilingualMessage(chatId, enMessage, zhMessage) {
  const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: `${enMessage}\n\n${zhMessage}`,
    }),
  });
  return response.json();
}

// Helper function to delete message
async function deleteMessage(chatId, messageId) {
  const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/deleteMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
    }),
  });
  return response.json();
}

// PIN verification state tracking
const userStates = new Map();

// Simplified PIN verification
async function startPinVerification(chatId, userId, action, params = {}) {
  const pinMessage = await sendBilingualMessage(
    chatId,
    translations.messages.enterPin.en,
    translations.messages.enterPin.zh
  );
  
  // Store the PIN message ID for later deletion
  userStates.set(userId, {
    action,
    params,
    pinMessageId: pinMessage.message_id
  });
}

async function handlePinInput(chatId, userId, pin) {
  const state = userStates.get(userId);
  if (!state) {
    await sendBilingualMessage(
      chatId,
      translations.messages.noPendingAction.en,
      translations.messages.noPendingAction.zh
    );
    return;
  }

  // Delete the user's PIN input message
  await deleteMessage(chatId, state.pinMessageId);

  // Verify PIN
  if (pin !== '0720') {
    await sendBilingualMessage(
      chatId,
      translations.messages.invalidPin.en,
      translations.messages.invalidPin.zh
    );
    return;
  }

  // Clear the state
  userStates.delete(userId);

  try {
    let result;
    switch (state.action) {
      case 'balance':
        const balance = await tradingService.getBalance(userId);
        await sendBilingualMessage(
          chatId,
          translations.messages.balance.en(balance),
          translations.messages.balance.zh(balance)
        );
        break;

      case 'positions':
        const positions = await tradingService.getPositions(userId);
        if (positions.length === 0) {
          await sendBilingualMessage(
            chatId,
            translations.messages.noPositions.en,
            translations.messages.noPositions.zh
          );
        } else {
          const enMessage = translations.messages.positions.en + 
            positions.map(pos => translations.messages.positionFormat.en(pos.symbol, pos.quantity, pos.avg_price)).join('\n');
          
          const zhMessage = translations.messages.positions.zh + 
            positions.map(pos => translations.messages.positionFormat.zh(pos.symbol, pos.quantity, pos.avg_price)).join('\n');
          
          await sendBilingualMessage(chatId, enMessage, zhMessage);
        }
        break;

      case 'pnl':
        const pnl = await tradingService.getPnL(userId);
        await sendBilingualMessage(
          chatId,
          translations.messages.pnl.en(pnl),
          translations.messages.pnl.zh(pnl)
        );
        break;

      case 'demo':
        const currentMode = await tradingService.isDemoMode(userId);
        await tradingService.setDemoMode(!currentMode, userId);
        const newMode = await tradingService.isDemoMode(userId);
        await sendBilingualMessage(
          chatId,
          translations.messages.demoMode.en(newMode),
          translations.messages.demoMode.zh(newMode)
        );
        break;

      case 'mode':
        const isDemo = await tradingService.isDemoMode(userId);
        await sendBilingualMessage(
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
        
        await sendBilingualMessage(
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
          userId
        );
        if (result.orderType === 'MARKET') {
          await sendBilingualMessage(
            chatId,
            translations.messages.marketOrderExecuted.en('BUY', state.params.symbol, state.params.quantity, result.price),
            translations.messages.marketOrderExecuted.zh('BUY', state.params.symbol, state.params.quantity, result.price)
          );
        } else {
          await sendBilingualMessage(
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
          userId
        );
        if (result.orderType === 'MARKET') {
          await sendBilingualMessage(
            chatId,
            translations.messages.marketOrderExecuted.en('SELL', state.params.symbol, state.params.quantity, result.price),
            translations.messages.marketOrderExecuted.zh('SELL', state.params.symbol, state.params.quantity, result.price)
          );
        } else {
          await sendBilingualMessage(
            chatId,
            translations.messages.limitOrderPlaced.en(result.message),
            translations.messages.limitOrderPlaced.zh(result.message)
          );
        }
        break;

      case 'cancel':
        result = await tradingService.cancelOrder(state.params.orderId, userId);
        await sendBilingualMessage(
          chatId,
          translations.messages.orderCancelled.en(result.type, result.symbol, result.quantity, result.limitPrice),
          translations.messages.orderCancelled.zh(result.type, result.symbol, result.quantity, result.limitPrice)
        );
        break;
    }
  } catch (error) {
    await sendBilingualMessage(
      chatId,
      translations.messages.error.en(error.message),
      translations.messages.error.zh(error.message)
    );
  }
}

// Command handlers
async function handleCommand(msg) {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === '/start') {
    const enMessage = translations.welcome.en + Object.values(translations.commands).map(cmd => cmd.en).join('\n');
    const zhMessage = translations.welcome.zh + Object.values(translations.commands).map(cmd => cmd.zh).join('\n');
    return sendBilingualMessage(chatId, enMessage, zhMessage);
  }

  if (text === '/help') {
    const enMessage = Object.values(translations.commands).map(cmd => cmd.en).join('\n');
    const zhMessage = Object.values(translations.commands).map(cmd => cmd.zh).join('\n');
    return sendBilingualMessage(chatId, enMessage, zhMessage);
  }

  // Handle PIN input
  if (/^\d{4}$/.test(text)) {
    const pin = text;
    const userId = msg.from.id;
    await handlePinInput(chatId, userId, pin);
    return;
  }

  // Handle other commands
  if (text.startsWith('/')) {
    const [command, ...args] = text.slice(1).split(' ');
    
    switch (command) {
      case 'balance':
        await startPinVerification(chatId, msg.from.id, 'balance');
        break;
      case 'positions':
        await startPinVerification(chatId, msg.from.id, 'positions');
        break;
      case 'orders':
        const pendingOrders = await tradingService.getPendingOrders(msg.from.id);
        if (pendingOrders.length === 0) {
          return sendBilingualMessage(
            chatId,
            translations.messages.noPendingOrders.en,
            translations.messages.noPendingOrders.zh
          );
        }
        const enMessage = translations.messages.pendingOrders.en + 
          pendingOrders.map(order => translations.messages.orderFormat.en(order.id, order.type, order.quantity, order.symbol, order.limit_price)).join('\n');
        const zhMessage = translations.messages.pendingOrders.zh + 
          pendingOrders.map(order => translations.messages.orderFormat.zh(order.id, order.type, order.quantity, order.symbol, order.limit_price)).join('\n');
        return sendBilingualMessage(chatId, enMessage, zhMessage);
      case 'pnl':
        await startPinVerification(chatId, msg.from.id, 'pnl');
        break;
      case 'demo':
        await startPinVerification(chatId, msg.from.id, 'demo');
        break;
      case 'mode':
        await startPinVerification(chatId, msg.from.id, 'mode');
        break;
      case 'market':
        await startPinVerification(chatId, msg.from.id, 'market');
        break;
      case 'buy':
        if (args.length < 2) {
          return sendBilingualMessage(
            chatId,
            'Please provide both symbol and quantity. Example: /buy AAPL 10 or /buy AAPL 10 limit 150.50',
            '请提供股票代码和数量。例如: /buy AAPL 10 或 /buy AAPL 10 limit 150.50'
          );
        }
        const symbol = args[0];
        const quantity = parseInt(args[1]);
        let orderType = 'MARKET';
        let limitPrice = null;

        if (args.length >= 4 && args[2].toLowerCase() === 'limit') {
          orderType = 'LIMIT';
          limitPrice = parseFloat(args[3]);
        }

        await startPinVerification(chatId, msg.from.id, 'buy', { symbol, quantity, orderType, limitPrice });
        break;
      case 'sell':
        if (args.length < 2) {
          return sendBilingualMessage(
            chatId,
            'Please provide both symbol and quantity. Example: /sell AAPL 10 or /sell AAPL 10 limit 150.50',
            '请提供股票代码和数量。例如: /sell AAPL 10 或 /sell AAPL 10 limit 150.50'
          );
        }
        const sellSymbol = args[0];
        const sellQuantity = parseInt(args[1]);
        let sellOrderType = 'MARKET';
        let sellLimitPrice = null;

        if (args.length >= 4 && args[2].toLowerCase() === 'limit') {
          sellOrderType = 'LIMIT';
          sellLimitPrice = parseFloat(args[3]);
        }

        await startPinVerification(chatId, msg.from.id, 'sell', { symbol: sellSymbol, quantity: sellQuantity, orderType: sellOrderType, limitPrice: sellLimitPrice });
        break;
      case 'cancel':
        if (args.length < 1) {
          return sendBilingualMessage(
            chatId,
            'Please provide an order ID. Example: /cancel 123456',
            '请提供订单ID。例如: /cancel 123456'
          );
        }
        await startPinVerification(chatId, msg.from.id, 'cancel', { orderId: args[0] });
        break;
    }
  }
}

// Main webhook handler
module.exports = async (req, res) => {
  if (req.method === 'POST') {
    try {
      const update = req.body;
      
      // Handle Telegram webhook update
      if (update.message) {
        await handleCommand(update.message);
      }
      
      res.status(200).json({ ok: true });
    } catch (error) {
      console.error('Error handling webhook:', error);
      res.status(500).json({ error: error.message });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}; 