/**
 * Verify non-structural distress types save + load via bridge_inspection_distress.
 * Run: node scripts/_verify-ns-distress-bid.mjs
 */
import 'dotenv/config'
import { pool } from '../src/config/db.js'
import { ensureBridgeInspectionDistressColumns } from '../src/lib/nonStructuralDistressDb.js'

const NS_TYPES = [
  'approaches',
  'WEARING COAT',
  'DRAINAGE SPOUTS AND VEST HOLES',
  'HANDRAILS, PARAPETS, CRASH BARRIERS',
  'FOOTPATHS',
  'UTILITIES',
  'NON-STRUCTURAL ELEMENTS',
]

const VARIANTS = {
  approaches: ['approaches', 'Approaches'],
  'WEARING COAT': ['WEARING COAT', 'Wearing Coat', 'wearing coat'],
  'DRAINAGE SPOUTS AND VEST HOLES': [
    'DRAINAGE SPOUTS AND VEST HOLES',
    'Drainage Spouts And Vest Holes',
    'drainage spouts and vest holes',
  ],
  'HANDRAILS, PARAPETS, CRASH BARRIERS': [
    'HANDRAILS, PARAPETS, CRASH BARRIERS',
    'Handrails Parapets Crash Barriers',
    'handrails, parapets, crash barriers',
  ],
  FOOTPATHS: ['FOOTPATHS', 'Footpaths', 'footpaths'],
  UTILITIES: ['UTILITIES', 'Utilities', 'utilities'],
  'NON-STRUCTURAL ELEMENTS': ['NON-STRUCTURAL ELEMENTS', 'non-structural elements'],
}

async function main() {
  await ensureBridgeInspectionDistressColumns(pool)

  const [[insp]] = await pool.query(
    `SELECT bridge_inspection_id FROM bridge_inspection ORDER BY bridge_inspection_id DESC LIMIT 1`
  )
  if (!insp?.bridge_inspection_id) {
    throw new Error('No bridge_inspection row found to test against')
  }
  const inspectionId = Number(insp.bridge_inspection_id)
  console.log('Using inspectionId', inspectionId)

  const marker = `ns-bid-check-${Date.now()}`
  const createdIds = []

  for (const tableType of NS_TYPES) {
    const [[mx]] = await pool.query(
      'SELECT COALESCE(MAX(id), 0) AS mx FROM bridge_inspection_distress'
    )
    const id = Number(mx.mx || 0) + 1
    await pool.query(
      `INSERT INTO bridge_inspection_distress
       (id, bridge_inspection_id, table_type, distress_type, field_type,
        distress_length, distress_width, distress_depth, distress_nos,
        distance_of_distress_x, distance_of_distress_y,
        abutment_A1, abutment_A2, piers, spans, foundation, expansion,
        lhs_distress, rhs_distress, images, status, created_by, created_on, repair_methodology, element_type)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURDATE(),?,?)`,
      [
        id,
        inspectionId,
        tableType,
        marker,
        'lhs',
        1.1,
        0.2,
        0.05,
        2,
        3,
        4,
        0,
        0,
        0,
        0,
        0,
        0,
        1,
        0,
        null,
        'Active',
        0,
        'verify',
        tableType,
      ]
    )
    createdIds.push(id)
    console.log('INSERT ok', tableType, 'id=', id)
  }

  let fail = 0
  for (const tableType of NS_TYPES) {
    const variants = VARIANTS[tableType]
    const [rows] = await pool.query(
      `SELECT id, table_type, distress_type, status
       FROM bridge_inspection_distress
       WHERE bridge_inspection_id = ?
         AND table_type IN (${variants.map(() => '?').join(',')})
         AND distress_type = ?
         AND (status IS NULL OR status = '' OR LOWER(status) = 'active')`,
      [inspectionId, ...variants, marker]
    )
    const ok = rows.length >= 1
    console.log(ok ? 'RETRIEVE ok' : 'RETRIEVE FAIL', tableType, 'count=', rows.length)
    if (!ok) fail += 1
  }

  // Soft-delete path used by /inspection/non_structural DELETE
  for (const id of createdIds) {
    await pool.query(
      `UPDATE bridge_inspection_distress SET status = 'Inactive' WHERE id = ?`,
      [id]
    )
  }
  const [stillActive] = await pool.query(
    `SELECT id FROM bridge_inspection_distress
     WHERE id IN (${createdIds.map(() => '?').join(',')})
       AND (status IS NULL OR status = '' OR LOWER(status) = 'active')`,
    createdIds
  )
  console.log(
    stillActive.length === 0 ? 'SOFT-DELETE ok' : 'SOFT-DELETE FAIL',
    'active remaining=',
    stillActive.length
  )
  if (stillActive.length) fail += 1

  // Cleanup test rows
  await pool.query(
    `DELETE FROM bridge_inspection_distress WHERE id IN (${createdIds.map(() => '?').join(',')})`,
    createdIds
  )
  console.log('CLEANUP ok', createdIds.length, 'rows')

  // Count real NS rows currently in BID vs old table
  const variantsAll = Object.values(VARIANTS).flat()
  const [bidNs] = await pool.query(
    `SELECT table_type, COUNT(*) AS c
     FROM bridge_inspection_distress
     WHERE table_type IN (${variantsAll.map(() => '?').join(',')})
       AND (status IS NULL OR status = '' OR LOWER(status) = 'active')
     GROUP BY table_type
     ORDER BY table_type`,
    variantsAll
  )
  console.log('Live BID non-structural counts:')
  for (const r of bidNs) console.log(`  ${r.table_type}: ${r.c}`)

  try {
    const [[old]] = await pool.query(
      `SELECT COUNT(*) AS c FROM non_structural_distress WHERE status = 'Active' OR status IS NULL OR status = ''`
    )
    console.log('Legacy non_structural_distress active rows:', old?.c ?? 0)
  } catch (e) {
    console.log('Legacy non_structural_distress table:', e.message)
  }

  await pool.end()
  if (fail) {
    console.error('FAILED checks:', fail)
    process.exit(1)
  }
  console.log('ALL CHECKS PASSED')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
