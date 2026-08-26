import mysql from 'mysql2/promise'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'

dotenv.config()

const OFFSET = 10000
const outCsv = path.resolve('backups/bridge-id-map-database_Bms.csv')
const outJson = path.resolve('backups/bridge-id-map-database_Bms.json')

const conn = await mysql.createConnection({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  ssl: { rejectUnauthorized: false },
})

const [oldRows] = await conn.query(`
  SELECT
    'old_dump' AS source,
    s.bridge_id AS original_bridge_id,
    s.bridge_id + 10000 AS database_bms_bridge_id,
    d.bridge_id IS NOT NULL AS in_bms,
    COALESCE(d.chainage, s.chainage) AS chainage,
    COALESCE(d.bridge_side, s.bridge_side) AS bridge_side,
    COALESCE(d.bridge_no, s.bridge_no) AS bridge_no,
    COALESCE(d.bridge_identity_no, s.bridge_identity_no) AS bridge_identity_no,
    COALESCE(d.highway_no, s.highway_no) AS highway_no,
    COALESCE(d.popular_name_of_bridge, s.popular_name_of_bridge) AS popular_name
  FROM ramsneyv_bms_staging.bridge s
  LEFT JOIN database_Bms.bridge d ON d.bridge_id = s.bridge_id + 10000
  ORDER BY s.bridge_id
`)

const [railRows] = await conn.query(`
  SELECT
    'railway' AS source,
    r.bridge_id AS original_bridge_id,
    r.bridge_id AS database_bms_bridge_id,
    d.bridge_id IS NOT NULL AS in_bms,
    COALESCE(d.chainage, r.chainage) AS chainage,
    COALESCE(d.bridge_side, r.bridge_side) AS bridge_side,
    COALESCE(d.bridge_no, r.bridge_no) AS bridge_no,
    COALESCE(d.bridge_identity_no, r.bridge_identity_no) AS bridge_identity_no,
    COALESCE(d.highway_no, r.highway_no) AS highway_no,
    COALESCE(d.popular_name_of_bridge, r.popular_name_of_bridge) AS popular_name
  FROM railway.bridge r
  LEFT JOIN database_Bms.bridge d ON d.bridge_id = r.bridge_id
  ORDER BY r.bridge_id
`)

await conn.end()

function clean(v) {
  return v == null ? '' : String(v)
}

const rows = [...oldRows, ...railRows].map((r) => ({
  source: r.source,
  original_bridge_id: Number(r.original_bridge_id),
  database_bms_bridge_id: Number(r.database_bms_bridge_id),
  in_bms: Boolean(r.in_bms),
  chainage: clean(r.chainage),
  bridge_side: clean(r.bridge_side),
  bridge_no: clean(r.bridge_no),
  bridge_identity_no: clean(r.bridge_identity_no),
  highway_no: clean(r.highway_no),
  popular_name: clean(r.popular_name),
}))

const missing = rows.filter((r) => !r.in_bms)
console.log(
  JSON.stringify({
    offset: OFFSET,
    old: oldRows.length,
    railway: railRows.length,
    missing: missing.length,
  }),
)

const header = [
  'source',
  'original_bridge_id',
  'database_bms_bridge_id',
  'chainage',
  'bridge_side',
  'bridge_no',
  'highway_no',
  'bridge_identity_no',
  'popular_name',
]
const csvEsc = (v) => `"${String(v).replace(/"/g, '""')}"`
const csv = [header.join(','), ...rows.map((r) => header.map((k) => csvEsc(r[k])).join(','))].join('\n')
fs.writeFileSync(outCsv, csv)
fs.writeFileSync(
  outJson,
  JSON.stringify({ offset: OFFSET, oldCount: oldRows.length, railwayCount: railRows.length, missing: missing.length, rows }),
)
console.log('csv', outCsv)
