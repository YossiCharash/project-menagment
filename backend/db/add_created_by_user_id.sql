-- Add created_by_user_id column to transactions table
ALTER TABLE transactions 
ADD COLUMN created_by_user_id INTEGER REFERENCES users(id);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_transactions_created_by_user_id ON transactions(created_by_user_id);

