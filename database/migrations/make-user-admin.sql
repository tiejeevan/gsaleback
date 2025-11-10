-- Quick script to make a user admin
-- Replace 'your_username' with the actual username

-- Example: Make user 'john' an admin
-- UPDATE users SET role = 'admin' WHERE username = 'john';

-- Or by email:
-- UPDATE users SET role = 'admin' WHERE email = 'john@example.com';

-- Or by ID:
-- UPDATE users SET role = 'admin' WHERE id = 1;

-- Verify admin users:
-- SELECT id, username, email, role FROM users WHERE role = 'admin';
