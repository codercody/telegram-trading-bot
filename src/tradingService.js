const { createClient } = require("@supabase/supabase-js");

class TradingService {
  constructor() {
    // Initialize Supabase client
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );
  }

  async getCurrentPrice(symbol) {
    // Normalize symbol to uppercase
    const normalizedSymbol = symbol.toUpperCase();
    console.log(`Fetching price for ${normalizedSymbol}...`);

    // Try multiple exchanges to find the stock
    const exchanges = ["NYSEARCA", "NASDAQ", "NYSE", "AMEX", "MUTF", "OTCMKTS"];

    for (const exchange of exchanges) {
      try {
        const url = `https://www.google.com/finance/quote/${normalizedSymbol}:${exchange}`;
        const response = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        });

        const html = await response.text();
        const match = html.match(/data-last-price="([0-9.]+)"/);

        if (match) {
          const price = parseFloat(match[1]);
          if (price > 0) {
            console.log(
              `✓ Google Finance: ${normalizedSymbol} (${exchange}) = $${price}`
            );
            return price;
          }
        }
      } catch (error) {
        console.error(
          `✗ Failed to fetch ${normalizedSymbol} from ${exchange}:`,
          error.message
        );
      }
    }

    throw new Error(
      `Unable to fetch price for ${normalizedSymbol}. Please check the symbol is valid.`
    );
  }

  async getBalance() {
    try {
      const isDemoMode = await this.isDemoMode();
      const { data, error } = await this.supabase
        .from("global_account")
        .select(isDemoMode ? "demo_balance" : "live_balance")
        .single();

      if (error) throw error;
      return isDemoMode ? data.demo_balance : data.live_balance;
    } catch (error) {
      console.error("Error getting balance:", error);
      throw error;
    }
  }

  async updateBalance(amount) {
    try {
      const isDemoMode = await this.isDemoMode();
      const balanceField = isDemoMode ? "demo_balance" : "live_balance";

      const { data: currentData, error: fetchError } = await this.supabase
        .from("global_account")
        .select(balanceField)
        .single();

      if (fetchError) throw fetchError;

      const newBalance = currentData[balanceField] + amount;
      if (newBalance < 0) {
        throw new Error("Insufficient funds");
      }

      const { error: updateError } = await this.supabase
        .from("global_account")
        .update({ [balanceField]: newBalance })
        .eq("id", 1);

      if (updateError) throw updateError;
    } catch (error) {
      console.error("Error updating balance:", error);
      throw error;
    }
  }

  async getPositions() {
    try {
      const isDemo = await this.isDemoMode();
      const { data: positions, error } = await this.supabase
        .from("positions")
        .select("*")
        .eq("demo_mode", isDemo);

      if (error) throw error;
      return positions || [];
    } catch (error) {
      console.error("Error getting positions:", error);
      throw error;
    }
  }

  async getPendingOrders() {
    try {
      const isDemo = await this.isDemoMode();
      const { data: orders, error } = await this.supabase
        .from("pending_orders")
        .select("*")
        .eq("demo_mode", isDemo);

      if (error) throw error;
      return orders || [];
    } catch (error) {
      console.error("Error getting pending orders:", error);
      throw error;
    }
  }

  async checkAndExecutePendingOrders() {
    try {
      // Get all pending orders
      const { data: pendingOrders, error: ordersError } = await this.supabase
        .from("pending_orders")
        .select("*");

      if (ordersError) throw ordersError;
      if (!pendingOrders || pendingOrders.length === 0) return;

      // Group orders by symbol to minimize API calls
      const ordersBySymbol = pendingOrders.reduce((acc, order) => {
        if (!acc[order.symbol]) {
          acc[order.symbol] = [];
        }
        acc[order.symbol].push(order);
        return acc;
      }, {});

      // Check each symbol's orders
      for (const [symbol, orders] of Object.entries(ordersBySymbol)) {
        try {
          // Get current price for the symbol
          const currentPrice = await this.getCurrentPrice(symbol);

          // Check each order for execution
          for (const order of orders) {
            // Log order check information
            console.log("Checking pending order:", {
              orderId: order.id,
              symbol: order.symbol,
              type: order.type,
              quantity: order.quantity,
              limitPrice: order.limit_price,
              currentPrice,
              canExecute:
                order.type === "BUY"
                  ? order.limit_price >= currentPrice
                  : order.limit_price <= currentPrice,
            });

            if (order.type === "BUY" && order.limit_price >= currentPrice) {
              // Execute buy order at the limit price
              await this.executeBuyOrder(
                order.symbol,
                order.quantity,
                order.limit_price
              );
              // Delete the pending order
              await this.supabase
                .from("pending_orders")
                .delete()
                .eq("id", order.id);
              console.log(
                `✓ Executed pending BUY order for ${order.quantity} ${order.symbol} at $${order.limit_price}`
              );
            } else if (
              order.type === "SELL" &&
              order.limit_price <= currentPrice
            ) {
              // Execute sell order at the limit price
              await this.executeSellOrder(
                order.symbol,
                order.quantity,
                order.limit_price
              );
              // Delete the pending order
              await this.supabase
                .from("pending_orders")
                .delete()
                .eq("id", order.id);
              console.log(
                `✓ Executed pending SELL order for ${order.quantity} ${order.symbol} at $${order.limit_price}`
              );
            }
          }
        } catch (error) {
          console.error(`Error processing orders for ${symbol}:`, error);
          // Continue with next symbol even if one fails
        }
      }
    } catch (error) {
      console.error("Error checking pending orders:", error);
      throw error;
    }
  }

  async executeBuyOrder(symbol, quantity, price) {
    const totalCost = quantity * price;
    await this.updateBalance(-totalCost);

    const { data: existingPosition, error: fetchError } = await this.supabase
      .from("positions")
      .select("*")
      .eq("symbol", symbol.toUpperCase())
      .eq("demo_mode", await this.isDemoMode())
      .single();

    if (fetchError && fetchError.code !== "PGRST116") {
      throw fetchError;
    }

    if (existingPosition) {
      const newQuantity = existingPosition.quantity + quantity;
      const newAvgPrice =
        (existingPosition.avg_price * existingPosition.quantity +
          price * quantity) /
        newQuantity;

      const { error: updateError } = await this.supabase
        .from("positions")
        .update({
          quantity: newQuantity,
          avg_price: newAvgPrice,
        })
        .eq("symbol", symbol.toUpperCase())
        .eq("demo_mode", await this.isDemoMode());

      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await this.supabase
        .from("positions")
        .insert([
          {
            symbol: symbol.toUpperCase(),
            quantity,
            avg_price: price,
            demo_mode: await this.isDemoMode(),
          },
        ]);

      if (insertError) throw insertError;
    }
  }

  async executeSellOrder(symbol, quantity, price) {
    const totalProceeds = quantity * price;

    const { data: position, error: fetchError } = await this.supabase
      .from("positions")
      .select("*")
      .eq("symbol", symbol.toUpperCase())
      .eq("demo_mode", await this.isDemoMode())
      .single();

    if (fetchError) throw fetchError;
    if (!position || position.quantity < quantity) {
      throw new Error("Insufficient shares");
    }

    await this.updateBalance(totalProceeds);

    const newQuantity = position.quantity - quantity;
    if (newQuantity === 0) {
      const { error: deleteError } = await this.supabase
        .from("positions")
        .delete()
        .eq("symbol", symbol.toUpperCase())
        .eq("demo_mode", await this.isDemoMode());

      if (deleteError) throw deleteError;
    } else {
      const { error: updateError } = await this.supabase
        .from("positions")
        .update({ quantity: newQuantity })
        .eq("symbol", symbol.toUpperCase())
        .eq("demo_mode", await this.isDemoMode());

      if (updateError) throw updateError;
    }
  }

  async placeBuyOrder(symbol, quantity, limitPrice) {
    try {
      const isDemoMode = await this.isDemoMode();

      // Check market hours for live mode
      if (!isDemoMode && !this.isMarketOpen()) {
        throw new Error(
          "Market is currently closed. Trading hours are 9:30 AM - 4:00 PM ET, Monday-Friday."
        );
      }

      const currentPrice = await this.getCurrentPrice(symbol);

      // For market orders (no limit price) or if limit price is better than current price, execute immediately
      if (!limitPrice || limitPrice >= currentPrice) {
        await this.executeBuyOrder(symbol, quantity, currentPrice);
        return {
          symbol: symbol.toUpperCase(),
          quantity,
          price: currentPrice,
          totalCost: quantity * currentPrice,
          executed: true,
        };
      }

      // For limit orders, place as pending order
      const { error: insertError } = await this.supabase
        .from("pending_orders")
        .insert([
          {
            symbol: symbol.toUpperCase(),
            quantity,
            limit_price: limitPrice,
            type: "BUY",
            demo_mode: isDemoMode,
          },
        ]);

      if (insertError) throw insertError;

      return {
        symbol: symbol.toUpperCase(),
        quantity,
        limitPrice,
        executed: false,
      };
    } catch (error) {
      console.error("Error placing buy order:", error);
      throw error;
    }
  }

  async placeSellOrder(symbol, quantity, limitPrice) {
    try {
      const isDemoMode = await this.isDemoMode();

      // Check market hours for live mode
      if (!isDemoMode && !this.isMarketOpen()) {
        throw new Error(
          "Market is currently closed. Trading hours are 9:30 AM - 4:00 PM ET, Monday-Friday."
        );
      }

      const currentPrice = await this.getCurrentPrice(symbol);

      // For market orders (no limit price) or if limit price is better than current price, execute immediately
      if (!limitPrice || limitPrice <= currentPrice) {
        await this.executeSellOrder(symbol, quantity, currentPrice);
        return {
          symbol: symbol.toUpperCase(),
          quantity,
          price: currentPrice,
          totalProceeds: quantity * currentPrice,
          executed: true,
        };
      }

      // For limit orders, place as pending order
      const { error: insertError } = await this.supabase
        .from("pending_orders")
        .insert([
          {
            symbol: symbol.toUpperCase(),
            quantity,
            limit_price: limitPrice,
            type: "SELL",
            demo_mode: isDemoMode,
          },
        ]);

      if (insertError) throw insertError;

      return {
        symbol: symbol.toUpperCase(),
        quantity,
        limitPrice,
        executed: false,
      };
    } catch (error) {
      console.error("Error placing sell order:", error);
      throw error;
    }
  }

  async cancelOrder(orderId) {
    try {
      const isDemo = await this.isDemoMode();
      const { error } = await this.supabase
        .from("pending_orders")
        .delete()
        .eq("id", orderId)
        .eq("demo_mode", isDemo);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error("Error cancelling order:", error);
      throw error;
    }
  }

  async isDemoMode() {
    try {
      const { data, error } = await this.supabase
        .from("global_account")
        .select("demo_mode")
        .single();

      if (error) throw error;
      return data.demo_mode;
    } catch (error) {
      console.error("Error checking demo mode:", error);
      throw error;
    }
  }

  async setDemoMode(isDemo) {
    try {
      const { error } = await this.supabase
        .from("global_account")
        .update({ demo_mode: isDemo })
        .eq("id", 1);

      if (error) throw error;
    } catch (error) {
      console.error("Error setting demo mode:", error);
      throw error;
    }
  }

  isMarketOpen() {
    // Get current time in Eastern Time
    const now = new Date();
    const etTime = new Date(
      now.toLocaleString("en-US", { timeZone: "America/New_York" })
    );
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
