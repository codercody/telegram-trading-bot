const { TradingService } = require('../src/tradingService');

// Initialize trading service
const tradingService = new TradingService();

// Helper function to send bilingual messages
async function sendBilingualMessage(chatId, enMessage, zhMessage) {
  try {
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: `${enMessage}\n\n${zhMessage}`,
        parse_mode: 'HTML',
      }),
    });
  } catch (error) {
    console.error('Error sending message:', error);
  }
}

// Helper function to delete a message
async function deleteMessage(chatId, messageId) {
  try {
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/deleteMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
      }),
    });
  } catch (error) {
    console.error('Error deleting message:', error);
  }
}

// Handle incoming webhook requests
module.exports = async (req, res) => {
  try {
    const update = req.body;
    
    // Handle callback queries (button clicks)
    if (update.callback_query) {
      const callbackQuery = update.callback_query;
      const chatId = callbackQuery.message.chat.id;
      const data = callbackQuery.data;
      
      // Handle demo mode toggle
      if (data === 'toggle_demo') {
        const isDemo = await tradingService.isDemoMode();
        await tradingService.setDemoMode(!isDemo);
        
        const newMode = !isDemo ? 'Demo' : 'Live';
        await sendBilingualMessage(
          chatId,
          `Mode switched to ${newMode} mode.`,
          `模式已切换为${newMode}模式。`
        );
      }
      
      // Handle order cancellation
      if (data.startsWith('cancel_')) {
        const orderId = data.split('_')[1];
        const result = await tradingService.cancelOrder(orderId);
        
        await sendBilingualMessage(
          chatId,
          `Order cancelled: ${result.type} ${result.quantity} shares of ${result.symbol} at $${result.limitPrice.toFixed(2)}`,
          `订单已取消: ${result.type} ${result.quantity} 股 ${result.symbol}，价格 $${result.limitPrice.toFixed(2)}`
        );
      }
      
      return res.status(200).json({ ok: true });
    }
    
    // Handle text messages
    if (update.message && update.message.text) {
      const chatId = update.message.chat.id;
      const text = update.message.text;
      
      // Handle commands
      if (text.startsWith('/')) {
        const [command, ...args] = text.split(' ');
        
        switch (command) {
          case '/start':
            const welcomeEnMessage = 'Welcome to the Trading Bot! Use /help to see available commands.';
            const welcomeZhMessage = '欢迎使用交易机器人！使用 /help 查看可用命令。';
            await sendBilingualMessage(chatId, welcomeEnMessage, welcomeZhMessage);
            break;
            
          case '/help':
            const helpEnMessage = `
Available commands:
/balance - Check your balance
/positions - View your positions
/demo - Toggle demo mode
/mode - Check current mode
/market - Check if market is open
/buy SYMBOL QUANTITY [PRICE] - Place a buy order
/sell SYMBOL QUANTITY [PRICE] - Place a sell order
/orders - View pending orders
/cancel ORDER_ID - Cancel an order
            `;
            const helpZhMessage = `
可用命令:
/balance - 查看余额
/positions - 查看持仓
/demo - 切换演示模式
/mode - 检查当前模式
/market - 检查市场是否开放
/buy 股票代码 数量 [价格] - 下买单
/sell 股票代码 数量 [价格] - 下卖单
/orders - 查看待处理订单
/cancel 订单ID - 取消订单
            `;
            await sendBilingualMessage(chatId, helpEnMessage, helpZhMessage);
            break;
            
          case '/balance':
            const balance = await tradingService.getBalance();
            const isDemo = await tradingService.isDemoMode();
            const mode = isDemo ? 'Demo' : 'Live';
            await sendBilingualMessage(
              chatId,
              `${mode} Balance: $${balance.toFixed(2)}`,
              `${mode} 余额: $${balance.toFixed(2)}`
            );
            break;
            
          case '/positions':
            const positions = await tradingService.getPositions();
            if (positions.length === 0) {
              await sendBilingualMessage(
                chatId,
                'You have no open positions.',
                '您没有持仓。'
              );
            } else {
              let positionsEnMessage = 'Your positions:\n';
              let positionsZhMessage = '您的持仓:\n';
              
              for (const position of positions) {
                const currentPrice = await tradingService.getCurrentPrice(position.symbol);
                
                positionsEnMessage += `${position.symbol}: ${position.quantity} shares @ $${position.avg_price.toFixed(2)} (Current: $${currentPrice.toFixed(2)})\n`;
                positionsZhMessage += `${position.symbol}: ${position.quantity} 股 @ $${position.avg_price.toFixed(2)} (当前: $${currentPrice.toFixed(2)})\n`;
              }
              
              await sendBilingualMessage(chatId, positionsEnMessage, positionsZhMessage);
            }
            break;
            
          case '/demo':
            const currentDemoMode = await tradingService.isDemoMode();
            await tradingService.setDemoMode(!currentDemoMode);
            const newMode = !currentDemoMode ? 'Demo' : 'Live';
            await sendBilingualMessage(
              chatId,
              `Mode switched to ${newMode} mode.`,
              `模式已切换为${newMode}模式。`
            );
            break;
            
          case '/mode':
            const currentMode = await tradingService.isDemoMode();
            const modeText = currentMode ? 'Demo' : 'Live';
            await sendBilingualMessage(
              chatId,
              `Current mode: ${modeText}`,
              `当前模式: ${modeText}`
            );
            break;
            
          case '/market':
            const isOpen = tradingService.isMarketOpen();
            const marketStatus = isOpen ? 'open' : 'closed';
            await sendBilingualMessage(
              chatId,
              `Market is currently ${marketStatus}.`,
              `市场当前${isOpen ? '开放' : '关闭'}。`
            );
            break;
            
          case '/buy':
            if (args.length < 2) {
              await sendBilingualMessage(
                chatId,
                'Please specify a symbol and quantity. Example: /buy AAPL 10',
                '请指定股票代码和数量。例如: /buy AAPL 10'
              );
              break;
            }
            
            const buySymbol = args[0].toUpperCase();
            const buyQuantity = parseInt(args[1]);
            const buyLimitPrice = args[2] ? parseFloat(args[2]) : null;
            
            if (isNaN(buyQuantity) || buyQuantity <= 0) {
              await sendBilingualMessage(
                chatId,
                'Please enter a valid quantity.',
                '请输入有效数量。'
              );
              break;
            }
            
            try {
              const buyOrderType = buyLimitPrice ? 'LIMIT' : 'MARKET';
              const buyResult = await tradingService.placeBuyOrder(buySymbol, buyQuantity, buyOrderType, buyLimitPrice);
              
              if (buyOrderType === 'MARKET') {
                await sendBilingualMessage(
                  chatId,
                  `Market buy order executed: ${buyQuantity} shares of ${buySymbol} at $${buyResult.price.toFixed(2)}`,
                  `市价买单已执行: ${buyQuantity} 股 ${buySymbol}，价格 $${buyResult.price.toFixed(2)}`
                );
              } else {
                await sendBilingualMessage(
                  chatId,
                  buyResult.message,
                  buyResult.message.replace('Limit buy order placed for', '限价买单已下:').replace('shares of', '股').replace('at', '价格')
                );
              }
            } catch (error) {
              await sendBilingualMessage(
                chatId,
                `Error: ${error.message}`,
                `错误: ${error.message}`
              );
            }
            break;
            
          case '/sell':
            if (args.length < 2) {
              await sendBilingualMessage(
                chatId,
                'Please specify a symbol and quantity. Example: /sell AAPL 10',
                '请指定股票代码和数量。例如: /sell AAPL 10'
              );
              break;
            }
            
            const sellSymbol = args[0].toUpperCase();
            const sellQuantity = parseInt(args[1]);
            const sellLimitPrice = args[2] ? parseFloat(args[2]) : null;
            
            if (isNaN(sellQuantity) || sellQuantity <= 0) {
              await sendBilingualMessage(
                chatId,
                'Please enter a valid quantity.',
                '请输入有效数量。'
              );
              break;
            }
            
            try {
              const sellOrderType = sellLimitPrice ? 'LIMIT' : 'MARKET';
              const sellResult = await tradingService.placeSellOrder(sellSymbol, sellQuantity, sellOrderType, sellLimitPrice);
              
              if (sellOrderType === 'MARKET') {
                await sendBilingualMessage(
                  chatId,
                  `Market sell order executed: ${sellQuantity} shares of ${sellSymbol} at $${sellResult.price.toFixed(2)}`,
                  `市价卖单已执行: ${sellQuantity} 股 ${sellSymbol}，价格 $${sellResult.price.toFixed(2)}`
                );
              } else {
                await sendBilingualMessage(
                  chatId,
                  sellResult.message,
                  sellResult.message.replace('Limit sell order placed for', '限价卖单已下:').replace('shares of', '股').replace('at', '价格')
                );
              }
            } catch (error) {
              await sendBilingualMessage(
                chatId,
                `Error: ${error.message}`,
                `错误: ${error.message}`
              );
            }
            break;
            
          case '/orders':
            const orders = await tradingService.getPendingOrders();
            if (orders.length === 0) {
              await sendBilingualMessage(
                chatId,
                'You have no pending orders.',
                '您没有待处理订单。'
              );
            } else {
              let ordersEnMessage = 'Your pending orders:\n';
              let ordersZhMessage = '您的待处理订单:\n';
              
              for (const order of orders) {
                const orderType = order.type === 'BUY' ? 'Buy' : 'Sell';
                const orderTypeZh = order.type === 'BUY' ? '买入' : '卖出';
                
                ordersEnMessage += `ID: ${order.id} - ${orderType} ${order.quantity} shares of ${order.symbol} at $${order.limit_price.toFixed(2)}\n`;
                ordersZhMessage += `ID: ${order.id} - ${orderTypeZh} ${order.quantity} 股 ${order.symbol}，价格 $${order.limit_price.toFixed(2)}\n`;
              }
              
              await sendBilingualMessage(chatId, ordersEnMessage, ordersZhMessage);
            }
            break;
            
          case '/cancel':
            if (args.length < 1) {
              await sendBilingualMessage(
                chatId,
                'Please specify an order ID. Example: /cancel 123',
                '请指定订单ID。例如: /cancel 123'
              );
              break;
            }
            
            const orderId = parseInt(args[0]);
            
            if (isNaN(orderId)) {
              await sendBilingualMessage(
                chatId,
                'Please enter a valid order ID.',
                '请输入有效订单ID。'
              );
              break;
            }
            
            try {
              const cancelResult = await tradingService.cancelOrder(orderId);
              await sendBilingualMessage(
                chatId,
                `Order cancelled: ${cancelResult.type} ${cancelResult.quantity} shares of ${cancelResult.symbol} at $${cancelResult.limitPrice.toFixed(2)}`,
                `订单已取消: ${cancelResult.type === 'BUY' ? '买入' : '卖出'} ${cancelResult.quantity} 股 ${cancelResult.symbol}，价格 $${cancelResult.limitPrice.toFixed(2)}`
              );
            } catch (error) {
              await sendBilingualMessage(
                chatId,
                `Error: ${error.message}`,
                `错误: ${error.message}`
              );
            }
            break;
            
          default:
            await sendBilingualMessage(
              chatId,
              'Unknown command. Use /help to see available commands.',
              '未知命令。使用 /help 查看可用命令。'
            );
        }
      }
    }
    
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Error handling webhook:', error);
    res.status(500).json({ error: error.message });
  }
}; 