/**
 * Add inventory Structural Form option: T Beam Slab
 * Usage: node scripts/add-structural-form-t-beam-slab.mjs
 */
import dotenv from 'dotenv'
import mysql from 'mysql2/promise'

dotenv.config()

const pool = await mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  ssl: String(process.env.MYSQL_SSL || '') === '1' ? { rejectUnauthorized: false } : undefined,
  connectionLimit: 2,
})

const CODE = '31'
const LABEL = 'T Beam Slab'

try {
  const [existing] = await pool.query(
    `SELECT * FROM structural_form
     WHERE structural_form_code = ? OR LOWER(structural_form_description) = LOWER(?)`,
    [CODE, LABEL]
  )

  if (existing.length) {
    console.log('[structural_form] already present:', existing)
  } else {
    const [result] = await pool.query(
      `INSERT INTO structural_form (structural_form_code, structural_form_description)
       VALUES (?, ?)`,
      [CODE, LABEL]
    )
    console.log('[structural_form] inserted', { sf_id: result.insertId, code: CODE, label: LABEL })
  }

  const [rows] = await pool.query(
    `SELECT * FROM structural_form
     WHERE structural_form_code IN ('04', ?) OR structural_form_description LIKE '%T Beam%'
     ORDER BY structural_form_code`,
    [CODE]
  )
  console.log(JSON.stringify(rows, null, 2))
} finally {
  await pool.end()
}
