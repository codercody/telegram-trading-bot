const yahooFinance = require('yahoo-finance2').default;
const { createClient } = require('@supabase/supabase-js');

class TradingService {
  constructor() {
    // Initialize Supabase client
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );
  }

  async getCurrentPrice(symbol) {
    // Try up to 3 times with exponential backoff
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        // Fetch real-time price from Yahoo Finance
        const result = await yahooFinance.quote(symbol);
        const price = result.regularMarketPrice;

        if (!price) {
          throw new Error(`Unable to fetch price for ${symbol}`);
        }

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

  async getBalance() {
    try {
      const isDemoMode = await this.isDemoMode();
      const { data, error } = await this.supabase
        .from('global_account')
        .select(isDemoMode ? 'demo_balance' : 'live_balance')
        .single();

      if (error) throw error;
      return isDemoMode ? data.demo_balance : data.live_balance;
    } catch (error) {
      console.error('Error getting balance:', error);
      throw error;
    }
  }

  async updateBalance(amount) {
    try {
      const isDemoMode = await this.isDemoMode();
      const balanceField = isDemoMode ? 'demo_balance' : 'live_balance';
      
      const { data: currentData, error: fetchError } = await this.supabase
        .from('global_account')
        .select(balanceField)
        .single();

      if (fetchError) throw fetchError;

      const newBalance = currentData[balanceField] + amount;
      if (newBalance < 0) {
        throw new Error('Insufficient funds');
      }

      const { error: updateError } = await this.supabase
        .from('global_account')
        .update({ [balanceField]: newBalance })
        .eq('id', 1);

      if (updateError) throw updateError;
    } catch (error) {
      console.error('Error updating balance:', error);
      throw error;
    }
  }

  async getPositions() {
    try {
      const isDemo = await this.isDemoMode();
      const { data: positions, error } = await this.supabase
        .from('positions')
        .select('*')
        .eq('demo_mode', isDemo);

      if (error) throw error;
      return positions || [];
    } catch (error) {
      console.error('Error getting positions:', error);
      throw error;
    }
  }

  async getPendingOrders() {
    try {
      const isDemo = await this.isDemoMode();
      const { data: orders, error } = await this.supabase
        .from('pending_orders')
        .select('*')
        .eq('demo_mode', isDemo);

      if (error) throw error;
      return orders || [];
    } catch (error) {
      console.error('Error getting pending orders:', error);
      throw error;
    }
  }

  async checkAndExecutePendingOrders() {
    try {
      const { data: pendingOrders, error: fetchError } = await this.supabase
        .from('pending_orders')
        .select('*');

      if (fetchError) throw fetchError;

      for (const order of pendingOrders) {
        const isDemoMode = await this.isDemoMode();
        if (order.demo_mode !== isDemoMode) continue;

        // Get price history since order was placed
        const history = await yahooFinance.historical(order.symbol, {
          period1: new Date(order.created_at),
          period2: new Date(),
          interval: '1m'
        });

        if (history.length === 0) continue;

        // Find min/max price in the period
        const prices = history.map(h => h.close);
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);

        // Check if order can be executed
        if (order.type === 'buy' && minPrice <= order.limit_price) {
          // Execute buy order at limit price
          await this.executeBuyOrder(order.symbol, order.quantity, order.limit_price);
          await this.cancelOrder(order.id);
        } else if (order.type === 'sell' && maxPrice >= order.limit_price) {
          // Execute sell order at limit price
          await this.executeSellOrder(order.symbol, order.quantity, order.limit_price);
          await this.cancelOrder(order.id);
        }
      }
    } catch (error) {
      console.error('Error checking pending orders:', error);
      throw error;
    }
  }

  async executeBuyOrder(symbol, quantity, price) {
    const totalCost = quantity * price;
    await this.updateBalance(-totalCost);

    const { data: existingPosition, error: fetchError } = await this.supabase
      .from('positions')
      .select('*')
      .eq('symbol', symbol)
      .eq('demo_mode', await this.isDemoMode())
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      throw fetchError;
    }

    if (existingPosition) {
      const newQuantity = existingPosition.quantity + quantity;
      const newAvgPrice = (existingPosition.avg_price * existingPosition.quantity + price * quantity) / newQuantity;

      const { error: updateError } = await this.supabase
        .from('positions')
        .update({
          quantity: newQuantity,
          avg_price: newAvgPrice
        })
        .eq('symbol', symbol)
        .eq('demo_mode', await this.isDemoMode());

      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await this.supabase
        .from('positions')
        .insert([
          {
            symbol,
            quantity,
            avg_price: price,
            demo_mode: await this.isDemoMode()
          }
        ]);

      if (insertError) throw insertError;
    }
  }

  async executeSellOrder(symbol, quantity, price) {
    const totalProceeds = quantity * price;

    const { data: position, error: fetchError } = await this.supabase
      .from('positions')
      .select('*')
      .eq('symbol', symbol)
      .eq('demo_mode', await this.isDemoMode())
      .single();

    if (fetchError) throw fetchError;
    if (!position || position.quantity < quantity) {
      throw new Error('Insufficient shares');
    }

    await this.updateBalance(totalProceeds);

    const newQuantity = position.quantity - quantity;
    if (newQuantity === 0) {
      const { error: deleteError } = await this.supabase
        .from('positions')
        .delete()
        .eq('symbol', symbol)
        .eq('demo_mode', await this.isDemoMode());

      if (deleteError) throw deleteError;
    } else {
      const { error: updateError } = await this.supabase
        .from('positions')
        .update({ quantity: newQuantity })
        .eq('symbol', symbol)
        .eq('demo_mode', await this.isDemoMode());

      if (updateError) throw updateError;
    }
  }

  async placeBuyOrder(symbol, quantity, limitPrice) {
    try {
      const isDemoMode = await this.isDemoMode();
      
      // Check market hours for live mode
      if (!isDemoMode && !this.isMarketOpen()) {
        throw new Error('Market is currently closed. Trading hours are 9:30 AM - 4:00 PM ET, Monday-Friday.');
      }

      const currentPrice = await this.getCurrentPrice(symbol);
      
      // If limit price is better than current price, execute immediately
      if (limitPrice >= currentPrice) {
        await this.executeBuyOrder(symbol, quantity, currentPrice);
        return {
          symbol,
          quantity,
          price: currentPrice,
          totalCost: quantity * currentPrice,
          executed: true
        };
      }

      // Otherwise, place as pending order
      const { error: insertError } = await this.supabase
        .from('pending_orders')
        .insert([
          {
            symbol,
            quantity,
            limit_price: limitPrice,
            type: 'buy',
            demo_mode: isDemoMode
          }
        ]);

      if (insertError) throw insertError;

      return {
        symbol,
        quantity,
        limitPrice,
        executed: false
      };
    } catch (error) {
      console.error('Error placing buy order:', error);
      throw error;
    }
  }

  async placeSellOrder(symbol, quantity, limitPrice) {
    try {
      const isDemoMode = await this.isDemoMode();
      
      // Check market hours for live mode
      if (!isDemoMode && !this.isMarketOpen()) {
        throw new Error('Market is currently closed. Trading hours are 9:30 AM - 4:00 PM ET, Monday-Friday.');
      }

      const currentPrice = await this.getCurrentPrice(symbol);
      
      // If limit price is better than current price, execute immediately
      if (limitPrice <= currentPrice) {
        await this.executeSellOrder(symbol, quantity, currentPrice);
        return {
          symbol,
          quantity,
          price: currentPrice,
          totalProceeds: quantity * currentPrice,
          executed: true
        };
      }

      // Otherwise, place as pending order
      const { error: insertError } = await this.supabase
        .from('pending_orders')
        .insert([
          {
            symbol,
            quantity,
            limit_price: limitPrice,
            type: 'sell',
            demo_mode: isDemoMode
          }
        ]);

      if (insertError) throw insertError;

      return {
        symbol,
        quantity,
        limitPrice,
        executed: false
      };
    } catch (error) {
      console.error('Error placing sell order:', error);
      throw error;
    }
  }

  async cancelOrder(orderId) {
    try {
      const isDemo = await this.isDemoMode();
      const { error } = await this.supabase
        .from('pending_orders')
        .delete()
        .eq('id', orderId)
        .eq('demo_mode', isDemo);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error cancelling order:', error);
      throw error;
    }
  }

  async isDemoMode() {
    try {
      const { data, error } = await this.supabase
        .from('global_account')
        .select('demo_mode')
        .single();

      if (error) throw error;
      return data.demo_mode;
    } catch (error) {
      console.error('Error checking demo mode:', error);
      throw error;
    }
  }

  async setDemoMode(isDemo) {
    try {
      const { error } = await this.supabase
        .from('global_account')
        .update({ demo_mode: isDemo })
        .eq('id', 1);

      if (error) throw error;
    } catch (error) {
      console.error('Error setting demo mode:', error);
      throw error;
    }
  }

  isMarketOpen() {
    // Get current time in Eastern Time
    const now = new Date();
    const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const day = etTime.getDay();
    const hour = etTime.getHours();
    const minute = etTime.getMinutes();
    
    // Check if it's a weekday (Monday = 1, Friday = 5)
    if (day === 0 || day === 6) {
      return false;
    }

    // Market hours: 9:30 AM - 4:00 PM ET
    if (hour < 9 || (hour === 9 && minute < 30) || hour >= 16) {
      return false;
    }

    return true;
  }
}

module.exports = { TradingService }; 