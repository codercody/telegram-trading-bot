module.exports = {
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