-- Create users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  telegram_id BIGINT UNIQUE NOT NULL,
  balance DECIMAL(15,2) DEFAULT 100000.00,
  pin VARCHAR(4) DEFAULT '0720',
  demo_mode BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Create positions table
CREATE TABLE positions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  symbol VARCHAR(10) NOT NULL,
  quantity INTEGER NOT NULL,
  avg_price DECIMAL(15,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  UNIQUE(user_id, symbol)
);

-- Create orders table
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(4) NOT NULL, -- 'BUY' or 'SELL'
  symbol VARCHAR(10) NOT NULL,
  quantity INTEGER NOT NULL,
  price DECIMAL(15,2) NOT NULL,
  order_type VARCHAR(6) NOT NULL, -- 'MARKET' or 'LIMIT'
  status VARCHAR(10) NOT NULL, -- 'PENDING', 'EXECUTED', 'CANCELLED'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Create RLS policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can only access their own data"
  ON users FOR ALL
  USING (telegram_id = current_setting('app.current_user_id')::bigint);

-- Positions policies
CREATE POLICY "Users can only access their own positions"
  ON positions FOR ALL
  USING (user_id IN (SELECT id FROM users WHERE telegram_id = current_setting('app.current_user_id')::bigint));

-- Orders policies
CREATE POLICY "Users can only access their own orders"
  ON orders FOR ALL
  USING (user_id IN (SELECT id FROM users WHERE telegram_id = current_setting('app.current_user_id')::bigint));

-- Create functions for updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc'::text, NOW());
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updating timestamps
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_positions_updated_at
  BEFORE UPDATE ON positions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column(); 