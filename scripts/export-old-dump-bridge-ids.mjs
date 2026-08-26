import mysql from 'mysql2/promise'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'

dotenv.config()

const OFFSET = 10000
const outCsv = path.resolve('backups/ramsneyv_bms-to-database_Bms-bridge-ids.csv')

const conn = await mysql.createConnection({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  ssl: { rejectUnauthorized: false },
})

const [rows] = await conn.query(
  `
  SELECT
    s.bridge_id AS ramsneyv_bms_bridge_id,
    d.bridge_id AS database_bms_bridge_id,
    d.chainage,
    d.bridge_side
  FROM ramsneyv_bms_staging.bridge s
  INNER JOIN database_Bms.bridge d ON d.bridge_id = s.bridge_id + ?
  ORDER BY s.bridge_id
`,
  [OFFSET],
)

const [missing] = await conn.query(
  `
  SELECT s.bridge_id
  FROM ramsneyv_bms_staging.bridge s
  LEFT JOIN database_Bms.bridge d ON d.bridge_id = s.bridge_id + ?
  WHERE d.bridge_id IS NULL
`,
  [OFFSET],
)

await conn.end()

const csvEsc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
const header = ['ramsneyv_bms_bridge_id', 'database_bms_bridge_id', 'chainage', 'bridge_side']
const csv = [
  header.join(','),
  ...rows.map((r) => header.map((k) => csvEsc(r[k])).join(',')),
].join('\n')
fs.writeFileSync(outCsv, csv)
console.log(JSON.stringify({ mapped: rows.length, missing: missing.length, file: outCsv, sample: rows.slice(0, 3) }))
