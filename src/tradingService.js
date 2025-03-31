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
            balance: this.initialBalance,
            demo_mode: true
          }
        ]);

      if (error) throw error;
    }
  }

  async getBalance(userId) {
    await this.initializeUser(userId);
    const { data, error } = await this.supabase
      .from('users')
      .select('balance')
      .eq('user_id', userId)
      .single();

    if (error) throw error;
    return data.balance;
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
    
    if (orderType === 'MARKET') {
      const currentPrice = await this.getCurrentPrice(symbol);
      const totalCost = currentPrice * quantity;
      
      // Check if user has enough balance
      const balance = await this.getBalance(userId);
      if (balance < totalCost) {
        throw new Error('Insufficient funds');
      }

      // Update user's balance
      const { error: balanceError } = await this.supabase
        .from('users')
        .update({ balance: balance - totalCost })
        .eq('user_id', userId);

      if (balanceError) throw balanceError;

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
    
    if (orderType === 'MARKET') {
      const currentPrice = await this.getCurrentPrice(symbol);
      
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
      const { error: balanceError } = await this.supabase
        .from('users')
        .update({ balance: balance + (currentPrice * quantity) })
        .eq('user_id', userId);

      if (balanceError) throw balanceError;

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
      const currentPrice = await this.getCurrentPrice(position.symbol);
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

  async getCurrentPrice(symbol) {
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
    const hour = now.getHours();
    const minute = now.getMinutes();

    // Market is open Monday-Friday, 9:30 AM - 4:00 PM ET
    if (day === 0 || day === 6) return false;
    if (hour < 9 || (hour === 9 && minute < 30) || hour >= 16) return false;

    return true;
  }

  isDST(date) {
    const year = date.getFullYear();
    const firstSunday = new Date(year, 2, 1);
    const lastSunday = new Date(year, 10, 1);
    return date >= firstSunday && date < lastSunday;
  }
}

module.exports = { TradingService }; 