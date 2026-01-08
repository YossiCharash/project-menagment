-- Add requires_password_change column to users table
-- Run this SQL script to add the column if it doesn't exist

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS requires_password_change BOOLEAN DEFAULT FALSE;

