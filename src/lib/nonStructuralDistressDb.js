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
  await ensureNonStructuralDistressColumns(pool)
  tablesReady = true
}

let nonStructuralDistressColumnsReady = false

export async function ensureNonStructuralDistressColumns(pool) {
  if (nonStructuralDistressColumnsReady) return
  const [cols] = await pool.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'non_structural_distress'`
  )
  const colSet = new Set((cols || []).map((r) => String(r.COLUMN_NAME || '').toLowerCase()))
  if (!colSet.has('images')) {
    await pool.query('ALTER TABLE non_structural_distress ADD COLUMN images TEXT NULL')
  }
  nonStructuralDistressColumnsReady = true
}

let bridgeDistressColumnsReady = false

export async function ensureBridgeInspectionDistressColumns(pool) {
  if (bridgeDistressColumnsReady) return
  const [cols] = await pool.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bridge_inspection_distress'`
  )
  const colSet = new Set((cols || []).map((r) => String(r.COLUMN_NAME || '').toLowerCase()))
  const addIfMissing = async (name, ddl) => {
    if (colSet.has(name.toLowerCase())) return
    await pool.query(`ALTER TABLE bridge_inspection_distress ADD COLUMN ${ddl}`)
    colSet.add(name.toLowerCase())
  }
  // Non-structural distress now lives in this table — keep compatible columns.
  await addIfMissing('images', 'images TEXT NULL')
  await addIfMissing('distress_nos', 'distress_nos INT DEFAULT NULL')
  await addIfMissing('repair_methodology', 'repair_methodology TEXT NULL')
  await addIfMissing('element_type', 'element_type VARCHAR(255) NULL')
  await addIfMissing('element_description', 'element_description TEXT NULL')
  await addIfMissing('condition_rating', 'condition_rating VARCHAR(255) NULL')
  await addIfMissing('material', 'material VARCHAR(255) NULL')
  await addIfMissing('maintenance_required', 'maintenance_required VARCHAR(255) NULL')
  await addIfMissing('priority_level', 'priority_level VARCHAR(255) NULL')
  await addIfMissing('inspection_notes', 'inspection_notes TEXT NULL')
  await addIfMissing('status', "status VARCHAR(255) NULL DEFAULT 'Active'")
  await addIfMissing('updated_by', 'updated_by INT NULL')
  await addIfMissing('updated_on', 'updated_on DATETIME NULL')
  bridgeDistressColumnsReady = true
}

/** All table_type values historically used for non-structural distress rows. */
export function listNonStructuralTableTypeVariants() {
  return [
    'approaches',
    'Approaches',
    'WEARING COAT',
    'Wearing Coat',
    'wearing coat',
    'DRAINAGE SPOUTS AND VEST HOLES',
    'Drainage Spouts And Vest Holes',
    'drainage spouts and vest holes',
    'HANDRAILS, PARAPETS, CRASH BARRIERS',
    'Handrails Parapets Crash Barriers',
    'handrails, parapets, crash barriers',
    'FOOTPATHS',
    'Footpaths',
    'footpaths',
    'UTILITIES',
    'Utilities',
    'utilities',
    'NON-STRUCTURAL ELEMENTS',
    'non-structural elements',
  ]
}

let wearingCoatColumnsReady = false

/** Wearing coat inspection row stores inline surface-condition distress measures. */
export async function ensureWearingCoatInspectionColumns(pool) {
  if (wearingCoatColumnsReady) return
  const [cols] = await pool.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wearing_coat'`
  )
  const colSet = new Set((cols || []).map((r) => String(r.COLUMN_NAME || '').toLowerCase()))
  const addIfMissing = async (name, ddl) => {
    if (colSet.has(name.toLowerCase())) return
    await pool.query(`ALTER TABLE wearing_coat ADD COLUMN ${ddl}`)
    colSet.add(name.toLowerCase())
  }
  await addIfMissing('surface_condition_distress_type', 'surface_condition_distress_type VARCHAR(256) NULL')
  await addIfMissing('surface_condition_distress_nos', 'surface_condition_distress_nos VARCHAR(64) NULL')
  await addIfMissing('distress_distance_x', 'distress_distance_x VARCHAR(64) NULL')
  await addIfMissing('distress_distance_y', 'distress_distance_y VARCHAR(64) NULL')
  wearingCoatColumnsReady = true
}
