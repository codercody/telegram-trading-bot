const yahooFinance = require('yahoo-finance2').default;
const { createClient } = require('@supabase/supabase-js');

class TradingService {
  constructor() {
    this.initialBalance = 100000;
    this.demoMode = false;
    this.pendingOrders = new Map();
    this.lastPrices = new Map();
    this.demoPrices = new Map();
    this.PRICE_CACHE_DURATION = 60000; // 1 minute cache
    
    // Initialize Supabase client
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );
  }

  async initializeUser(userId) {
    const { data: existingUser } = await this.supabase
      .from('users')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!existingUser) {
      const { error } = await this.supabase
        .from('users')
        .insert([
          {
            user_id: userId,
            demo_balance: this.initialBalance,
            live_balance: this.initialBalance,
            demo_mode: true
          }
        ]);

      if (error) throw error;
    }
  }

  async getBalance(userId) {
    await this.initializeUser(userId);
    const isDemo = await this.isDemoMode(userId);
    const { data, error } = await this.supabase
      .from('users')
      .select(isDemo ? 'demo_balance' : 'live_balance')
      .eq('user_id', userId)
      .single();

    if (error) throw error;
    return isDemo ? data.demo_balance : data.live_balance;
  }

  async updateBalance(userId, newBalance) {
    await this.initializeUser(userId);
    const isDemo = await this.isDemoMode(userId);
    const { error } = await this.supabase
      .from('users')
      .update({ [isDemo ? 'demo_balance' : 'live_balance']: newBalance })
      .eq('user_id', userId);

    if (error) throw error;
  }

  async getPositions(userId) {
    await this.initializeUser(userId);
    const isDemo = await this.isDemoMode(userId);
    const { data, error } = await this.supabase
      .from('positions')
      .select('*')
      .eq('user_id', userId)
      .eq('demo_mode', isDemo);

    if (error) throw error;
    return data;
  }

  async getPendingOrders(userId) {
    await this.initializeUser(userId);
    const isDemo = await this.isDemoMode(userId);
    const { data, error } = await this.supabase
      .from('pending_orders')
      .select('*')
      .eq('user_id', userId)
      .eq('demo_mode', isDemo);

    if (error) throw error;
    return data;
  }

  async placeBuyOrder(symbol, quantity, orderType, limitPrice, userId) {
    await this.initializeUser(userId);
    const isDemo = await this.isDemoMode(userId);
    
    // Check market hours for live mode
    if (!isDemo && !this.isMarketOpen()) {
      throw new Error('Market is currently closed. Trading hours are 9:30 AM - 4:00 PM ET, Monday-Friday.');
    }
    
    if (orderType === 'MARKET') {
      const currentPrice = await this.getCurrentPrice(symbol, userId);
      const totalCost = currentPrice * quantity;
      
      // Check if user has enough balance
      const balance = await this.getBalance(userId);
      if (balance < totalCost) {
        throw new Error('Insufficient funds');
      }

      // Update user's balance
      await this.updateBalance(userId, balance - totalCost);

      // Update or create position
      const { data: existingPosition } = await this.supabase
        .from('positions')
        .select('*')
        .eq('user_id', userId)
        .eq('symbol', symbol)
        .eq('demo_mode', isDemo)
        .single();

      if (existingPosition) {
        const newQuantity = existingPosition.quantity + quantity;
        const newAvgPrice = ((existingPosition.avg_price * existingPosition.quantity) + (currentPrice * quantity)) / newQuantity;
        
        const { error: positionError } = await this.supabase
          .from('positions')
          .update({ quantity: newQuantity, avg_price: newAvgPrice })
          .eq('user_id', userId)
          .eq('symbol', symbol)
          .eq('demo_mode', isDemo);

        if (positionError) throw positionError;
      } else {
        const { error: positionError } = await this.supabase
          .from('positions')
          .insert([{
            user_id: userId,
            symbol,
            quantity,
            avg_price: currentPrice,
            demo_mode: isDemo
          }]);

        if (positionError) throw positionError;
      }

      // Record order in history
      const { error: historyError } = await this.supabase
        .from('order_history')
        .insert([{
          user_id: userId,
          symbol,
          quantity,
          price: currentPrice,
          type: 'BUY',
          order_type: 'MARKET',
          demo_mode: isDemo
        }]);

      if (historyError) throw historyError;

      return {
        orderType: 'MARKET',
        price: currentPrice
      };
    } else {
      // Handle limit order
      const { data: order, error: orderError } = await this.supabase
        .from('pending_orders')
        .insert([{
          user_id: userId,
          symbol,
          quantity,
          limit_price: limitPrice,
          type: 'BUY',
          demo_mode: isDemo
        }])
        .select()
        .single();

      if (orderError) throw orderError;

      return {
        orderType: 'LIMIT',
        message: `Limit buy order placed for ${quantity} shares of ${symbol} at $${limitPrice.toFixed(2)}`
      };
    }
  }

  async placeSellOrder(symbol, quantity, orderType, limitPrice, userId) {
    await this.initializeUser(userId);
    const isDemo = await this.isDemoMode(userId);
    
    // Check market hours for live mode
    if (!isDemo && !this.isMarketOpen()) {
      throw new Error('Market is currently closed. Trading hours are 9:30 AM - 4:00 PM ET, Monday-Friday.');
    }
    
    if (orderType === 'MARKET') {
      const currentPrice = await this.getCurrentPrice(symbol, userId);
      
      // Check if user has enough shares
      const { data: position } = await this.supabase
        .from('positions')
        .select('*')
        .eq('user_id', userId)
        .eq('symbol', symbol)
        .eq('demo_mode', isDemo)
        .single();

      if (!position || position.quantity < quantity) {
        throw new Error('Insufficient shares');
      }

      // Update position
      if (position.quantity === quantity) {
        const { error: deleteError } = await this.supabase
          .from('positions')
          .delete()
          .eq('user_id', userId)
          .eq('symbol', symbol)
          .eq('demo_mode', isDemo);

        if (deleteError) throw deleteError;
      } else {
        const { error: updateError } = await this.supabase
          .from('positions')
          .update({ quantity: position.quantity - quantity })
          .eq('user_id', userId)
          .eq('symbol', symbol)
          .eq('demo_mode', isDemo);

        if (updateError) throw updateError;
      }

      // Update user's balance
      const balance = await this.getBalance(userId);
      await this.updateBalance(userId, balance + (currentPrice * quantity));

      // Record order in history
      const { error: historyError } = await this.supabase
        .from('order_history')
        .insert([{
          user_id: userId,
          symbol,
          quantity,
          price: currentPrice,
          type: 'SELL',
          order_type: 'MARKET',
          demo_mode: isDemo
        }]);

      if (historyError) throw historyError;

      return {
        orderType: 'MARKET',
        price: currentPrice
      };
    } else {
      // Handle limit order
      const { data: order, error: orderError } = await this.supabase
        .from('pending_orders')
        .insert([{
          user_id: userId,
          symbol,
          quantity,
          limit_price: limitPrice,
          type: 'SELL',
          demo_mode: isDemo
        }])
        .select()
        .single();

      if (orderError) throw orderError;

      return {
        orderType: 'LIMIT',
        message: `Limit sell order placed for ${quantity} shares of ${symbol} at $${limitPrice.toFixed(2)}`
      };
    }
  }

  async cancelOrder(orderId, userId) {
    await this.initializeUser(userId);
    const isDemo = await this.isDemoMode(userId);
    
    const { data: order, error: orderError } = await this.supabase
      .from('pending_orders')
      .select('*')
      .eq('id', orderId)
      .eq('user_id', userId)
      .eq('demo_mode', isDemo)
      .single();

    if (orderError) throw orderError;
    if (!order) throw new Error('Order not found');

    const { error: deleteError } = await this.supabase
      .from('pending_orders')
      .delete()
      .eq('id', orderId)
      .eq('user_id', userId)
      .eq('demo_mode', isDemo);

    if (deleteError) throw deleteError;

    return {
      type: order.type,
      symbol: order.symbol,
      quantity: order.quantity,
      limitPrice: order.limit_price
    };
  }

  async getPnL(userId) {
    await this.initializeUser(userId);
    const isDemo = await this.isDemoMode(userId);
    const { data: positions, error: positionsError } = await this.supabase
      .from('positions')
      .select('*')
      .eq('user_id', userId)
      .eq('demo_mode', isDemo);

    if (positionsError) throw positionsError;

    let totalPnL = 0;
    for (const position of positions) {
      const currentPrice = await this.getCurrentPrice(position.symbol, userId);
      totalPnL += (currentPrice - position.avg_price) * position.quantity;
    }

    return totalPnL;
  }

  async isDemoMode(userId) {
    await this.initializeUser(userId);
    const { data, error } = await this.supabase
      .from('users')
      .select('demo_mode')
      .eq('user_id', userId)
      .single();

    if (error) throw error;
    return data.demo_mode;
  }

  async setDemoMode(enabled, userId) {
    await this.initializeUser(userId);
    const { error } = await this.supabase
      .from('users')
      .update({ demo_mode: enabled })
      .eq('user_id', userId);

    if (error) throw error;
  }

  async getCurrentPrice(symbol, userId) {
    const isDemo = await this.isDemoMode(userId);
    if (isDemo) {
      return this.getDemoPrice(symbol);
    }

    // Check if we have a cached price that's still valid
    const now = Date.now();
    const lastUpdate = this.lastPrices.get(symbol) || 0;
    
    if (this.lastPrices.has(symbol) && (now - lastUpdate) < this.PRICE_CACHE_DURATION) {
      return this.lastPrices.get(symbol);
    }

    try {
      // Fetch real-time price from Yahoo Finance
      const result = await yahooFinance.quote(symbol);
      const price = result.regularMarketPrice;

      if (!price) {
        throw new Error(`Unable to fetch price for ${symbol}`);
      }

      // Update cache
      this.lastPrices.set(symbol, price);

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

  isMarketOpen() {
    const now = new Date();
    const day = now.getDay();
    
    // Check if it's a weekday (Monday = 1, Friday = 5)
    if (day === 0 || day === 6) {
      return false;
    }

    // Convert to Eastern Time (UTC-4/UTC-5)
    const isDST = this.isDST(now);
    const etOffset = isDST ? -4 : -5;
    const etHour = now.getUTCHours() + etOffset;
    const etMinute = now.getUTCMinutes();

    // Market hours: 9:30 AM - 4:00 PM ET
    if (etHour < 9 || (etHour === 9 && etMinute < 30) || etHour >= 16) {
      return false;
    }

    return true;
  }

  isDST(date) {
    const year = date.getUTCFullYear();
    const firstSunday = new Date(Date.UTC(year, 2, 1));
    const lastSunday = new Date(Date.UTC(year, 10, 1));
    
    // Find the second Sunday in March
    while (firstSunday.getUTCDay() !== 0) {
      firstSunday.setUTCDate(firstSunday.getUTCDate() + 1);
    }
    firstSunday.setUTCDate(firstSunday.getUTCDate() + 7);
    
    // Find the first Sunday in November
    while (lastSunday.getUTCDay() !== 0) {
      lastSunday.setUTCDate(lastSunday.getUTCDate() + 1);
    }
    
    return date >= firstSunday && date < lastSunday;
  }
}

module.exports = { TradingService }; 