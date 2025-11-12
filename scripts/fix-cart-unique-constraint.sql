-- ============================================
-- FIX CART UNIQUE CONSTRAINT
-- ============================================
-- This script fixes the unique constraint on carts table
-- to allow multiple carts per user (but only one active cart)
--
-- Run this file using: psql $DATABASE_URL -f fix-cart-unique-constraint.sql

-- Drop the old unique constraint
ALTER TABLE carts DROP CONSTRAINT IF EXISTS carts_user_id_key;

-- Create a partial unique index that only applies to active carts
-- This allows users to have multiple carts (converted, abandoned) but only one active cart
CREATE UNIQUE INDEX IF NOT EXISTS carts_user_id_active_unique 
ON carts(user_id) 
WHERE status = 'active';

-- Verify the change
SELECT 
    indexname, 
    indexdef 
FROM pg_indexes 
WHERE tablename = 'carts' 
AND indexname = 'carts_user_id_active_unique';

