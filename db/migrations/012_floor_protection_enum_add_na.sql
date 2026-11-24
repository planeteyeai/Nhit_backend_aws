-- Allow NA on floor_protection (bridge inventory + inspection general forms).
ALTER TABLE `general_bridge`
  MODIFY COLUMN `floor_protection` ENUM('Yes','No','NA') NOT NULL;

ALTER TABLE `general`
  MODIFY COLUMN `floor_protection` ENUM('Yes','No','NA') NOT NULL;
