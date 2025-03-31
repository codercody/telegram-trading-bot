const yahooFinance = require('yahoo-finance2').default;
const supabase = require('./utils/supabase');

class TradingService {
  constructor() {
    this.PRICE_CACHE_DURATION = 60000; // Cache prices for 1 minute
    this.priceCache = new Map();
    this.lastPriceUpdate = new Map();
    this.PIN = '0720'; // Security PIN
  }

  async initializeUser(telegramId) {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
      throw error;
    }

    if (!user) {
      const { error: insertError } = await supabase
        .from('users')
        .insert([{ telegram_id: telegramId }]);

      if (insertError) throw insertError;
    }

    return user || { telegram_id: telegramId, balance: 100000, demo_mode: false };
  }

  verifyPin(pin) {
    return pin === this.PIN;
  }

  async getBalance(telegramId, pin) {
    if (!this.verifyPin(pin)) {
      throw new Error('Invalid PIN');
    }

    const user = await this.initializeUser(telegramId);
    return user.balance;
  }

  async getPositions(telegramId, pin) {
    if (!this.verifyPin(pin)) {
      throw new Error('Invalid PIN');
    }

    const { data: positions, error } = await supabase
      .from('positions')
      .select('*')
      .eq('telegram_id', telegramId);

    if (error) throw error;
    return positions || [];
  }

  async getPnL(telegramId, pin) {
    if (!this.verifyPin(pin)) {
      throw new Error('Invalid PIN');
    }

    const positions = await this.getPositions(telegramId, pin);
    let totalPnL = 0;

    for (const position of positions) {
      const currentPrice = await this.getRealPrice(position.symbol);
      const positionValue = position.quantity * currentPrice;
      const costBasis = position.quantity * position.avg_price;
      totalPnL += positionValue - costBasis;
    }

    return totalPnL;
  }

  async isMarketOpen(telegramId, pin) {
    if (!this.verifyPin(pin)) {
      throw new Error('Invalid PIN');
    }

    const now = new Date();
    const day = now.getDay();
    const hour = now.getHours();
    const minute = now.getMinutes();

    if (day === 0 || day === 6) {
      return false;
    }

    const isDST = this.isDST(now);
    const etHour = isDST ? hour - 4 : hour - 5;
    
    if (etHour < 9 || (etHour === 9 && minute < 30) || etHour >= 16) {
      return false;
    }

    return true;
  }

  isDST(date) {
    const year = date.getFullYear();
    const firstSunday = new Date(year, 2, 1);
    const lastSunday = new Date(year, 10, 1);
    
    while (firstSunday.getDay() !== 0) {
      firstSunday.setDate(firstSunday.getDate() + 1);
    }
    firstSunday.setDate(firstSunday.getDate() + 7);
    
    while (lastSunday.getDay() !== 0) {
      lastSunday.setDate(lastSunday.getDate() + 1);
    }
    
    return date >= firstSunday && date < lastSunday;
  }

  async setDemoMode(telegramId, enabled, pin) {
    if (!this.verifyPin(pin)) {
      throw new Error('Invalid PIN');
    }

    const { error } = await supabase
      .from('users')
      .update({ demo_mode: enabled })
      .eq('telegram_id', telegramId);

    if (error) throw error;
  }

  async isDemoMode(telegramId, pin) {
    if (!this.verifyPin(pin)) {
      throw new Error('Invalid PIN');
    }

    const user = await this.initializeUser(telegramId);
    return user.demo_mode;
  }

  async getPendingOrders(telegramId) {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*')
      .eq('telegram_id', telegramId)
      .eq('status', 'pending');

    if (error) throw error;
    return orders || [];
  }

  async placeBuyOrder(telegramId, symbol, quantity, orderType = 'MARKET', limitPrice = null, pin) {
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

    const user = await this.initializeUser(telegramId);
    const currentPrice = await this.getRealPrice(symbol);
    const totalCost = currentPrice * quantity;

    if (orderType === 'MARKET' && totalCost > user.balance) {
      throw new Error('Insufficient funds');
    }

    if (orderType === 'MARKET' && !(await this.isMarketOpen(telegramId, pin))) {
      throw new Error('Market orders are only accepted during market hours (9:30 AM - 4:00 PM ET)');
    }

    if (orderType === 'LIMIT') {
      const orderId = Date.now().toString();
      const { error } = await supabase
        .from('orders')
        .insert([{
          telegram_id: telegramId,
          order_id: orderId,
          type: 'BUY',
          symbol,
          quantity,
          price: limitPrice,
          order_type: 'LIMIT',
          status: 'pending'
        }]);

      if (error) throw error;

      return {
        orderId,
        orderType: 'LIMIT',
        message: `Limit buy order placed for ${quantity} shares of ${symbol} at $${limitPrice.toFixed(2)}`
      };
    } else {
      // Execute market order
      const { data: position } = await supabase
        .from('positions')
        .select('*')
        .eq('telegram_id', telegramId)
        .eq('symbol', symbol)
        .single();

      const newQuantity = (position?.quantity || 0) + quantity;
      const newAvgPrice = ((position?.quantity || 0) * (position?.avg_price || 0) + (quantity * currentPrice)) / newQuantity;

      if (position) {
        const { error } = await supabase
          .from('positions')
          .update({
            quantity: newQuantity,
            avg_price: newAvgPrice
          })
          .eq('telegram_id', telegramId)
          .eq('symbol', symbol);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('positions')
          .insert([{
            telegram_id: telegramId,
            symbol,
            quantity: newQuantity,
            avg_price: newAvgPrice
          }]);

        if (error) throw error;
      }

      // Update balance
      const { error: balanceError } = await supabase
        .from('users')
        .update({ balance: user.balance - totalCost })
        .eq('telegram_id', telegramId);

      if (balanceError) throw balanceError;

      // Record order history
      const { error: historyError } = await supabase
        .from('order_history')
        .insert([{
          telegram_id: telegramId,
          type: 'BUY',
          symbol,
          quantity,
          price: currentPrice,
          order_type: 'MARKET'
        }]);

      if (historyError) throw historyError;

      return { price: currentPrice, orderType: 'MARKET' };
    }
  }

  async placeSellOrder(telegramId, symbol, quantity, orderType = 'MARKET', limitPrice = null, pin) {
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

    const { data: position } = await supabase
      .from('positions')
      .select('*')
      .eq('telegram_id', telegramId)
      .eq('symbol', symbol)
      .single();

    if (!position || position.quantity < quantity) {
      throw new Error('Insufficient shares');
    }

    if (orderType === 'MARKET' && !(await this.isMarketOpen(telegramId, pin))) {
      throw new Error('Market orders are only accepted during market hours (9:30 AM - 4:00 PM ET)');
    }

    const currentPrice = await this.getRealPrice(symbol);

    if (orderType === 'LIMIT') {
      const orderId = Date.now().toString();
      const { error } = await supabase
        .from('orders')
        .insert([{
          telegram_id: telegramId,
          order_id: orderId,
          type: 'SELL',
          symbol,
          quantity,
          price: limitPrice,
          order_type: 'LIMIT',
          status: 'pending'
        }]);

      if (error) throw error;

      return {
        orderId,
        orderType: 'LIMIT',
        message: `Limit sell order placed for ${quantity} shares of ${symbol} at $${limitPrice.toFixed(2)}`
      };
    } else {
      // Execute market order
      const totalProceeds = currentPrice * quantity;
      const user = await this.initializeUser(telegramId);

      // Update position
      if (position.quantity === quantity) {
        const { error } = await supabase
          .from('positions')
          .delete()
          .eq('telegram_id', telegramId)
          .eq('symbol', symbol);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('positions')
          .update({
            quantity: position.quantity - quantity
          })
          .eq('telegram_id', telegramId)
          .eq('symbol', symbol);

        if (error) throw error;
      }

      // Update balance
      const { error: balanceError } = await supabase
        .from('users')
        .update({ balance: user.balance + totalProceeds })
        .eq('telegram_id', telegramId);

      if (balanceError) throw balanceError;

      // Record order history
      const { error: historyError } = await supabase
        .from('order_history')
        .insert([{
          telegram_id: telegramId,
          type: 'SELL',
          symbol,
          quantity,
          price: currentPrice,
          order_type: 'MARKET'
        }]);

      if (historyError) throw historyError;

      return { price: currentPrice, orderType: 'MARKET' };
    }
  }

  async cancelOrder(telegramId, orderId, pin) {
    if (!this.verifyPin(pin)) {
      throw new Error('Invalid PIN');
    }

    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('telegram_id', telegramId)
      .eq('order_id', orderId)
      .eq('status', 'pending')
      .single();

    if (error || !order) {
      throw new Error('Order not found');
    }

    const { error: deleteError } = await supabase
      .from('orders')
      .delete()
      .eq('telegram_id', telegramId)
      .eq('order_id', orderId);

    if (deleteError) throw deleteError;

    return {
      type: order.type,
      symbol: order.symbol,
      quantity: order.quantity,
      limitPrice: order.price
    };
  }

  async checkLimitOrders() {
    const { data: pendingOrders, error } = await supabase
      .from('orders')
      .select('*')
      .eq('status', 'pending');

    if (error) throw error;

    for (const order of pendingOrders) {
      const currentPrice = await this.getRealPrice(order.symbol);
      
      if (order.type === 'BUY' && currentPrice <= order.price) {
        await this.executeLimitOrder(order);
      } else if (order.type === 'SELL' && currentPrice >= order.price) {
        await this.executeLimitOrder(order);
      }
    }
  }

  async executeLimitOrder(order) {
    const user = await this.initializeUser(order.telegram_id);
    const currentPrice = await this.getRealPrice(order.symbol);

    if (order.type === 'BUY') {
      const totalCost = currentPrice * order.quantity;
      if (totalCost > user.balance) {
        return; // Skip if insufficient funds
      }

      const { data: position } = await supabase
        .from('positions')
        .select('*')
        .eq('telegram_id', order.telegram_id)
        .eq('symbol', order.symbol)
        .single();

      const newQuantity = (position?.quantity || 0) + order.quantity;
      const newAvgPrice = ((position?.quantity || 0) * (position?.avg_price || 0) + (order.quantity * currentPrice)) / newQuantity;

      if (position) {
        const { error } = await supabase
          .from('positions')
          .update({
            quantity: newQuantity,
            avg_price: newAvgPrice
          })
          .eq('telegram_id', order.telegram_id)
          .eq('symbol', order.symbol);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('positions')
          .insert([{
            telegram_id: order.telegram_id,
            symbol: order.symbol,
            quantity: newQuantity,
            avg_price: newAvgPrice
          }]);

        if (error) throw error;
      }

      // Update balance
      const { error: balanceError } = await supabase
        .from('users')
        .update({ balance: user.balance - totalCost })
        .eq('telegram_id', order.telegram_id);

      if (balanceError) throw balanceError;
    } else {
      const totalProceeds = currentPrice * order.quantity;

      const { data: position } = await supabase
        .from('positions')
        .select('*')
        .eq('telegram_id', order.telegram_id)
        .eq('symbol', order.symbol)
        .single();

      if (!position || position.quantity < order.quantity) {
        return; // Skip if insufficient shares
      }

      // Update position
      if (position.quantity === order.quantity) {
        const { error } = await supabase
          .from('positions')
          .delete()
          .eq('telegram_id', order.telegram_id)
          .eq('symbol', order.symbol);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('positions')
          .update({
            quantity: position.quantity - order.quantity
          })
          .eq('telegram_id', order.telegram_id)
          .eq('symbol', order.symbol);

        if (error) throw error;
      }

      // Update balance
      const { error: balanceError } = await supabase
        .from('users')
        .update({ balance: user.balance + totalProceeds })
        .eq('telegram_id', order.telegram_id);

      if (balanceError) throw balanceError;
    }

    // Record order history
    const { error: historyError } = await supabase
      .from('order_history')
      .insert([{
        telegram_id: order.telegram_id,
        type: order.type,
        symbol: order.symbol,
        quantity: order.quantity,
        price: order.price,
        order_type: 'LIMIT'
      }]);

    if (historyError) throw historyError;

    // Remove the executed order
    const { error: deleteError } = await supabase
      .from('orders')
      .delete()
      .eq('telegram_id', order.telegram_id)
      .eq('order_id', order.order_id);

    if (deleteError) throw deleteError;
  }

  async getRealPrice(symbol) {
    const now = Date.now();
    const cachedPrice = this.priceCache.get(symbol);
    const lastUpdate = this.lastPriceUpdate.get(symbol);

    if (cachedPrice && lastUpdate && (now - lastUpdate) < this.PRICE_CACHE_DURATION) {
      return cachedPrice;
    }

    try {
      const quote = await yahooFinance.quote(symbol);
      const price = quote.regularMarketPrice;
      
      this.priceCache.set(symbol, price);
      this.lastPriceUpdate.set(symbol, now);
      
      return price;
    } catch (error) {
      console.error(`Error fetching price for ${symbol}:`, error);
      throw new Error(`Failed to fetch price for ${symbol}`);
    }
  }
}

module.exports = { TradingService }; 