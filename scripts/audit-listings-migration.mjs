import mysql from 'mysql2/promise'
import dotenv from 'dotenv'
import jwt from 'jsonwebtoken'

dotenv.config()

const conn = await mysql.createConnection({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  ssl: { rejectUnauthorized: false },
})

async function tableSet(schema) {
  const [rows] = await conn.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema=? AND table_type='BASE TABLE'`,
    [schema],
  )
  return new Set(rows.map((r) => r.TABLE_NAME || r.table_name))
}

async function cols(schema, table) {
  const [rows] = await conn.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema=? AND table_name=?`,
    [schema, table],
  )
  return new Set(rows.map((r) => r.COLUMN_NAME || r.column_name))
}

const schemas = ['railway', 'ramsneyv_bms_staging', 'database_Bms']
const sets = {}
for (const s of schemas) sets[s] = await tableSet(s)

function diff(a, b) {
  return [...a].filter((x) => !b.has(x)).sort()
}

console.log('TABLES railway', sets.railway.size, 'staging', sets.ramsneyv_bms_staging.size, 'bms', sets.database_Bms.size)
console.log('in railway not bms', diff(sets.railway, sets.database_Bms))
console.log('in staging not bms', diff(sets.ramsneyv_bms_staging, sets.database_Bms))
console.log('in bms not railway', diff(sets.database_Bms, sets.railway))

const liveCols = await cols('railway', 'bridge')
const bmsCols = await cols('database_Bms', 'bridge')
const oldCols = await cols('ramsneyv_bms_staging', 'bridge')
console.log('bridge cols railway not bms', diff(liveCols, bmsCols))
console.log('bridge cols bms not railway', diff(bmsCols, liveCols))
console.log('bridge cols staging not bms', diff(oldCols, bmsCols))

const neededInspect = [
  'bridge_inspection_id',
  'status',
  'bmc_inspection_status',
  'created_on',
  'zone_id',
  'state_id',
]
const ic = await cols('database_Bms', 'bridge_inspection')
console.log(
  'inspection missing',
  neededInspect.filter((c) => !ic.has(c)),
)

const [[rb]] = await conn.query('SELECT COUNT(*) c FROM railway.bridge')
const [[sb]] = await conn.query('SELECT COUNT(*) c FROM ramsneyv_bms_staging.bridge')
const [[db]] = await conn.query('SELECT COUNT(*) c FROM database_Bms.bridge')
const [[ri]] = await conn.query('SELECT COUNT(*) c FROM railway.bridge_inspection')
const [[si]] = await conn.query('SELECT COUNT(*) c FROM ramsneyv_bms_staging.bridge_inspection')
const [[di]] = await conn.query('SELECT COUNT(*) c FROM database_Bms.bridge_inspection')
console.log({ bridges: { railway: rb.c, staging: sb.c, bms: db.c, expected: rb.c + sb.c }, inspections: { railway: ri.c, staging: si.c, bms: di.c, expected: ri.c + si.c } })

const [[orphI]] = await conn.query(`
  SELECT COUNT(*) c FROM database_Bms.bridge_inspection i
  LEFT JOIN database_Bms.bridge b ON b.bridge_id = i.bridge_id
  WHERE b.bridge_id IS NULL
`)
const [[orphOld]] = await conn.query(`
  SELECT COUNT(*) c FROM ramsneyv_bms_staging.bridge s
  LEFT JOIN database_Bms.bridge d ON d.bridge_id = s.bridge_id + 10000
  WHERE d.bridge_id IS NULL
`)
const [[orphLive]] = await conn.query(`
  SELECT COUNT(*) c FROM railway.bridge r
  LEFT JOIN database_Bms.bridge d ON d.bridge_id = r.bridge_id
  WHERE d.bridge_id IS NULL
`)
console.log({ orphan_inspections: orphI.c, missing_old_in_bms: orphOld.c, missing_live_in_bms: orphLive.c })

const codeTables = [
  'age_of_bridge',
  'type_of_bridge',
  'structural_form',
  'material_of_construction',
  'zone',
  'state',
  'bridge_side',
  'schedule_inspecion',
  'schedule_adhoc_inspecion',
  'bridge_rejection_comment',
  'bridge_inspection_rejection_comment',
]
const missingCode = codeTables.filter((t) => !sets.database_Bms.has(t))
console.log('code tables missing in bms', missingCode)

await conn.end()

const token = jwt.sign(
  { uid: 1, username: 'check', role: 'siteengg' },
  process.env.JWT_SECRET || 'your-jwt-secret-from-production',
  { expiresIn: '1h' },
)
const h = { Authorization: 'Bearer ' + token }
const paths = [
  '/bridge-list?page=1&limit=5',
  '/bmc/bridge/index/pending',
  '/bmc/bridge/index/approved',
  '/bmc/bridge/index/rejected',
  '/schedule-inspection-list?page=1&limit=5',
  '/ongoing-inspection-list?page=1&limit=5',
  '/approved-inspection-list?page=1&limit=5',
  '/rejected-inspection-list?page=1&limit=5',
  '/pending-approval-inspection-list?page=1&limit=5',
  '/users?page=1&limit=5',
  '/dashboard/counts',
  '/bridge/get_projects',
  '/bridge/get_states',
  '/bridge/options/type_of_bridge',
  '/states',
]
for (const p of paths) {
  try {
    const r = await fetch('http://localhost:8080' + p, { headers: h })
    const t = await r.text()
    let j
    try {
      j = JSON.parse(t)
    } catch {
      j = { raw: t.slice(0, 180) }
    }
    const n = Array.isArray(j) ? j.length : Array.isArray(j.data) ? j.data.length : j.totalBridges ?? null
    const err = j.message || j.error || ''
    console.log('API', r.status, p, 'n=' + n, 'total=' + (j.total ?? ''), err)
  } catch (e) {
    console.log('API ERR', p, e.message)
  }
}
