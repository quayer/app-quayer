-- Normalize role values to lowercase to align with the schema default ("user")
-- and all controllers that compare role via === 'admin' / === 'user'.
--
-- Root cause: UserRole enum previously had ADMIN = 'ADMIN' / USER = 'USER' (uppercase),
-- causing the first registered user to be stored as role = 'ADMIN' in the DB while
-- every admin check used lowercase literals, so admin actions were always rejected.
--
-- This migration is idempotent: rows already in lowercase are unaffected by the WHERE clause.
UPDATE "User" SET role = LOWER(role) WHERE role <> LOWER(role);
