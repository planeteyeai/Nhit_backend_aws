-- Rename DB user_role ENUM value Admin → Site Engineer.
-- Safe 3-step: add new value, copy rows, drop old value (do not swap names in-place).

ALTER TABLE users
  MODIFY COLUMN `user_role` ENUM(
    'Admin',
    'BMC',
    'Sales',
    'Purchase',
    'QC',
    'Logistics',
    'Accounts',
    'Stores',
    'Super Admin',
    'Site Engineer'
  ) NOT NULL;

UPDATE users SET user_role = 'Site Engineer' WHERE user_role = 'Admin';

ALTER TABLE users
  MODIFY COLUMN `user_role` ENUM(
    'Site Engineer',
    'BMC',
    'Sales',
    'Purchase',
    'QC',
    'Logistics',
    'Accounts',
    'Stores',
    'Super Admin'
  ) NOT NULL;
