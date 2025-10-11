-- Make email column nullable in users table to allow staff creation without email
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

