-- Dashboard_projects from structure-list Excel.
-- Prefer: node scripts/load_dashboard_projects.cjs

DROP TABLE IF EXISTS `PowerBI`;
DROP TABLE IF EXISTS `powerbi`;
DROP TABLE IF EXISTS `Dashboard_projects`;

CREATE TABLE `Dashboard_projects` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `project_name` VARCHAR(255) NULL,
  `actual_chainage` VARCHAR(50) NULL,
  `actual_start_chainage` DOUBLE NULL,
  `actual_end_chainage` DOUBLE NULL,
  `kilometer` DOUBLE NULL,
  `longitude` DOUBLE NULL,
  `latitude` DOUBLE NULL,
  `structures` VARCHAR(100) NULL,
  `mjb` INT NULL,
  `mnb` INT NULL,
  `flyover` INT NULL,
  `pup` INT NULL,
  `vup` INT NULL,
  `rob` INT NULL,
  `slab_culvert` INT NULL,
  `box_culvert` INT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_project_name` (`project_name`),
  KEY `idx_structures` (`structures`),
  KEY `idx_chainage` (`actual_start_chainage`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
