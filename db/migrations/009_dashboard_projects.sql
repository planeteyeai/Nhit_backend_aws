-- Replace legacy PowerBI table with Dashboard_projects (Excel import schema).
-- Prefer: node scripts/load_dashboard_projects.cjs

DROP TABLE IF EXISTS `PowerBI`;
DROP TABLE IF EXISTS `powerbi`;
DROP TABLE IF EXISTS `Dashboard_projects`;

CREATE TABLE `Dashboard_projects` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `project_name` VARCHAR(255) NULL,
  `actual_start_chainage` DOUBLE NULL,
  `actual_end_chainage` DOUBLE NULL,
  `longitude` DOUBLE NULL,
  `latitude` DOUBLE NULL,
  `kilometer` DOUBLE NULL,
  `length` DOUBLE NULL,
  `toll_plaza_location` VARCHAR(255) NULL,
  `originating` VARCHAR(255) NULL,
  `terminating` VARCHAR(255) NULL,
  `carriage_width` VARCHAR(100) NULL,
  `structures` VARCHAR(100) NULL,
  `mjb` INT NULL,
  `mnb` INT NULL,
  `flyover` INT NULL,
  `aadt` DOUBLE NULL,
  `pup` INT NULL,
  `vup` INT NULL,
  `rob` INT NULL,
  `direction` VARCHAR(50) NULL,
  `lane` VARCHAR(50) NULL,
  `carriage_type` VARCHAR(100) NULL,
  PRIMARY KEY (`id`),
  KEY `idx_project_name` (`project_name`),
  KEY `idx_structures` (`structures`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
