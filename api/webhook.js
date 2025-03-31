const { TradingService } = require('../src/tradingService');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Initialize trading service
const tradingService = new TradingService();

// Translations (moved from bot.js)
const translations = {
  // ... copy all translations from bot.js ...
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

function startPinVerification(chatId, action, params) {
  userStates.set(chatId, {
    action,
    params,
    attempts: 0
  });
  
  // Send PIN prompt and store the message ID
  return sendBilingualMessage(
    chatId,
    translations.messages.pinRequired.en,
    translations.messages.pinRequired.zh
  ).then(message => {
    userStates.set(chatId, {
      ...userStates.get(chatId),
      pinMessageId: message.result.message_id
    });
  });
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

  try {
    tradingService.verifyPin(pin);
    return true;
  } catch (error) {
    return false;
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
    const state = userStates.get(chatId);

    if (!state) {
      return;
    }

    // Delete the PIN input message
    await deleteMessage(chatId, msg.message_id);

    if (!handlePinInput(chatId, pin)) {
      await sendBilingualMessage(
        chatId,
        translations.messages.invalidPin.en,
        translations.messages.invalidPin.zh
      );
      return;
    }

    try {
      let result;
      switch (state.action) {
        // ... copy all cases from bot.js ...
      }
    } catch (error) {
      if (error.message === 'Invalid PIN') {
        await sendBilingualMessage(
          chatId,
          translations.messages.invalidPin.en,
          translations.messages.invalidPin.zh
        );
      } else {
        await sendBilingualMessage(
          chatId,
          `Error: ${error.message}`,
          `错误: ${error.message}`
        );
      }
    } finally {
      if (state.pinMessageId) {
        await deleteMessage(chatId, state.pinMessageId);
      }
      userStates.delete(chatId);
    }
    return;
  }

  // Handle other commands
  if (text.startsWith('/')) {
    const [command, ...args] = text.slice(1).split(' ');
    
    switch (command) {
      case 'balance':
        return startPinVerification(chatId, 'balance');
      case 'positions':
        return startPinVerification(chatId, 'positions');
      case 'orders':
        const pendingOrders = tradingService.getPendingOrders();
        if (pendingOrders.length === 0) {
          return sendBilingualMessage(
            chatId,
            translations.messages.noPendingOrders.en,
            translations.messages.noPendingOrders.zh
          );
        }
        const enMessage = translations.messages.pendingOrders.en + 
          pendingOrders.map(order => translations.messages.orderFormat.en(order.orderId, order.type, order.quantity, order.symbol, order.limitPrice)).join('\n');
        const zhMessage = translations.messages.pendingOrders.zh + 
          pendingOrders.map(order => translations.messages.orderFormat.zh(order.orderId, order.type, order.quantity, order.symbol, order.limitPrice)).join('\n');
        return sendBilingualMessage(chatId, enMessage, zhMessage);
      case 'pnl':
        return startPinVerification(chatId, 'pnl');
      case 'demo':
        return startPinVerification(chatId, 'demo');
      case 'mode':
        return startPinVerification(chatId, 'mode');
      case 'market':
        return startPinVerification(chatId, 'market');
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

        return startPinVerification(chatId, 'buy', { symbol, quantity, orderType, limitPrice });
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

        return startPinVerification(chatId, 'sell', { symbol: sellSymbol, quantity: sellQuantity, orderType: sellOrderType, limitPrice: sellLimitPrice });
      case 'cancel':
        if (args.length < 1) {
          return sendBilingualMessage(
            chatId,
            'Please provide an order ID. Example: /cancel 123456',
            '请提供订单ID。例如: /cancel 123456'
          );
        }
        return startPinVerification(chatId, 'cancel', { orderId: args[0] });
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