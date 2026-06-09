-- Separate PRIVATE profile-import code from the PUBLIC friends share code.
-- share_code stays public (used to add friends); import_code is private (restores a profile).
ALTER TABLE users ADD COLUMN IF NOT EXISTS import_code TEXT;

-- Backfill existing users with a random private code.
UPDATE users
SET import_code = upper(substr(md5(random()::text || id::text || clock_timestamp()::text), 1, 8))
WHERE import_code IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_import_code ON users(import_code);
