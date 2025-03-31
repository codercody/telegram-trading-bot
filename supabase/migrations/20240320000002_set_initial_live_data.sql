-- Set live balance to $30,470 for all users
UPDATE users 
SET live_balance = 30470.00;

-- Add initial YINN position for all users
INSERT INTO positions (user_id, symbol, quantity, avg_price, demo_mode, created_at, updated_at)
SELECT 
    user_id,
    'YINN',
    100,
    23.34,
    false,
    '2025-01-14 00:00:00+00',
    '2025-01-14 00:00:00+00'
FROM users
ON CONFLICT (user_id, symbol, demo_mode) 
DO UPDATE SET 
    quantity = 100,
    avg_price = 23.34,
    updated_at = '2025-01-14 00:00:00+00'; 