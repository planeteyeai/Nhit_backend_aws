-- Fix/standardize legacy `sapn_arrangment` table
-- Compatible with existing code that references this exact table name.
-- IMPORTANT: Run in this order to avoid Error 1075.

-- 1) Ensure `sp_id` exists and is non-null int first (without AUTO_INCREMENT yet)
ALTER TABLE `sapn_arrangment`
  MODIFY COLUMN `sp_id` INT NOT NULL;

-- 2) Make `sp_id` a key first (AUTO_INCREMENT requires indexed key column)
ALTER TABLE `sapn_arrangment`
  ADD PRIMARY KEY (`sp_id`);

-- 3) Now safely set AUTO_INCREMENT on the keyed column
ALTER TABLE `sapn_arrangment`
  MODIFY COLUMN `sp_id` INT NOT NULL AUTO_INCREMENT;

-- 4) Index for bridge filtering
ALTER TABLE `sapn_arrangment`
  ADD INDEX `idx_sapn_arrangment_bridge_id` (`bridge_id`);

-- 5) Optional audit fields for updates
ALTER TABLE `sapn_arrangment`
  ADD COLUMN `updated_by` INT NULL AFTER `created_on`,
  ADD COLUMN `updated_on` DATETIME NULL ON UPDATE CURRENT_TIMESTAMP AFTER `updated_by`;

-- 6) Optional but recommended FK
-- Make sure `bridge.bridge_id` type is INT and indexed/PK before enabling.
ALTER TABLE `sapn_arrangment`
  ADD CONSTRAINT `fk_sapn_arrangment_bridge`
  FOREIGN KEY (`bridge_id`) REFERENCES `bridge`(`bridge_id`)
  ON DELETE CASCADE
  ON UPDATE CASCADE;

