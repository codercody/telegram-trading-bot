const yahooFinance = require('yahoo-finance2').default;
const { createClient } = require('@supabase/supabase-js');

class TradingService {
  constructor() {
    this.initialBalance = 30470;
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

  async initializeGlobalAccount() {
    const { data: existingAccount } = await this.supabase
      .from('global_account')
      .select('*')
      .eq('id', 1)
      .single();

    if (!existingAccount) {
      const { error } = await this.supabase
        .from('global_account')
        .insert([
          {
            id: 1,
            demo_balance: 100000,
            live_balance: this.initialBalance,
            demo_mode: true
          }
        ]);

      if (error) throw error;
    }
  }

  async getBalance() {
    await this.initializeGlobalAccount();
    const isDemo = await this.isDemoMode();
    const { data, error } = await this.supabase
      .from('global_account')
      .select(isDemo ? 'demo_balance' : 'live_balance')
      .eq('id', 1)
      .single();

    if (error) throw error;
    return isDemo ? data.demo_balance : data.live_balance;
  }

  async updateBalance(newBalance) {
    await this.initializeGlobalAccount();
    const isDemo = await this.isDemoMode();
    const { error } = await this.supabase
      .from('global_account')
      .update({ [isDemo ? 'demo_balance' : 'live_balance']: newBalance })
      .eq('id', 1);

    if (error) throw error;
  }

  async getPositions() {
    try {
      const { data: positions, error } = await this.supabase
        .from('positions')
        .select('*')
        .eq('demo_mode', this.demoMode);

      if (error) throw error;
      return positions || [];
    } catch (error) {
      console.error('Error getting positions:', error);
      throw error;
    }
  }

  async getPendingOrders() {
    await this.initializeGlobalAccount();
    const isDemo = await this.isDemoMode();
    const { data, error } = await this.supabase
      .from('pending_orders')
      .select('*')
      .eq('demo_mode', isDemo)
      .eq('is_global', true);

    if (error) throw error;
    return data;
  }

  async placeBuyOrder(symbol, quantity, orderType, limitPrice) {
    await this.initializeGlobalAccount();
    const isDemo = await this.isDemoMode();
    
    if (orderType === 'MARKET') {
      // Check market hours only for market orders in live mode
      if (!isDemo && !this.isMarketOpen()) {
        throw new Error('Market is currently closed. Trading hours are 9:30 AM - 4:00 PM ET, Monday-Friday.');
      }
      
      const currentPrice = await this.getCurrentPrice(symbol);
      const totalCost = currentPrice * quantity;
      
      // Check if account has enough balance
      const balance = await this.getBalance();
      if (balance < totalCost) {
        throw new Error('Insufficient funds');
      }

      // Update account balance
      await this.updateBalance(balance - totalCost);

      // Update or create position
      const { data: existingPosition } = await this.supabase
        .from('positions')
        .select('*')
        .eq('symbol', symbol)
        .eq('demo_mode', isDemo)
        .eq('is_global', true)
        .single();

      if (existingPosition) {
        const newQuantity = existingPosition.quantity + quantity;
        const newAvgPrice = ((existingPosition.avg_price * existingPosition.quantity) + (currentPrice * quantity)) / newQuantity;
        
        const { error: positionError } = await this.supabase
          .from('positions')
          .update({ quantity: newQuantity, avg_price: newAvgPrice })
          .eq('id', existingPosition.id);

        if (positionError) throw positionError;
      } else {
        const { error: positionError } = await this.supabase
          .from('positions')
          .insert([{
            symbol,
            quantity,
            avg_price: currentPrice,
            demo_mode: isDemo,
            is_global: true
          }]);

        if (positionError) throw positionError;
      }

      // Record order in history
      const { error: historyError } = await this.supabase
        .from('order_history')
        .insert([{
          symbol,
          quantity,
          price: currentPrice,
          type: 'BUY',
          order_type: 'MARKET',
          demo_mode: isDemo,
          is_global: true
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
          symbol,
          quantity,
          limit_price: limitPrice,
          type: 'BUY',
          demo_mode: isDemo,
          is_global: true
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

  async placeSellOrder(symbol, quantity, orderType, limitPrice) {
    await this.initializeGlobalAccount();
    const isDemo = await this.isDemoMode();
    
    if (orderType === 'MARKET') {
      // Check market hours only for market orders in live mode
      if (!isDemo && !this.isMarketOpen()) {
        throw new Error('Market is currently closed. Trading hours are 9:30 AM - 4:00 PM ET, Monday-Friday.');
      }
      
      const currentPrice = await this.getCurrentPrice(symbol);
      
      // Check if account has enough shares
      const { data: position } = await this.supabase
        .from('positions')
        .select('*')
        .eq('symbol', symbol)
        .eq('demo_mode', isDemo)
        .eq('is_global', true)
        .single();

      if (!position || position.quantity < quantity) {
        throw new Error('Insufficient shares');
      }

      // Update position
      if (position.quantity === quantity) {
        const { error: deleteError } = await this.supabase
          .from('positions')
          .delete()
          .eq('id', position.id);

        if (deleteError) throw deleteError;
      } else {
        const { error: updateError } = await this.supabase
          .from('positions')
          .update({ quantity: position.quantity - quantity })
          .eq('id', position.id);

        if (updateError) throw updateError;
      }

      // Update account balance
      const balance = await this.getBalance();
      await this.updateBalance(balance + (currentPrice * quantity));

      // Record order in history
      const { error: historyError } = await this.supabase
        .from('order_history')
        .insert([{
          symbol,
          quantity,
          price: currentPrice,
          type: 'SELL',
          order_type: 'MARKET',
          demo_mode: isDemo,
          is_global: true
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
          symbol,
          quantity,
          limit_price: limitPrice,
          type: 'SELL',
          demo_mode: isDemo,
          is_global: true
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

  async cancelOrder(orderId) {
    await this.initializeGlobalAccount();
    const isDemo = await this.isDemoMode();
    
    const { data: order, error: orderError } = await this.supabase
      .from('pending_orders')
      .select('*')
      .eq('id', orderId)
      .eq('demo_mode', isDemo)
      .eq('is_global', true)
      .single();

    if (orderError) throw orderError;
    if (!order) throw new Error('Order not found');

    const { error: deleteError } = await this.supabase
      .from('pending_orders')
      .delete()
      .eq('id', orderId);

    if (deleteError) throw deleteError;

    return {
      type: order.type,
      symbol: order.symbol,
      quantity: order.quantity,
      limitPrice: order.limit_price
    };
  }

  async isDemoMode() {
    await this.initializeGlobalAccount();
    const { data, error } = await this.supabase
      .from('global_account')
      .select('demo_mode')
      .eq('id', 1)
      .single();

    if (error) throw error;
    return data.demo_mode;
  }

  async setDemoMode(enabled) {
    await this.initializeGlobalAccount();
    const { error } = await this.supabase
      .from('global_account')
      .update({ demo_mode: enabled })
      .eq('id', 1);

    if (error) throw error;
  }

  async getCurrentPrice(symbol) {
    const isDemo = await this.isDemoMode();
    if (isDemo) {
      return this.getDemoPrice(symbol);
    }

    // Check if we have a cached price that's still valid
    const now = Date.now();
    const lastUpdate = this.lastPrices.get(symbol) || 0;
    
    if (this.lastPrices.has(symbol) && (now - lastUpdate) < this.PRICE_CACHE_DURATION) {
      return this.lastPrices.get(symbol);
    }

    // Try up to 3 times with exponential backoff
    for (let attempt = 1; attempt <= 3; attempt++) {
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
        console.error(`Attempt ${attempt} failed to fetch price for ${symbol}:`, error);
        
        // If this is the last attempt, throw the error
        if (attempt === 3) {
          throw new Error(`Failed to fetch price for ${symbol} after 3 attempts. Please try again later.`);
        }
        
        // Wait before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
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