import mysql from 'mysql2/promise'
import dotenv from 'dotenv'

dotenv.config()

const conn = await mysql.createConnection({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  ssl: { rejectUnauthorized: false },
})

const [old] = await conn.query(`
  SELECT
    s.bridge_id,
    s.chainage AS old_chainage,
    d.chainage AS bms_chainage,
    s.bridge_side AS old_side,
    d.bridge_side AS bms_side
  FROM ramsneyv_bms_staging.bridge s
  INNER JOIN database_Bms.bridge d ON d.bridge_id = s.bridge_id
`)

const [rail] = await conn.query(`
  SELECT
    r.bridge_id AS railway_id,
    r.bridge_id + 10000 AS bms_id,
    r.chainage AS railway_chainage,
    d.chainage AS bms_chainage,
    r.bridge_side AS railway_side,
    d.bridge_side AS bms_side
  FROM railway.bridge r
  INNER JOIN database_Bms.bridge d ON d.bridge_id = r.bridge_id + 10000
`)

await conn.end()

function norm(v) {
  return String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function split(rows, a, b) {
  const same = []
  const diff = []
  for (const r of rows) {
    if (norm(r[a]) === norm(r[b])) same.push(r)
    else diff.push(r)
  }
  return { same, diff }
}

const oldCh = split(old, 'old_chainage', 'bms_chainage')
const oldSide = split(old, 'old_side', 'bms_side')
const railCh = split(rail, 'railway_chainage', 'bms_chainage')
const railSide = split(rail, 'railway_side', 'bms_side')

function sample(diff, keys) {
  return diff.slice(0, 15).map((r) => Object.fromEntries(keys.map((k) => [k, r[k]])))
}

console.log(
  JSON.stringify(
    {
      old_dump: {
        rows: old.length,
        chainage_same: oldCh.same.length,
        chainage_diff: oldCh.diff.length,
        side_same: oldSide.same.length,
        side_diff: oldSide.diff.length,
        chainage_mismatches: sample(oldCh.diff, ['bridge_id', 'old_chainage', 'bms_chainage']),
        side_mismatches: sample(oldSide.diff, ['bridge_id', 'old_side', 'bms_side']),
      },
      railway: {
        rows: rail.length,
        chainage_same: railCh.same.length,
        chainage_diff: railCh.diff.length,
        side_same: railSide.same.length,
        side_diff: railSide.diff.length,
        chainage_mismatches: sample(railCh.diff, [
          'railway_id',
          'bms_id',
          'railway_chainage',
          'bms_chainage',
        ]),
        side_mismatches: sample(railSide.diff, ['railway_id', 'bms_id', 'railway_side', 'bms_side']),
      },
    },
    null,
    2,
  ),
)
