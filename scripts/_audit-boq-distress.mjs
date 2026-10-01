import 'dotenv/config'
import { pool } from '../src/config/db.js'

const NS = new Set([
  'approaches',
  'wearing coat',
  'drainage spouts and vest holes',
  'handrails, parapets, crash barriers',
  'footpaths',
  'utilities',
  'non-structural elements',
])
const isNs = (tt) => NS.has(String(tt || '').trim().toLowerCase())

const [[insp]] = await pool.query(`
  SELECT i.bridge_inspection_id, i.bridge_id, i.status, i.bmc_inspection_status, b.bridge_identity_no
  FROM bridge_inspection i
  LEFT JOIN bridge b ON b.bridge_id = i.bridge_id
  WHERE (i.bmc_inspection_status = 'Approved' OR i.status = 'Approved')
  ORDER BY i.bridge_inspection_id DESC
  LIMIT 1
`)

if (!insp) {
  console.log('No approved inspection')
  await pool.end()
  process.exit(0)
}
console.log('Inspection', insp)

const [rows] = await pool.query(
  `SELECT id, table_type, distress_type, distress_length, distress_width, distress_depth,
          distress_nos, status, repair_methodology
   FROM bridge_inspection_distress
   WHERE bridge_inspection_id = ?
   ORDER BY id`,
  [insp.bridge_inspection_id],
)

const active = rows.filter(
  (r) => !r.status || r.status === '' || String(r.status).toLowerCase() === 'active',
)
const structural = active.filter((r) => !isNs(r.table_type))
const nonStructural = active.filter((r) => isNs(r.table_type))
console.log('Total rows', rows.length, 'active', active.length)
console.log('Structural', structural.length, 'NonStructural', nonStructural.length)
const counts = {}
for (const r of active) {
  const k = r.table_type || '(empty)'
  counts[k] = (counts[k] || 0) + 1
}
console.log('By table_type:', counts)
console.log(
  'Sample structural:',
  structural.slice(0, 3).map((r) => ({
    id: r.id,
    table_type: r.table_type,
    distress_type: r.distress_type,
    L: r.distress_length,
    W: r.distress_width,
    D: r.distress_depth,
  })),
)
console.log(
  'Sample NS:',
  nonStructural.slice(0, 3).map((r) => ({
    id: r.id,
    table_type: r.table_type,
    distress_type: r.distress_type,
    L: r.distress_length,
    W: r.distress_width,
    D: r.distress_depth,
  })),
)

// Simulate BOQ API split for a few recent inspections
const [recent] = await pool.query(`
  SELECT i.bridge_inspection_id, b.bridge_identity_no
  FROM bridge_inspection i
  LEFT JOIN bridge b ON b.bridge_id = i.bridge_id
  WHERE (i.bmc_inspection_status = 'Approved' OR i.status = 'Approved')
  ORDER BY i.bridge_inspection_id DESC
  LIMIT 8
`)
for (const row of recent) {
  const [d] = await pool.query(
    `SELECT table_type, status FROM bridge_inspection_distress WHERE bridge_inspection_id = ?`,
    [row.bridge_inspection_id],
  )
  const act = d.filter(
    (r) => !r.status || r.status === '' || String(r.status).toLowerCase() === 'active',
  )
  const s = act.filter((r) => !isNs(r.table_type)).length
  const n = act.filter((r) => isNs(r.table_type)).length
  console.log(
    `insp ${row.bridge_inspection_id} (${row.bridge_identity_no || '-'}): structural=${s} ns=${n} total=${act.length}`,
  )
}

await pool.end()
