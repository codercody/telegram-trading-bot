-- Create a global account table
CREATE TABLE IF NOT EXISTS global_account (
  id SERIAL PRIMARY KEY,
  demo_balance DECIMAL(10, 2) NOT NULL DEFAULT 100000.00,
  live_balance DECIMAL(10, 2) NOT NULL DEFAULT 30470.00,
  demo_mode BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert a single global account record
INSERT INTO global_account (id, demo_balance, live_balance, demo_mode)
VALUES (1, 100000.00, 30470.00, true)
ON CONFLICT (id) DO NOTHING;

-- Modify positions table to remove user_id and add a global flag
ALTER TABLE positions DROP CONSTRAINT IF EXISTS positions_user_id_fkey;
ALTER TABLE positions DROP COLUMN IF EXISTS user_id;
ALTER TABLE positions ADD COLUMN is_global BOOLEAN NOT NULL DEFAULT true;

-- Modify pending_orders table to remove user_id and add a global flag
ALTER TABLE pending_orders DROP CONSTRAINT IF EXISTS pending_orders_user_id_fkey;
ALTER TABLE pending_orders DROP COLUMN IF EXISTS user_id;
ALTER TABLE pending_orders ADD COLUMN is_global BOOLEAN NOT NULL DEFAULT true;

-- Modify order_history table to remove user_id and add a global flag
ALTER TABLE order_history DROP CONSTRAINT IF EXISTS order_history_user_id_fkey;
ALTER TABLE order_history DROP COLUMN IF EXISTS user_id;
ALTER TABLE order_history ADD COLUMN is_global BOOLEAN NOT NULL DEFAULT true;

-- Drop the users table as it's no longer needed
DROP TABLE IF EXISTS users;

-- Create a trigger to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_global_account_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_global_account_timestamp
BEFORE UPDATE ON global_account
FOR EACH ROW
EXECUTE FUNCTION update_global_account_timestamp(); 