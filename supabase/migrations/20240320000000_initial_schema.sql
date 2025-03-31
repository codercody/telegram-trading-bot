-- Create users table
CREATE TABLE users (
    telegram_id BIGINT PRIMARY KEY,
    balance DECIMAL(15,2) DEFAULT 100000.00,
    demo_mode BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create positions table
CREATE TABLE positions (
    id BIGSERIAL PRIMARY KEY,
    telegram_id BIGINT REFERENCES users(telegram_id),
    symbol TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    avg_price DECIMAL(15,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(telegram_id, symbol)
);

-- Create orders table
CREATE TABLE orders (
    id BIGSERIAL PRIMARY KEY,
    telegram_id BIGINT REFERENCES users(telegram_id),
    order_id TEXT NOT NULL,
    type TEXT NOT NULL,
    symbol TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    price DECIMAL(15,2) NOT NULL,
    order_type TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(telegram_id, order_id)
);

-- Create order history table
CREATE TABLE order_history (
    id BIGSERIAL PRIMARY KEY,
    telegram_id BIGINT REFERENCES users(telegram_id),
    type TEXT NOT NULL,
    symbol TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    price DECIMAL(15,2) NOT NULL,
    order_type TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for positions table
CREATE TRIGGER update_positions_updated_at
    BEFORE UPDATE ON positions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column(); 