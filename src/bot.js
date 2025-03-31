require('dotenv').config();
const { Telegraf } = require('telegraf');
const { TradingService } = require('./tradingService');

// Initialize bot with your token
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Initialize trading service
const tradingService = new TradingService();

// State management for PIN verification
const userStates = new Map();

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
async function sendBilingualMessage(ctx, enMessage, zhMessage) {
  const message = `${enMessage}\n\n${zhMessage}`;
  return await ctx.reply(message);
}

// Start checking limit orders periodically
setInterval(async () => {
  try {
    await tradingService.checkLimitOrders();
  } catch (error) {
    console.error('Error checking limit orders:', error);
  }
}, 30000); // Check every 30 seconds

// Start command
bot.command('start', async (ctx) => {
  const telegramId = ctx.from.id;
  await sendBilingualMessage(
    ctx,
    translations.welcome.en + Object.values(translations.commands).map(cmd => cmd.en).join('\n'),
    translations.welcome.zh + Object.values(translations.commands).map(cmd => cmd.zh).join('\n')
  );
});

// Help command
bot.command('help', async (ctx) => {
  const telegramId = ctx.from.id;
  await sendBilingualMessage(
    ctx,
    Object.values(translations.commands).map(cmd => cmd.en).join('\n'),
    Object.values(translations.commands).map(cmd => cmd.zh).join('\n')
  );
});

// Balance command
bot.command('balance', async (ctx) => {
  const telegramId = ctx.from.id;
  startPinVerification(ctx, async (pin) => {
    try {
      const balance = await tradingService.getBalance(telegramId, pin);
      await sendBilingualMessage(
        ctx,
        translations.messages.balance.en(balance),
        translations.messages.balance.zh(balance)
      );
    } catch (error) {
      await sendBilingualMessage(
        ctx,
        translations.messages.error.en.replace('{error}', error.message),
        translations.messages.error.zh.replace('{error}', error.message)
      );
    }
  });
});

// Positions command
bot.command('positions', async (ctx) => {
  const telegramId = ctx.from.id;
  startPinVerification(ctx, async (pin) => {
    try {
      const positions = await tradingService.getPositions(telegramId, pin);
      if (positions.length === 0) {
        await sendBilingualMessage(
          ctx,
          translations.messages.noPositions.en,
          translations.messages.noPositions.zh
        );
      } else {
        const positionList = positions.map(pos => 
          translations.messages.positionFormat.en
            .replace('{symbol}', pos.symbol)
            .replace('{quantity}', pos.quantity)
            .replace('{avgPrice}', pos.avg_price.toFixed(2))
        ).join('\n');

        const positionListZh = positions.map(pos => 
          translations.messages.positionFormat.zh
            .replace('{symbol}', pos.symbol)
            .replace('{quantity}', pos.quantity)
            .replace('{avgPrice}', pos.avg_price.toFixed(2))
        ).join('\n');

        await sendBilingualMessage(
          ctx,
          translations.messages.positions.en + '\n' + positionList,
          translations.messages.positions.zh + '\n' + positionListZh
        );
      }
    } catch (error) {
      await sendBilingualMessage(
        ctx,
        translations.messages.error.en.replace('{error}', error.message),
        translations.messages.error.zh.replace('{error}', error.message)
      );
    }
  });
});

// PnL command
bot.command('pnl', async (ctx) => {
  const telegramId = ctx.from.id;
  startPinVerification(ctx, async (pin) => {
    try {
      const pnl = await tradingService.getPnL(telegramId, pin);
      await sendBilingualMessage(
        ctx,
        translations.messages.pnl.en(pnl),
        translations.messages.pnl.zh(pnl)
      );
    } catch (error) {
      await sendBilingualMessage(
        ctx,
        translations.messages.error.en.replace('{error}', error.message),
        translations.messages.error.zh.replace('{error}', error.message)
      );
    }
  });
});

// Buy command
bot.command('buy', async (ctx) => {
  const telegramId = ctx.from.id;
  const args = ctx.message.text.split(' ');
  if (args.length < 4) {
    await sendBilingualMessage(
      ctx,
      translations.commands.buy.en + '\n' + translations.commands.buy.zh,
      translations.commands.buy.en + '\n' + translations.commands.buy.zh
    );
    return;
  }

  const symbol = args[1].toUpperCase();
  const quantity = parseInt(args[2]);
  const orderType = args[3].toUpperCase();
  const limitPrice = orderType === 'LIMIT' ? parseFloat(args[4]) : null;

  if (orderType === 'LIMIT' && !limitPrice) {
    await sendBilingualMessage(
      ctx,
      translations.messages.limitPriceRequired.en,
      translations.messages.limitPriceRequired.zh
    );
    return;
  }

  startPinVerification(ctx, async (pin) => {
    try {
      const result = await tradingService.placeBuyOrder(
        telegramId,
        symbol,
        quantity,
        orderType,
        limitPrice,
        pin
      );

      if (result.orderType === 'LIMIT') {
        await sendBilingualMessage(
          ctx,
          result.message,
          translations.messages.limitOrderPlaced.zh
            .replace('{symbol}', symbol)
            .replace('{quantity}', quantity)
            .replace('{price}', limitPrice.toFixed(2))
        );
      } else {
        await sendBilingualMessage(
          ctx,
          translations.messages.marketOrderExecuted.en
            .replace('{symbol}', symbol)
            .replace('{quantity}', quantity)
            .replace('{price}', result.price.toFixed(2)),
          translations.messages.marketOrderExecuted.zh
            .replace('{symbol}', symbol)
            .replace('{quantity}', quantity)
            .replace('{price}', result.price.toFixed(2))
        );
      }
    } catch (error) {
      await sendBilingualMessage(
        ctx,
        translations.messages.error.en.replace('{error}', error.message),
        translations.messages.error.zh.replace('{error}', error.message)
      );
    }
  });
});

// Sell command
bot.command('sell', async (ctx) => {
  const telegramId = ctx.from.id;
  const args = ctx.message.text.split(' ');
  if (args.length < 4) {
    await sendBilingualMessage(
      ctx,
      translations.commands.sell.en + '\n' + translations.commands.sell.zh,
      translations.commands.sell.en + '\n' + translations.commands.sell.zh
    );
    return;
  }

  const symbol = args[1].toUpperCase();
  const quantity = parseInt(args[2]);
  const orderType = args[3].toUpperCase();
  const limitPrice = orderType === 'LIMIT' ? parseFloat(args[4]) : null;

  if (orderType === 'LIMIT' && !limitPrice) {
    await sendBilingualMessage(
      ctx,
      translations.messages.limitPriceRequired.en,
      translations.messages.limitPriceRequired.zh
    );
    return;
  }

  startPinVerification(ctx, async (pin) => {
    try {
      const result = await tradingService.placeSellOrder(
        telegramId,
        symbol,
        quantity,
        orderType,
        limitPrice,
        pin
      );

      if (result.orderType === 'LIMIT') {
        await sendBilingualMessage(
          ctx,
          result.message,
          translations.messages.limitOrderPlaced.zh
            .replace('{symbol}', symbol)
            .replace('{quantity}', quantity)
            .replace('{price}', limitPrice.toFixed(2))
        );
      } else {
        await sendBilingualMessage(
          ctx,
          translations.messages.marketOrderExecuted.en
            .replace('{symbol}', symbol)
            .replace('{quantity}', quantity)
            .replace('{price}', result.price.toFixed(2)),
          translations.messages.marketOrderExecuted.zh
            .replace('{symbol}', symbol)
            .replace('{quantity}', quantity)
            .replace('{price}', result.price.toFixed(2))
        );
      }
    } catch (error) {
      await sendBilingualMessage(
        ctx,
        translations.messages.error.en.replace('{error}', error.message),
        translations.messages.error.zh.replace('{error}', error.message)
      );
    }
  });
});

// Orders command
bot.command('orders', async (ctx) => {
  const telegramId = ctx.from.id;
  startPinVerification(ctx, async (pin) => {
    try {
      const orders = await tradingService.getPendingOrders(telegramId);
      if (orders.length === 0) {
        await sendBilingualMessage(
          ctx,
          translations.messages.noPendingOrders.en,
          translations.messages.noPendingOrders.zh
        );
      } else {
        const orderList = orders.map(order => 
          translations.messages.orderFormat.en
            .replace('{orderId}', order.order_id)
            .replace('{type}', order.type)
            .replace('{symbol}', order.symbol)
            .replace('{quantity}', order.quantity)
            .replace('{price}', order.price.toFixed(2))
        ).join('\n');

        const orderListZh = orders.map(order => 
          translations.messages.orderFormat.zh
            .replace('{orderId}', order.order_id)
            .replace('{type}', order.type)
            .replace('{symbol}', order.symbol)
            .replace('{quantity}', order.quantity)
            .replace('{price}', order.price.toFixed(2))
        ).join('\n');

        await sendBilingualMessage(
          ctx,
          translations.messages.pendingOrders.en + '\n' + orderList,
          translations.messages.pendingOrders.zh + '\n' + orderListZh
        );
      }
    } catch (error) {
      await sendBilingualMessage(
        ctx,
        translations.messages.error.en.replace('{error}', error.message),
        translations.messages.error.zh.replace('{error}', error.message)
      );
    }
  });
});

// Cancel command
bot.command('cancel', async (ctx) => {
  const telegramId = ctx.from.id;
  const args = ctx.message.text.split(' ');
  if (args.length !== 2) {
    await sendBilingualMessage(
      ctx,
      translations.commands.cancel.en + '\n' + translations.commands.cancel.zh,
      translations.commands.cancel.en + '\n' + translations.commands.cancel.zh
    );
    return;
  }

  const orderId = args[1];
  startPinVerification(ctx, async (pin) => {
    try {
      const order = await tradingService.cancelOrder(telegramId, orderId, pin);
      await sendBilingualMessage(
        ctx,
        translations.messages.orderCancelled.en
          .replace('{type}', order.type)
          .replace('{symbol}', order.symbol)
          .replace('{quantity}', order.quantity)
          .replace('{price}', order.limitPrice.toFixed(2)),
        translations.messages.orderCancelled.zh
          .replace('{type}', order.type)
          .replace('{symbol}', order.symbol)
          .replace('{quantity}', order.quantity)
          .replace('{price}', order.limitPrice.toFixed(2))
      );
    } catch (error) {
      await sendBilingualMessage(
        ctx,
        translations.messages.error.en.replace('{error}', error.message),
        translations.messages.error.zh.replace('{error}', error.message)
      );
    }
  });
});

// Market status command
bot.command('market', async (ctx) => {
  const telegramId = ctx.from.id;
  startPinVerification(ctx, async (pin) => {
    try {
      const isOpen = await tradingService.isMarketOpen(telegramId, pin);
      const now = new Date();
      const etTime = new Date(now.getTime() + (tradingService.isDST(now) ? -4 : -5) * 60 * 60 * 1000);
      const timeString = etTime.toLocaleTimeString('en-US', { timeZone: 'America/New_York' });
      
      await sendBilingualMessage(
        ctx,
        translations.messages.marketStatus.en(isOpen, timeString),
        translations.messages.marketStatus.zh(isOpen, timeString)
      );
    } catch (error) {
      await sendBilingualMessage(
        ctx,
        translations.messages.error.en.replace('{error}', error.message),
        translations.messages.error.zh.replace('{error}', error.message)
      );
    }
  });
});

// Demo mode command
bot.command('demo', async (ctx) => {
  const telegramId = ctx.from.id;
  startPinVerification(ctx, async (pin) => {
    try {
      const isDemo = await tradingService.isDemoMode(telegramId, pin);
      await tradingService.setDemoMode(telegramId, !isDemo, pin);
      await sendBilingualMessage(
        ctx,
        !isDemo ? translations.messages.demoMode.en(true) : translations.messages.demoMode.en(false),
        !isDemo ? translations.messages.demoMode.zh(true) : translations.messages.demoMode.zh(false)
      );
    } catch (error) {
      await sendBilingualMessage(
        ctx,
        translations.messages.error.en.replace('{error}', error.message),
        translations.messages.error.zh.replace('{error}', error.message)
      );
    }
  });
});

// PIN verification helper functions
function startPinVerification(ctx, callback) {
  const telegramId = ctx.from.id;
  userStates.set(telegramId, { waitingForPin: true, callback });
  sendBilingualMessage(
    ctx,
    translations.messages.pinRequired.en,
    translations.messages.pinRequired.zh
  );
}

bot.on('text', async (ctx) => {
  const telegramId = ctx.from.id;
  const state = userStates.get(telegramId);
  
  if (state && state.waitingForPin) {
    const pin = ctx.message.text;
    userStates.delete(telegramId);
    await state.callback(pin);
  }
});

// Start the bot
bot.launch();
console.log('Bot started');

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM')); 