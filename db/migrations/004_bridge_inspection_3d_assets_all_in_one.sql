CREATE TABLE IF NOT EXISTS bridge_inspection_3d_assets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  bridge_inspection_id INT DEFAULT NULL,
  bridge_id INT NOT NULL,
  asset_type ENUM('glb','panorama','distress_icon') NOT NULL,
  pano_face ENUM('right','left','top','bottom','front','back') DEFAULT NULL,
  title VARCHAR(255) DEFAULT NULL,
  distress_type VARCHAR(255) DEFAULT NULL,
  distress_note TEXT DEFAULT NULL,
  distress_x DECIMAL(12,4) DEFAULT NULL,
  distress_y DECIMAL(12,4) DEFAULT NULL,
  distress_z DECIMAL(12,4) DEFAULT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(512) NOT NULL,
  original_name VARCHAR(255) DEFAULT NULL,
  mime_type VARCHAR(128) DEFAULT NULL,
  size_bytes BIGINT UNSIGNED DEFAULT NULL,
  uploaded_by INT DEFAULT NULL,
  created_on DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_bi3da_inspection (bridge_inspection_id),
  KEY idx_bi3da_bridge (bridge_id),
  KEY idx_bi3da_asset_type (asset_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE bridge_inspection_3d_assets
  MODIFY bridge_id INT NOT NULL,
  MODIFY bridge_inspection_id INT NULL,
  MODIFY uploaded_by INT NULL;

SET @has_fk_bridge := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND CONSTRAINT_NAME = 'fk_bi3da_bridge'
);
SET @sql_bridge_fk := IF(
  @has_fk_bridge = 0,
  'ALTER TABLE bridge_inspection_3d_assets ADD CONSTRAINT fk_bi3da_bridge FOREIGN KEY (bridge_id) REFERENCES bridge(bridge_id) ON DELETE CASCADE ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt_bridge_fk FROM @sql_bridge_fk;
EXECUTE stmt_bridge_fk;
DEALLOCATE PREPARE stmt_bridge_fk;

SET @has_inspection_id_col := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'bridge_inspection'
    AND COLUMN_NAME = 'id'
);
SET @has_bridge_inspection_id_col := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'bridge_inspection'
    AND COLUMN_NAME = 'bridge_inspection_id'
);
SET @has_fk_inspection := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND CONSTRAINT_NAME = 'fk_bi3da_inspection'
);

SET @sql_inspection_fk := IF(
  @has_fk_inspection > 0,
  'SELECT 1',
  IF(
    @has_inspection_id_col > 0,
    'ALTER TABLE bridge_inspection_3d_assets ADD CONSTRAINT fk_bi3da_inspection FOREIGN KEY (bridge_inspection_id) REFERENCES bridge_inspection(id) ON DELETE SET NULL ON UPDATE CASCADE',
    IF(
      @has_bridge_inspection_id_col > 0,
      'ALTER TABLE bridge_inspection_3d_assets ADD CONSTRAINT fk_bi3da_inspection FOREIGN KEY (bridge_inspection_id) REFERENCES bridge_inspection(bridge_inspection_id) ON DELETE SET NULL ON UPDATE CASCADE',
      'SELECT 1'
    )
  )
);
PREPARE stmt_inspection_fk FROM @sql_inspection_fk;
EXECUTE stmt_inspection_fk;
DEALLOCATE PREPARE stmt_inspection_fk;
