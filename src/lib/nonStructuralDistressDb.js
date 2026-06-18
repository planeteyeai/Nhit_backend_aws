let tablesReady = false

export async function ensureNonStructuralDistressTable(pool) {
  if (tablesReady) return
  await pool.query(`
    CREATE TABLE IF NOT EXISTS non_structural_distress (
      id INT NOT NULL AUTO_INCREMENT,
      bridge_inspection_id INT NOT NULL,
      table_type VARCHAR(256) NOT NULL,
      element_type VARCHAR(255) DEFAULT NULL,
      element_description TEXT,
      distress_type VARCHAR(256) NOT NULL,
      field_type VARCHAR(256) DEFAULT NULL,
      name_of_span VARCHAR(255) DEFAULT NULL,
      distress_length DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
      distress_width DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
      distress_depth DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
      distress_nos INT DEFAULT NULL,
      distance_of_distress_x DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
      distance_of_distress_y DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
      abutment_A1 INT NOT NULL DEFAULT 0,
      abutment_A2 INT NOT NULL DEFAULT 0,
      piers INT NOT NULL DEFAULT 0,
      spans INT NOT NULL DEFAULT 0,
      foundation INT NOT NULL DEFAULT 0,
      expansion INT NOT NULL DEFAULT 0,
      lhs_distress INT NOT NULL DEFAULT 0,
      rhs_distress INT NOT NULL DEFAULT 0,
      condition_rating VARCHAR(255) DEFAULT NULL,
      material VARCHAR(255) DEFAULT NULL,
      maintenance_required VARCHAR(255) DEFAULT NULL,
      priority_level VARCHAR(255) DEFAULT NULL,
      inspection_notes TEXT,
      images TEXT,
      status VARCHAR(255) DEFAULT NULL,
      created_by INT DEFAULT NULL,
      created_on DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_by INT DEFAULT NULL,
      updated_on DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      repair_methodology TEXT,
      PRIMARY KEY (id),
      INDEX idx_bridge_inspection_id (bridge_inspection_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `)
  tablesReady = true
}
