-- Add new balance columns
ALTER TABLE users 
ADD COLUMN demo_balance DECIMAL(15,2) NOT NULL DEFAULT 100000.00,
ADD COLUMN live_balance DECIMAL(15,2) NOT NULL DEFAULT 100000.00;

-- Copy existing balance to both demo and live balances
UPDATE users 
SET demo_balance = balance,
    live_balance = balance;

-- Drop the old balance column
ALTER TABLE users DROP COLUMN balance; 