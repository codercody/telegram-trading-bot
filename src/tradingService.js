const yahooFinance = require('yahoo-finance2').default;

class TradingService {
  constructor() {
    this.initialBalance = 100000; // Starting with $100,000
    this.balance = this.initialBalance;
    this.positions = new Map(); // symbol -> { quantity, avgPrice }
    this.orderHistory = [];
    this.priceCache = new Map(); // Cache for storing prices
    this.lastPriceUpdate = new Map(); // Track when prices were last updated
    this.PRICE_CACHE_DURATION = 60000; // Cache prices for 1 minute
    this.pendingOrders = new Map(); // Store pending limit orders
    this.demoMode = false; // Demo mode flag
    this.demoPrices = new Map(); // Store demo prices for each symbol
    this.PIN = '0720'; // Security PIN
  }

  verifyPin(pin) {
    return pin === this.PIN;
  }

  setDemoMode(enabled, pin) {
    if (!this.verifyPin(pin)) {
      throw new Error('Invalid PIN');
    }
    this.demoMode = enabled;
    if (enabled) {
      // Initialize demo prices for existing positions
      for (const [symbol] of this.positions) {
        if (!this.demoPrices.has(symbol)) {
          this.demoPrices.set(symbol, 100); // Start with $100 for new symbols
        }
      }
    }
  }

  isDemoMode(pin) {
    if (!this.verifyPin(pin)) {
      throw new Error('Invalid PIN');
    }
    return this.demoMode;
  }

  getBalance(pin) {
    if (!this.verifyPin(pin)) {
      throw new Error('Invalid PIN');
    }
    return this.balance;
  }

  getPositions(pin) {
    if (!this.verifyPin(pin)) {
      throw new Error('Invalid PIN');
    }
    return Array.from(this.positions.entries()).map(([symbol, position]) => ({
      symbol,
      ...position
    }));
  }

  async getPnL(pin) {
    if (!this.verifyPin(pin)) {
      throw new Error('Invalid PIN');
    }

    let totalPnL = 0;
    
    // Calculate unrealized P&L from current positions
    for (const [symbol, position] of this.positions.entries()) {
      const currentPrice = await this.getRealPrice(symbol);
      const positionValue = position.quantity * currentPrice;
      const costBasis = position.quantity * position.avgPrice;
      totalPnL += positionValue - costBasis;
    }

    return totalPnL;
  }

  isMarketOpen(pin) {
    if (!this.verifyPin(pin)) {
      throw new Error('Invalid PIN');
    }

    const now = new Date();
    const day = now.getDay();
    const hour = now.getHours();
    const minute = now.getMinutes();

    // Check if it's a weekday (Monday = 1, Friday = 5)
    if (day === 0 || day === 6) {
      return false;
    }

    // Convert to Eastern Time (UTC-4/UTC-5)
    const isDST = this.isDST(now);
    const etHour = isDST ? hour - 4 : hour - 5;
    
    // Market hours: 9:30 AM - 4:00 PM ET
    if (etHour < 9 || (etHour === 9 && minute < 30) || etHour >= 16) {
      return false;
    }

    return true;
  }

  isDST(date) {
    const year = date.getFullYear();
    const firstSunday = new Date(year, 2, 1);
    const lastSunday = new Date(year, 10, 1);
    
    // Find the second Sunday in March
    while (firstSunday.getDay() !== 0) {
      firstSunday.setDate(firstSunday.getDate() + 1);
    }
    firstSunday.setDate(firstSunday.getDate() + 7);
    
    // Find the first Sunday in November
    while (lastSunday.getDay() !== 0) {
      lastSunday.setDate(lastSunday.getDate() + 1);
    }
    
    return date >= firstSunday && date < lastSunday;
  }

  async placeBuyOrder(symbol, quantity, orderType = 'MARKET', limitPrice = null, pin) {
    if (!this.verifyPin(pin)) {
      throw new Error('Invalid PIN');
    }

    if (quantity <= 0) {
      throw new Error('Quantity must be positive');
    }

    if (orderType === 'LIMIT' && !limitPrice) {
      throw new Error('Limit price is required for limit orders');
    }

    if (orderType === 'LIMIT' && limitPrice <= 0) {
      throw new Error('Limit price must be positive');
    }

    const currentPrice = await this.getRealPrice(symbol);
    const totalCost = currentPrice * quantity;

    if (orderType === 'MARKET' && totalCost > this.balance) {
      throw new Error('Insufficient funds');
    }

    if (orderType === 'MARKET' && !this.isMarketOpen(pin)) {
      throw new Error('Market orders are only accepted during market hours (9:30 AM - 4:00 PM ET)');
    }

    if (orderType === 'LIMIT') {
      // Store limit order
      const orderId = Date.now().toString();
      this.pendingOrders.set(orderId, {
        type: 'BUY',
        symbol,
        quantity,
        limitPrice,
        timestamp: new Date()
      });

      return {
        orderId,
        orderType: 'LIMIT',
        message: `Limit buy order placed for ${quantity} shares of ${symbol} at $${limitPrice.toFixed(2)}`
      };
    } else {
      // Execute market order
      // Update position
      const currentPosition = this.positions.get(symbol) || { quantity: 0, avgPrice: 0 };
      const newQuantity = currentPosition.quantity + quantity;
      const newAvgPrice = ((currentPosition.quantity * currentPosition.avgPrice) + (quantity * currentPrice)) / newQuantity;

      this.positions.set(symbol, {
        quantity: newQuantity,
        avgPrice: newAvgPrice
      });

      // Update balance
      this.balance -= totalCost;

      // Record order
      this.orderHistory.push({
        type: 'BUY',
        symbol,
        quantity,
        price: currentPrice,
        orderType: 'MARKET',
        timestamp: new Date()
      });

      return { price: currentPrice, orderType: 'MARKET' };
    }
  }

  async placeSellOrder(symbol, quantity, orderType = 'MARKET', limitPrice = null, pin) {
    if (!this.verifyPin(pin)) {
      throw new Error('Invalid PIN');
    }

    if (quantity <= 0) {
      throw new Error('Quantity must be positive');
    }

    if (orderType === 'LIMIT' && !limitPrice) {
      throw new Error('Limit price is required for limit orders');
    }

    if (orderType === 'LIMIT' && limitPrice <= 0) {
      throw new Error('Limit price must be positive');
    }

    const position = this.positions.get(symbol);
    if (!position || position.quantity < quantity) {
      throw new Error('Insufficient shares');
    }

    if (orderType === 'MARKET' && !this.isMarketOpen(pin)) {
      throw new Error('Market orders are only accepted during market hours (9:30 AM - 4:00 PM ET)');
    }

    const currentPrice = await this.getRealPrice(symbol);

    if (orderType === 'LIMIT') {
      // Store limit order
      const orderId = Date.now().toString();
      this.pendingOrders.set(orderId, {
        type: 'SELL',
        symbol,
        quantity,
        limitPrice,
        timestamp: new Date()
      });

      return {
        orderId,
        orderType: 'LIMIT',
        message: `Limit sell order placed for ${quantity} shares of ${symbol} at $${limitPrice.toFixed(2)}`
      };
    } else {
      // Execute market order
      const totalProceeds = currentPrice * quantity;

      // Update position
      if (position.quantity === quantity) {
        this.positions.delete(symbol);
      } else {
        position.quantity -= quantity;
      }

      // Update balance
      this.balance += totalProceeds;

      // Record order
      this.orderHistory.push({
        type: 'SELL',
        symbol,
        quantity,
        price: currentPrice,
        orderType: 'MARKET',
        timestamp: new Date()
      });

      return { price: currentPrice, orderType: 'MARKET' };
    }
  }

  async checkLimitOrders() {
    for (const [orderId, order] of this.pendingOrders.entries()) {
      const currentPrice = await this.getRealPrice(order.symbol);
      
      if (order.type === 'BUY' && currentPrice <= order.limitPrice) {
        await this.executeLimitOrder(orderId, order);
      } else if (order.type === 'SELL' && currentPrice >= order.limitPrice) {
        await this.executeLimitOrder(orderId, order);
      }
    }
  }

  async executeLimitOrder(orderId, order) {
    if (order.type === 'BUY') {
      const currentPrice = await this.getRealPrice(order.symbol);
      const totalCost = currentPrice * order.quantity;

      if (totalCost > this.balance) {
        return; // Skip if insufficient funds
      }

      // Update position
      const currentPosition = this.positions.get(order.symbol) || { quantity: 0, avgPrice: 0 };
      const newQuantity = currentPosition.quantity + order.quantity;
      const newAvgPrice = ((currentPosition.quantity * currentPosition.avgPrice) + (order.quantity * currentPrice)) / newQuantity;

      this.positions.set(order.symbol, {
        quantity: newQuantity,
        avgPrice: newAvgPrice
      });

      // Update balance
      this.balance -= totalCost;
    } else {
      const currentPrice = await this.getRealPrice(order.symbol);
      const totalProceeds = currentPrice * order.quantity;

      // Update position
      const position = this.positions.get(order.symbol);
      if (position.quantity === order.quantity) {
        this.positions.delete(order.symbol);
      } else {
        position.quantity -= order.quantity;
      }

      // Update balance
      this.balance += totalProceeds;
    }

    // Record order
    this.orderHistory.push({
      type: order.type,
      symbol: order.symbol,
      quantity: order.quantity,
      price: order.limitPrice,
      orderType: 'LIMIT',
      timestamp: new Date()
    });

    // Remove the executed order
    this.pendingOrders.delete(orderId);
  }

  cancelOrder(orderId, pin) {
    if (!this.verifyPin(pin)) {
      throw new Error('Invalid PIN');
    }

    if (!this.pendingOrders.has(orderId)) {
      throw new Error('Order not found');
    }

    const order = this.pendingOrders.get(orderId);
    this.pendingOrders.delete(orderId);

    return {
      type: order.type,
      symbol: order.symbol,
      quantity: order.quantity,
      limitPrice: order.limitPrice
    };
  }

  getPendingOrders() {
    return Array.from(this.pendingOrders.entries()).map(([orderId, order]) => ({
      orderId,
      ...order
    }));
  }

  async getRealPrice(symbol) {
    if (this.demoMode) {
      return this.getDemoPrice(symbol);
    }

    // Check if we have a cached price that's still valid
    const now = Date.now();
    const lastUpdate = this.lastPriceUpdate.get(symbol) || 0;
    
    if (this.priceCache.has(symbol) && (now - lastUpdate) < this.PRICE_CACHE_DURATION) {
      return this.priceCache.get(symbol);
    }

    try {
      // Fetch real-time price from Yahoo Finance
      const result = await yahooFinance.quote(symbol);
      const price = result.regularMarketPrice;

      if (!price) {
        throw new Error(`Unable to fetch price for ${symbol}`);
      }

      // Update cache
      this.priceCache.set(symbol, price);
      this.lastPriceUpdate.set(symbol, now);

      return price;
    } catch (error) {
      console.error(`Error fetching price for ${symbol}:`, error);
      throw new Error(`Failed to fetch price for ${symbol}. Please try again later.`);
    }
  }

  getDemoPrice(symbol) {
    if (!this.demoPrices.has(symbol)) {
      this.demoPrices.set(symbol, 100); // Initialize new symbols at $100
    }

    const currentPrice = this.demoPrices.get(symbol);
    const volatility = 0.1; // 10% volatility
    const randomFactor = 1 + (Math.random() * 2 - 1) * volatility;
    const newPrice = currentPrice * randomFactor;

    // Update the demo price
    this.demoPrices.set(symbol, newPrice);

    return newPrice;
  }
}

module.exports = { TradingService }; 