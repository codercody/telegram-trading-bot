const { TradingService } = require("../src/tradingService");

// Initialize trading service
const tradingService = new TradingService();

// Helper function to escape HTML characters
function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Helper function to send bilingual messages
async function sendBilingualMessage(chatId, enMessage, zhMessage) {
  try {
    await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: `${escapeHtml(enMessage)}\n\n${escapeHtml(zhMessage)}`,
          parse_mode: "HTML",
        }),
      }
    );
  } catch (error) {
    console.error("Error sending message:", error);
  }
}

// Helper function to send error messages
async function sendErrorMessage(chatId, error) {
  const errorMessage = error.message || "An unknown error occurred";
  const errorEnMessage = `Error: ${errorMessage}`;
  const errorZhMessage = `错误：${errorMessage}`;
  await sendBilingualMessage(chatId, errorEnMessage, errorZhMessage);
}

// Handle incoming webhook requests
export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const update = req.body;

    // Silently ignore non-text messages
    if (!update.message || !update.message.text) {
      return res.status(200).json({ ok: true });
    }

    const chatId = update.message.chat.id;
    const text = update.message.text;

    // Check and execute pending orders before processing new command
    try {
      await tradingService.checkAndExecutePendingOrders();
    } catch (error) {
      console.error("Error checking pending orders:", error);
      // Don't throw here, continue with command processing
    }

    // Handle commands
    if (text.startsWith("/")) {
      const [command, ...args] = text.split(" ");

      switch (command) {
        case "/start":
          const welcomeEnMessage =
            "Welcome to the Trading Bot! Use /help to see available commands.";
          const welcomeZhMessage =
            "欢迎使用交易机器人！使用 /help 查看可用命令。";
          await sendBilingualMessage(
            chatId,
            welcomeEnMessage,
            welcomeZhMessage
          );
          break;

        case "/help":
          const helpEnMessage = `Available commands:
/help - Show this help message
/balance - Check your account balance
/positions - View your current positions
/orders - View your pending orders
/buy <symbol> <quantity> [limit_price] - Place a buy order (market or limit)
/sell <symbol> <quantity> [limit_price] - Place a sell order (market or limit)
/cancel <orderId> - Cancel a pending order
/demo - Switch to demo mode
/live - Switch to live mode
/mode - Check current mode`;

          const helpZhMessage = `可用命令：
/help - 显示帮助信息
/balance - 查看账户余额
/positions - 查看当前持仓
/orders - 查看待处理订单
/buy <股票代码> <数量> [限价] - 下买单（市价或限价）
/sell <股票代码> <数量> [限价] - 下卖单（市价或限价）
/cancel <订单ID> - 取消待处理订单
/demo - 切换到模拟模式
/live - 切换到实盘模式
/mode - 查看当前模式`;

          await sendBilingualMessage(chatId, helpEnMessage, helpZhMessage);
          break;

        case "/balance":
          try {
            const balance = await tradingService.getBalance();
            const balanceEnMessage = `Your current balance: $${balance.toFixed(
              2
            )}`;
            const balanceZhMessage = `当前余额：$${balance.toFixed(2)}`;
            await sendBilingualMessage(
              chatId,
              balanceEnMessage,
              balanceZhMessage
            );
          } catch (error) {
            await sendErrorMessage(chatId, error);
          }
          break;

        case "/positions":
          try {
            const positions = await tradingService.getPositions();
            if (positions.length === 0) {
              const noPositionsEnMessage = "You have no open positions.";
              const noPositionsZhMessage = "您当前没有持仓。";
              await sendBilingualMessage(
                chatId,
                noPositionsEnMessage,
                noPositionsZhMessage
              );
            } else {
              let positionsEnMessage = "Your current positions:\n";
              let positionsZhMessage = "当前持仓：\n";

              for (const position of positions) {
                const currentPrice = await tradingService.getCurrentPrice(
                  position.symbol
                );

                positionsEnMessage += `${escapeHtml(position.symbol)}: ${
                  position.quantity
                } shares\n`;
                positionsZhMessage += `${escapeHtml(position.symbol)}: ${
                  position.quantity
                } 股\n`;
              }

              await sendBilingualMessage(
                chatId,
                positionsEnMessage,
                positionsZhMessage
              );
            }
          } catch (error) {
            await sendErrorMessage(chatId, error);
          }
          break;

        case "/orders":
          try {
            const orders = await tradingService.getPendingOrders();
            if (orders.length === 0) {
              const noOrdersEnMessage = "You have no pending orders.";
              const noOrdersZhMessage = "您没有待处理订单。";
              await sendBilingualMessage(
                chatId,
                noOrdersEnMessage,
                noOrdersZhMessage
              );
            } else {
              let ordersEnMessage = "Your pending orders:\n";
              let ordersZhMessage = "待处理订单：\n";

              for (const order of orders) {
                ordersEnMessage += `[${order.id}] ${escapeHtml(
                  order.symbol
                )}: ${order.quantity} shares @ $${order.limit_price.toFixed(
                  2
                )} (${order.type})\n`;
                ordersZhMessage += `[${order.id}] ${escapeHtml(
                  order.symbol
                )}: ${order.quantity} 股 @ $${order.limit_price.toFixed(2)} (${
                  order.type === "BUY" ? "买入" : "卖出"
                })\n`;
              }

              await sendBilingualMessage(
                chatId,
                ordersEnMessage,
                ordersZhMessage
              );
            }
          } catch (error) {
            await sendErrorMessage(chatId, error);
          }
          break;

        case "/buy":
          if (args.length < 2 || args.length > 3) {
            const buyUsageEnMessage = `Usage: /buy <symbol> <quantity> [limit_price]
Examples:
/buy AAPL 10 (Market order to buy 10 shares of AAPL)
/buy AAPL 10 150.50 (Limit order to buy 10 shares of AAPL at $150.50)`;
            const buyUsageZhMessage = `用法：/buy <股票代码> <数量> [限价]
示例：
/buy AAPL 10 (市价买入 10 股 AAPL)
/buy AAPL 10 150.50 (限价 $150.50 买入 10 股 AAPL)`;
            await sendBilingualMessage(
              chatId,
              buyUsageEnMessage,
              buyUsageZhMessage
            );
          } else {
            try {
              const [buySymbol, buyQuantity, limitPrice] = args;

              // Validate quantity is a number
              if (isNaN(buyQuantity)) {
                throw new Error("Quantity must be a number");
              }

              // If limit price is provided, validate it's a number
              if (limitPrice && isNaN(limitPrice)) {
                throw new Error("Limit price must be a number");
              }

              const buyResult = await tradingService.placeBuyOrder(
                buySymbol,
                parseInt(buyQuantity),
                limitPrice ? parseFloat(limitPrice) : null
              );

              if (buyResult.executed) {
                const buyEnMessage = `Buy order executed: ${buyQuantity} shares of ${escapeHtml(
                  buySymbol
                )} at $${buyResult.price.toFixed(2)}`;
                const buyZhMessage = `买单已执行：${buyQuantity} 股 ${escapeHtml(
                  buySymbol
                )}`;
                await sendBilingualMessage(chatId, buyEnMessage, buyZhMessage);
              } else {
                const buyEnMessage = `Limit buy order placed: ${buyQuantity} shares of ${escapeHtml(
                  buySymbol
                )} at $${buyResult.limitPrice.toFixed(2)}`;
                const buyZhMessage = `限价买单已下单：${buyQuantity} 股 ${escapeHtml(
                  buySymbol
                )}`;
                await sendBilingualMessage(chatId, buyEnMessage, buyZhMessage);
              }
            } catch (error) {
              // Send error message
              await sendErrorMessage(chatId, error);

              // Also send usage message
              const buyUsageEnMessage = `Usage: /buy <symbol> <quantity> [limit_price]
Examples:
/buy AAPL 10 (Market order to buy 10 shares of AAPL)
/buy AAPL 10 150.50 (Limit order to buy 10 shares of AAPL at $150.50)`;
              const buyUsageZhMessage = `用法：/buy <股票代码> <数量> [限价]
示例：
/buy AAPL 10 (市价买入 10 股 AAPL)
/buy AAPL 10 150.50 (限价 $150.50 买入 10 股 AAPL)`;
              await sendBilingualMessage(
                chatId,
                buyUsageEnMessage,
                buyUsageZhMessage
              );
            }
          }
          break;

        case "/sell":
          if (args.length < 2 || args.length > 3) {
            const sellUsageEnMessage = `Usage: /sell <symbol> <quantity> [limit_price]
Examples:
/sell AAPL 10 (Market order to sell 10 shares of AAPL)
/sell AAPL 10 160.75 (Limit order to sell 10 shares of AAPL at $160.75)`;
            const sellUsageZhMessage = `用法：/sell <股票代码> <数量> [限价]
示例：
/sell AAPL 10 (市价卖出 10 股 AAPL)
/sell AAPL 10 160.75 (限价 $160.75 卖出 10 股 AAPL)`;
            await sendBilingualMessage(
              chatId,
              sellUsageEnMessage,
              sellUsageZhMessage
            );
          } else {
            try {
              const [sellSymbol, sellQuantity, limitPrice] = args;

              // Validate quantity is a number
              if (isNaN(sellQuantity)) {
                throw new Error("Quantity must be a number");
              }

              // If limit price is provided, validate it's a number
              if (limitPrice && isNaN(limitPrice)) {
                throw new Error("Limit price must be a number");
              }

              const sellResult = await tradingService.placeSellOrder(
                sellSymbol,
                parseInt(sellQuantity),
                limitPrice ? parseFloat(limitPrice) : null
              );

              if (sellResult.executed) {
                const sellEnMessage = `Sell order executed: ${sellQuantity} shares of ${escapeHtml(
                  sellSymbol
                )} at $${sellResult.price.toFixed(2)}`;
                const sellZhMessage = `卖单已执行：${sellQuantity} 股 ${escapeHtml(
                  sellSymbol
                )}`;
                await sendBilingualMessage(
                  chatId,
                  sellEnMessage,
                  sellZhMessage
                );
              } else {
                const sellEnMessage = `Limit sell order placed: ${sellQuantity} shares of ${escapeHtml(
                  sellSymbol
                )} at $${sellResult.limitPrice.toFixed(2)}`;
                const sellZhMessage = `限价卖单已下单：${sellQuantity} 股 ${escapeHtml(
                  sellSymbol
                )}`;
                await sendBilingualMessage(
                  chatId,
                  sellEnMessage,
                  sellZhMessage
                );
              }
            } catch (error) {
              // Send error message
              await sendErrorMessage(chatId, error);

              // Also send usage message
              const sellUsageEnMessage = `Usage: /sell <symbol> <quantity> [limit_price]
Examples:
/sell AAPL 10 (Market order to sell 10 shares of AAPL)
/sell AAPL 10 160.75 (Limit order to sell 10 shares of AAPL at $160.75)`;
              const sellUsageZhMessage = `用法：/sell <股票代码> <数量> [限价]
示例：
/sell AAPL 10 (市价卖出 10 股 AAPL)
/sell AAPL 10 160.75 (限价 $160.75 卖出 10 股 AAPL)`;
              await sendBilingualMessage(
                chatId,
                sellUsageEnMessage,
                sellUsageZhMessage
              );
            }
          }
          break;

        case "/cancel":
          if (args.length !== 1) {
            const cancelUsageEnMessage = "Usage: /cancel <orderId>";
            const cancelUsageZhMessage = "用法：/cancel <订单ID>";
            await sendBilingualMessage(
              chatId,
              cancelUsageEnMessage,
              cancelUsageZhMessage
            );
          } else {
            try {
              const orderId = args[0];
              await tradingService.cancelOrder(orderId);
              const cancelEnMessage = `Order ${escapeHtml(
                orderId
              )} cancelled successfully`;
              const cancelZhMessage = `订单 ${escapeHtml(orderId)} 已成功取消`;
              await sendBilingualMessage(
                chatId,
                cancelEnMessage,
                cancelZhMessage
              );
            } catch (error) {
              await sendErrorMessage(chatId, error);
            }
          }
          break;

        case "/demo":
          try {
            await tradingService.setDemoMode(true);
            const demoEnMessage = "Switched to demo mode";
            const demoZhMessage = "已切换到模拟模式";
            await sendBilingualMessage(chatId, demoEnMessage, demoZhMessage);
          } catch (error) {
            await sendErrorMessage(chatId, error);
          }
          break;

        case "/live":
          try {
            await tradingService.setDemoMode(false);
            const liveEnMessage = "Switched to live mode";
            const liveZhMessage = "已切换到实盘模式";
            await sendBilingualMessage(chatId, liveEnMessage, liveZhMessage);
          } catch (error) {
            await sendErrorMessage(chatId, error);
          }
          break;

        case "/mode":
          try {
            const isDemo = await tradingService.isDemoMode();
            const modeEnMessage = `Current mode: ${isDemo ? "Demo" : "Live"}`;
            const modeZhMessage = `当前模式：${isDemo ? "模拟" : "实盘"}`;
            await sendBilingualMessage(chatId, modeEnMessage, modeZhMessage);
          } catch (error) {
            await sendErrorMessage(chatId, error);
          }
          break;

        default:
          const unknownEnMessage =
            "Unknown command. Use /help to see available commands.";
          const unknownZhMessage = "未知命令。使用 /help 查看可用命令。";
          await sendBilingualMessage(
            chatId,
            unknownEnMessage,
            unknownZhMessage
          );
      }
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Error handling webhook:", error);
    res.status(500).json({ error: error.message });
  }
}
