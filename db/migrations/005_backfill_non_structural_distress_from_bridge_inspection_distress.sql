-- Backfill migration:
-- Move existing non-structural distress rows from bridge_inspection_distress
-- into non_structural_distress for supported component table_types.
--
-- Safe to run multiple times:
-- - Uses NOT EXISTS guard to avoid duplicate logical rows.

START TRANSACTION;

INSERT INTO non_structural_distress (
  bridge_inspection_id,
  table_type,
  element_type,
  element_description,
  distress_type,
  field_type,
  name_of_span,
  distress_length,
  distress_width,
  distress_depth,
  distress_nos,
  distance_of_distress_x,
  distance_of_distress_y,
  abutment_A1,
  abutment_A2,
  piers,
  spans,
  foundation,
  expansion,
  lhs_distress,
  rhs_distress,
  condition_rating,
  material,
  maintenance_required,
  priority_level,
  inspection_notes,
  images,
  status,
  created_by,
  created_on,
  updated_by,
  updated_on,
  repair_methodology
)
SELECT
  b.bridge_inspection_id,
  CASE LOWER(TRIM(b.table_type))
    WHEN 'approaches' THEN 'approaches'
    WHEN 'wearing coat' THEN 'WEARING COAT'
    WHEN 'drainage spouts and vest holes' THEN 'DRAINAGE SPOUTS AND VEST HOLES'
    WHEN 'handrails, parapets, crash barriers' THEN 'HANDRAILS, PARAPETS, CRASH BARRIERS'
    WHEN 'footpaths' THEN 'FOOTPATHS'
    WHEN 'utilities' THEN 'UTILITIES'
    WHEN 'non-structural elements' THEN 'NON-STRUCTURAL ELEMENTS'
    ELSE b.table_type
  END AS table_type,
  NULL AS element_type,
  NULL AS element_description,
  b.distress_type,
  b.field_type,
  b.name_of_span,
  COALESCE(b.distress_length, 0),
  COALESCE(b.distress_width, 0),
  COALESCE(b.distress_depth, 0),
  b.distress_nos,
  COALESCE(b.distance_of_distress_x, 0),
  COALESCE(b.distance_of_distress_y, 0),
  COALESCE(b.abutment_A1, 0),
  COALESCE(b.abutment_A2, 0),
  COALESCE(b.piers, 0),
  COALESCE(b.spans, 0),
  COALESCE(b.foundation, 0),
  COALESCE(b.expansion, 0),
  COALESCE(b.lhs_distress, 0),
  COALESCE(b.rhs_distress, 0),
  NULL AS condition_rating,
  NULL AS material,
  NULL AS maintenance_required,
  NULL AS priority_level,
  NULL AS inspection_notes,
  NULL AS images,
  COALESCE(NULLIF(TRIM(b.status), ''), 'Active') AS status,
  b.created_by,
  COALESCE(b.created_on, NOW()) AS created_on,
  b.updated_by,
  COALESCE(b.updated_on, NOW()) AS updated_on,
  b.repair_methodology
FROM bridge_inspection_distress b
WHERE LOWER(TRIM(b.table_type)) IN (
  'approaches',
  'wearing coat',
  'drainage spouts and vest holes',
  'handrails, parapets, crash barriers',
  'footpaths',
  'utilities',
  'non-structural elements'
)
AND NOT EXISTS (
  SELECT 1
  FROM non_structural_distress n
  WHERE n.bridge_inspection_id = b.bridge_inspection_id
    AND LOWER(TRIM(n.table_type)) = LOWER(TRIM(
      CASE LOWER(TRIM(b.table_type))
        WHEN 'approaches' THEN 'approaches'
        WHEN 'wearing coat' THEN 'WEARING COAT'
        WHEN 'drainage spouts and vest holes' THEN 'DRAINAGE SPOUTS AND VEST HOLES'
        WHEN 'handrails, parapets, crash barriers' THEN 'HANDRAILS, PARAPETS, CRASH BARRIERS'
        WHEN 'footpaths' THEN 'FOOTPATHS'
        WHEN 'utilities' THEN 'UTILITIES'
        WHEN 'non-structural elements' THEN 'NON-STRUCTURAL ELEMENTS'
        ELSE b.table_type
      END
    ))
    AND IFNULL(TRIM(n.distress_type), '') = IFNULL(TRIM(b.distress_type), '')
    AND IFNULL(TRIM(n.field_type), '') = IFNULL(TRIM(b.field_type), '')
    AND IFNULL(TRIM(n.name_of_span), '') = IFNULL(TRIM(b.name_of_span), '')
    AND IFNULL(n.distress_length, 0) = IFNULL(b.distress_length, 0)
    AND IFNULL(n.distress_width, 0) = IFNULL(b.distress_width, 0)
    AND IFNULL(n.distress_depth, 0) = IFNULL(b.distress_depth, 0)
    AND IFNULL(n.distress_nos, -1) = IFNULL(b.distress_nos, -1)
    AND IFNULL(n.distance_of_distress_x, 0) = IFNULL(b.distance_of_distress_x, 0)
    AND IFNULL(n.distance_of_distress_y, 0) = IFNULL(b.distance_of_distress_y, 0)
);

COMMIT;

