-- Script to fix transaction issues in PostgreSQL
-- Run this manually in your PostgreSQL database if needed

-- 1. Check for any open transactions
SELECT pid, usename, application_name, state, query 
FROM pg_stat_activity 
WHERE state = 'idle in transaction (aborted)';

-- 2. If you see any transactions, you can kill them (replace PID with actual process ID)
-- SELECT pg_terminate_backend(PID);

-- 3. Ensure payment_method column exists as VARCHAR
DO $$ 
BEGIN
    -- Check if column exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'transactions' AND column_name = 'payment_method'
    ) THEN
        -- Check if it's an enum type
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'transactions' 
            AND column_name = 'payment_method' 
            AND data_type = 'USER-DEFINED'
        ) THEN
            -- Convert enum to VARCHAR
            ALTER TABLE transactions ADD COLUMN payment_method_temp VARCHAR(50);
            UPDATE transactions SET payment_method_temp = payment_method::text;
            ALTER TABLE transactions DROP COLUMN payment_method;
            ALTER TABLE transactions RENAME COLUMN payment_method_temp TO payment_method;
        END IF;
    ELSE
        -- Column doesn't exist, add it
        ALTER TABLE transactions ADD COLUMN payment_method VARCHAR(50);
    END IF;
END $$;

-- 4. Drop payment_method enum if it exists and is not used
DROP TYPE IF EXISTS payment_method;

