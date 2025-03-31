const yahooFinance = require('yahoo-finance2').default;
const { createClient } = require('@supabase/supabase-js');

class TradingService {
  constructor() {
    this.PIN = '0720';
    this.initialBalance = 100000;
    this.demoMode = false;
    this.pendingOrders = new Map();
    this.lastPrices = new Map();
    
    // Initialize Supabase client
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );
  }

  async initializeUser(userId) {
    // Check if user exists
    const { data: user, error: userError } = await this.supabase
      .from('users')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (userError && userError.code !== 'PGRST116') {
      throw new Error('Error checking user: ' + userError.message);
    }

    if (!user) {
      // Create new user with initial balance
      const { error: insertError } = await this.supabase
        .from('users')
        .insert([
          {
            user_id: userId,
            balance: this.initialBalance,
            demo_mode: false
          }
        ]);

      if (insertError) {
        throw new Error('Error creating user: ' + insertError.message);
      }
    }

    return user || { balance: this.initialBalance, demo_mode: false };
  }

  async getBalance(userId) {
    const { data: user, error } = await this.supabase
      .from('users')
      .select('balance')
      .eq('user_id', userId)
      .single();

    if (error) {
      throw new Error('Error getting balance: ' + error.message);
    }

    return user.balance;
  }

  async getPositions(userId) {
    const { data: positions, error } = await this.supabase
      .from('positions')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      throw new Error('Error getting positions: ' + error.message);
    }

    return positions || [];
  }

  async getPendingOrders(userId) {
    const { data: orders, error } = await this.supabase
      .from('pending_orders')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      throw new Error('Error getting pending orders: ' + error.message);
    }

    return orders || [];
  }

  async placeBuyOrder(symbol, quantity, orderType, limitPrice, userId) {
    const price = await this.getCurrentPrice(symbol);
    const totalCost = price * quantity;

    // Check if user has enough balance
    const { data: user, error: userError } = await this.supabase
      .from('users')
      .select('balance')
      .eq('user_id', userId)
      .single();

    if (userError) {
      throw new Error('Error checking balance: ' + userError.message);
    }

    if (user.balance < totalCost) {
      throw new Error('Insufficient funds');
    }

    if (orderType === 'MARKET') {
      // Execute market order immediately
      const { error: updateError } = await this.supabase
        .from('users')
        .update({ balance: user.balance - totalCost })
        .eq('user_id', userId);

      if (updateError) {
        throw new Error('Error updating balance: ' + updateError.message);
      }

      // Update or create position
      const { data: position, error: positionError } = await this.supabase
        .from('positions')
        .select('*')
        .eq('user_id', userId)
        .eq('symbol', symbol)
        .single();

      if (positionError && positionError.code !== 'PGRST116') {
        throw new Error('Error checking position: ' + positionError.message);
      }

      if (position) {
        // Update existing position
        const newQuantity = position.quantity + quantity;
        const newAvgPrice = ((position.quantity * position.avg_price) + (quantity * price)) / newQuantity;

        const { error: updatePositionError } = await this.supabase
          .from('positions')
          .update({
            quantity: newQuantity,
            avg_price: newAvgPrice
          })
          .eq('user_id', userId)
          .eq('symbol', symbol);

        if (updatePositionError) {
          throw new Error('Error updating position: ' + updatePositionError.message);
        }
      } else {
        // Create new position
        const { error: insertPositionError } = await this.supabase
          .from('positions')
          .insert([
            {
              user_id: userId,
              symbol,
              quantity,
              avg_price: price
            }
          ]);

        if (insertPositionError) {
          throw new Error('Error creating position: ' + insertPositionError.message);
        }
      }

      return { orderType: 'MARKET', price };
    } else {
      // Create limit order
      const { data: order, error: orderError } = await this.supabase
        .from('pending_orders')
        .insert([
          {
            user_id: userId,
            symbol,
            quantity,
            limit_price: limitPrice,
            type: 'BUY'
          }
        ])
        .select()
        .single();

      if (orderError) {
        throw new Error('Error creating limit order: ' + orderError.message);
      }

      return {
        orderType: 'LIMIT',
        message: `Limit buy order placed for ${quantity} shares of ${symbol} at $${limitPrice.toFixed(2)}`
      };
    }
  }

  async placeSellOrder(symbol, quantity, orderType, limitPrice, userId) {
    // Check if user has enough shares
    const { data: position, error: positionError } = await this.supabase
      .from('positions')
      .select('*')
      .eq('user_id', userId)
      .eq('symbol', symbol)
      .single();

    if (positionError) {
      throw new Error('Error checking position: ' + positionError.message);
    }

    if (!position || position.quantity < quantity) {
      throw new Error('Insufficient shares');
    }

    if (orderType === 'MARKET') {
      const price = await this.getCurrentPrice(symbol);
      const totalValue = price * quantity;

      // Update user's balance
      const { data: user, error: userError } = await this.supabase
        .from('users')
        .select('balance')
        .eq('user_id', userId)
        .single();

      if (userError) {
        throw new Error('Error checking balance: ' + userError.message);
      }

      const { error: updateError } = await this.supabase
        .from('users')
        .update({ balance: user.balance + totalValue })
        .eq('user_id', userId);

      if (updateError) {
        throw new Error('Error updating balance: ' + updateError.message);
      }

      // Update position
      if (position.quantity === quantity) {
        // Delete position if selling all shares
        const { error: deleteError } = await this.supabase
          .from('positions')
          .delete()
          .eq('user_id', userId)
          .eq('symbol', symbol);

        if (deleteError) {
          throw new Error('Error deleting position: ' + deleteError.message);
        }
      } else {
        // Update position quantity
        const { error: updatePositionError } = await this.supabase
          .from('positions')
          .update({ quantity: position.quantity - quantity })
          .eq('user_id', userId)
          .eq('symbol', symbol);

        if (updatePositionError) {
          throw new Error('Error updating position: ' + updatePositionError.message);
        }
      }

      return { orderType: 'MARKET', price };
    } else {
      // Create limit order
      const { data: order, error: orderError } = await this.supabase
        .from('pending_orders')
        .insert([
          {
            user_id: userId,
            symbol,
            quantity,
            limit_price: limitPrice,
            type: 'SELL'
          }
        ])
        .select()
        .single();

      if (orderError) {
        throw new Error('Error creating limit order: ' + orderError.message);
      }

      return {
        orderType: 'LIMIT',
        message: `Limit sell order placed for ${quantity} shares of ${symbol} at $${limitPrice.toFixed(2)}`
      };
    }
  }

  async cancelOrder(orderId, userId) {
    const { data: order, error: orderError } = await this.supabase
      .from('pending_orders')
      .select('*')
      .eq('id', orderId)
      .eq('user_id', userId)
      .single();

    if (orderError) {
      throw new Error('Order not found');
    }

    const { error: deleteError } = await this.supabase
      .from('pending_orders')
      .delete()
      .eq('id', orderId)
      .eq('user_id', userId);

    if (deleteError) {
      throw new Error('Error cancelling order: ' + deleteError.message);
    }

    return {
      type: order.type,
      symbol: order.symbol,
      quantity: order.quantity,
      limitPrice: order.limit_price
    };
  }

  async getPnL(userId) {
    const { data: positions, error: positionsError } = await this.supabase
      .from('positions')
      .select('*')
      .eq('user_id', userId);

    if (positionsError) {
      throw new Error('Error getting positions: ' + positionsError.message);
    }

    let totalPnL = 0;
    for (const position of positions) {
      const currentPrice = await this.getCurrentPrice(position.symbol);
      const positionPnL = (currentPrice - position.avg_price) * position.quantity;
      totalPnL += positionPnL;
    }

    return totalPnL;
  }

  async isDemoMode(userId) {
    const { data: user, error } = await this.supabase
      .from('users')
      .select('demo_mode')
      .eq('user_id', userId)
      .single();

    if (error) {
      throw new Error('Error checking demo mode: ' + error.message);
    }

    return user.demo_mode;
  }

  async setDemoMode(enabled, userId) {
    const { error } = await this.supabase
      .from('users')
      .update({ demo_mode: enabled })
      .eq('user_id', userId);

    if (error) {
      throw new Error('Error setting demo mode: ' + error.message);
    }

    this.demoMode = enabled;
  }

  async getCurrentPrice(symbol) {
    if (this.demoMode) {
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
}

module.exports = { TradingService }; 