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
export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
            const helpEnMessage = `Available commands:
/start - Start the bot
/help - Show this help message
/balance - Check your account balance
/positions - View your current positions
/orders - View your pending orders
/buy <symbol> <quantity> - Place a buy order
/sell <symbol> <quantity> - Place a sell order
/cancel <orderId> - Cancel a pending order
/demo - Switch to demo mode
/live - Switch to live mode
/mode - Check current mode`;

            const helpZhMessage = `可用命令：
/start - 启动机器人
/help - 显示帮助信息
/balance - 查看账户余额
/positions - 查看当前持仓
/orders - 查看待处理订单
/buy <股票代码> <数量> - 下买单
/sell <股票代码> <数量> - 下卖单
/cancel <订单ID> - 取消待处理订单
/demo - 切换到模拟模式
/live - 切换到实盘模式
/mode - 查看当前模式`;

            await sendBilingualMessage(chatId, helpEnMessage, helpZhMessage);
            break;
            
          case '/balance':
            const balance = await tradingService.getBalance();
            const balanceEnMessage = `Your current balance: $${balance.toFixed(2)}`;
            const balanceZhMessage = `当前余额：$${balance.toFixed(2)}`;
            await sendBilingualMessage(chatId, balanceEnMessage, balanceZhMessage);
            break;
            
          case '/positions':
            const positions = await tradingService.getPositions();
            if (positions.length === 0) {
              const noPositionsEnMessage = 'You have no open positions.';
              const noPositionsZhMessage = '您当前没有持仓。';
              await sendBilingualMessage(chatId, noPositionsEnMessage, noPositionsZhMessage);
            } else {
              let positionsEnMessage = 'Your current positions:\n';
              let positionsZhMessage = '当前持仓：\n';
              
              for (const position of positions) {
                const currentPrice = await tradingService.getCurrentPrice(position.symbol);
                
                positionsEnMessage += `${position.symbol}: ${position.quantity} shares @ $${position.avg_price.toFixed(2)} (Current: $${currentPrice.toFixed(2)})\n`;
                positionsZhMessage += `${position.symbol}: ${position.quantity} 股 @ $${position.avg_price.toFixed(2)} (当前: $${currentPrice.toFixed(2)})\n`;
              }
              
              await sendBilingualMessage(chatId, positionsEnMessage, positionsZhMessage);
            }
            break;
            
          case '/orders':
            const orders = await tradingService.getPendingOrders();
            if (orders.length === 0) {
              const noOrdersEnMessage = 'You have no pending orders.';
              const noOrdersZhMessage = '您没有待处理订单。';
              await sendBilingualMessage(chatId, noOrdersEnMessage, noOrdersZhMessage);
            } else {
              let ordersEnMessage = 'Your pending orders:\n';
              let ordersZhMessage = '待处理订单：\n';
              
              for (const order of orders) {
                ordersEnMessage += `${order.symbol}: ${order.quantity} shares @ $${order.limit_price.toFixed(2)}\n`;
                ordersZhMessage += `${order.symbol}: ${order.quantity} 股 @ $${order.limit_price.toFixed(2)}\n`;
              }
              
              await sendBilingualMessage(chatId, ordersEnMessage, ordersZhMessage);
            }
            break;
            
          case '/buy':
            if (args.length !== 2) {
              const buyUsageEnMessage = 'Usage: /buy <symbol> <quantity>';
              const buyUsageZhMessage = '用法：/buy <股票代码> <数量>';
              await sendBilingualMessage(chatId, buyUsageEnMessage, buyUsageZhMessage);
            } else {
              const [buySymbol, buyQuantity] = args;
              const buyResult = await tradingService.placeBuyOrder(buySymbol, parseInt(buyQuantity));
              const buyEnMessage = `Buy order executed: ${buyQuantity} shares of ${buySymbol} at $${buyResult.price.toFixed(2)}`;
              const buyZhMessage = `买单已执行：${buyQuantity} 股 ${buySymbol} @ $${buyResult.price.toFixed(2)}`;
              await sendBilingualMessage(chatId, buyEnMessage, buyZhMessage);
            }
            break;
            
          case '/sell':
            if (args.length !== 2) {
              const sellUsageEnMessage = 'Usage: /sell <symbol> <quantity>';
              const sellUsageZhMessage = '用法：/sell <股票代码> <数量>';
              await sendBilingualMessage(chatId, sellUsageEnMessage, sellUsageZhMessage);
            } else {
              const [sellSymbol, sellQuantity] = args;
              const sellResult = await tradingService.placeSellOrder(sellSymbol, parseInt(sellQuantity));
              const sellEnMessage = `Sell order executed: ${sellQuantity} shares of ${sellSymbol} at $${sellResult.price.toFixed(2)}`;
              const sellZhMessage = `卖单已执行：${sellQuantity} 股 ${sellSymbol} @ $${sellResult.price.toFixed(2)}`;
              await sendBilingualMessage(chatId, sellEnMessage, sellZhMessage);
            }
            break;
            
          case '/cancel':
            if (args.length !== 1) {
              const cancelUsageEnMessage = 'Usage: /cancel <orderId>';
              const cancelUsageZhMessage = '用法：/cancel <订单ID>';
              await sendBilingualMessage(chatId, cancelUsageEnMessage, cancelUsageZhMessage);
            } else {
              const orderId = args[0];
              await tradingService.cancelOrder(orderId);
              const cancelEnMessage = `Order ${orderId} cancelled successfully`;
              const cancelZhMessage = `订单 ${orderId} 已成功取消`;
              await sendBilingualMessage(chatId, cancelEnMessage, cancelZhMessage);
            }
            break;
            
          case '/demo':
            await tradingService.setDemoMode(true);
            const demoEnMessage = 'Switched to demo mode';
            const demoZhMessage = '已切换到模拟模式';
            await sendBilingualMessage(chatId, demoEnMessage, demoZhMessage);
            break;
            
          case '/live':
            await tradingService.setDemoMode(false);
            const liveEnMessage = 'Switched to live mode';
            const liveZhMessage = '已切换到实盘模式';
            await sendBilingualMessage(chatId, liveEnMessage, liveZhMessage);
            break;
            
          case '/mode':
            const isDemo = await tradingService.isDemoMode();
            const modeEnMessage = `Current mode: ${isDemo ? 'Demo' : 'Live'}`;
            const modeZhMessage = `当前模式：${isDemo ? '模拟' : '实盘'}`;
            await sendBilingualMessage(chatId, modeEnMessage, modeZhMessage);
            break;
            
          default:
            const unknownEnMessage = 'Unknown command. Use /help to see available commands.';
            const unknownZhMessage = '未知命令。使用 /help 查看可用命令。';
            await sendBilingualMessage(chatId, unknownEnMessage, unknownZhMessage);
        }
      }
    }
    
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Error handling webhook:', error);
    res.status(500).json({ error: error.message });
  }
} 