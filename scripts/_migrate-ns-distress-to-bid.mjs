/**
 * One-shot: copy active non_structural_distress rows into bridge_inspection_distress
 * when no matching BID row exists (same inspection + table_type + distress_type + measures).
 * Run: node scripts/_migrate-ns-distress-to-bid.mjs
 */
import 'dotenv/config'
import { pool } from '../src/config/db.js'
import {
  ensureBridgeInspectionDistressColumns,
  listNonStructuralTableTypeVariants,
} from '../src/lib/nonStructuralDistressDb.js'

const CANONICAL = new Map([
  ['approaches', 'approaches'],
  ['wearing coat', 'WEARING COAT'],
  ['drainage spouts and vest holes', 'DRAINAGE SPOUTS AND VEST HOLES'],
  ['handrails, parapets, crash barriers', 'HANDRAILS, PARAPETS, CRASH BARRIERS'],
  ['footpaths', 'FOOTPATHS'],
  ['utilities', 'UTILITIES'],
  ['non-structural elements', 'NON-STRUCTURAL ELEMENTS'],
])

function canon(tt) {
  return CANONICAL.get(String(tt || '').trim().toLowerCase()) || String(tt || '').trim()
}

async function main() {
  await ensureBridgeInspectionDistressColumns(pool)

  let legacy
  try {
    ;[legacy] = await pool.query(
      `SELECT * FROM non_structural_distress
       WHERE (status IS NULL OR status = '' OR LOWER(status) = 'active')
       ORDER BY id`
    )
  } catch (e) {
    console.log('No legacy table or unreadable:', e.message)
    await pool.end()
    return
  }

  console.log('Legacy active rows:', legacy.length)
  let inserted = 0
  let skipped = 0

  for (const row of legacy) {
    const tableType = canon(row.table_type)
    const inspectionId = Number(row.bridge_inspection_id || 0)
    if (!inspectionId || !tableType) {
      skipped += 1
      continue
    }

    const [dup] = await pool.query(
      `SELECT id FROM bridge_inspection_distress
       WHERE bridge_inspection_id = ?
         AND table_type = ?
         AND distress_type = ?
         AND IFNULL(distress_length,0) = IFNULL(?,0)
         AND IFNULL(distress_width,0) = IFNULL(?,0)
         AND IFNULL(distress_depth,0) = IFNULL(?,0)
         AND IFNULL(distance_of_distress_x,0) = IFNULL(?,0)
         AND IFNULL(distance_of_distress_y,0) = IFNULL(?,0)
         AND (status IS NULL OR status = '' OR LOWER(status) = 'active')
       LIMIT 1`,
      [
        inspectionId,
        tableType,
        row.distress_type ?? '',
        row.distress_length,
        row.distress_width,
        row.distress_depth,
        row.distance_of_distress_x,
        row.distance_of_distress_y,
      ]
    )
    if (dup.length) {
      skipped += 1
      continue
    }

    const [[mx]] = await pool.query(
      'SELECT COALESCE(MAX(id), 0) AS mx FROM bridge_inspection_distress'
    )
    const id = Number(mx.mx || 0) + 1
    await pool.query(
      `INSERT INTO bridge_inspection_distress
       (id, bridge_inspection_id, table_type, element_type, element_description, distress_type, field_type, name_of_span,
        distress_length, distress_width, distress_depth, distress_nos, distance_of_distress_x, distance_of_distress_y,
        abutment_A1, abutment_A2, piers, spans, foundation, expansion, lhs_distress, rhs_distress,
        condition_rating, material, maintenance_required, priority_level, inspection_notes, images, status,
        created_by, created_on, repair_methodology)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        inspectionId,
        tableType,
        row.element_type ?? null,
        row.element_description ?? null,
        row.distress_type ?? '',
        row.field_type ?? null,
        row.name_of_span ?? null,
        row.distress_length ?? 0,
        row.distress_width ?? 0,
        row.distress_depth ?? 0,
        row.distress_nos ?? null,
        row.distance_of_distress_x ?? 0,
        row.distance_of_distress_y ?? 0,
        row.abutment_A1 ?? 0,
        row.abutment_A2 ?? 0,
        row.piers ?? 0,
        row.spans ?? 0,
        row.foundation ?? 0,
        row.expansion ?? 0,
        row.lhs_distress ?? 0,
        row.rhs_distress ?? 0,
        row.condition_rating ?? null,
        row.material ?? null,
        row.maintenance_required ?? null,
        row.priority_level ?? null,
        row.inspection_notes ?? null,
        row.images ?? null,
        'Active',
        row.created_by ?? null,
        row.created_on || new Date(),
        row.repair_methodology ?? null,
      ]
    )
    inserted += 1
    console.log('Migrated legacy id', row.id, '→ BID id', id, tableType)
  }

  const variants = listNonStructuralTableTypeVariants()
  const [bidNs] = await pool.query(
    `SELECT table_type, COUNT(*) AS c
     FROM bridge_inspection_distress
     WHERE table_type IN (${variants.map(() => '?').join(',')})
       AND (status IS NULL OR status = '' OR LOWER(status) = 'active')
     GROUP BY table_type
     ORDER BY table_type`,
    variants
  )
  console.log('Inserted:', inserted, 'Skipped (dup/invalid):', skipped)
  console.log('BID NS counts after migration:')
  for (const r of bidNs) console.log(`  ${r.table_type}: ${r.c}`)

  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
