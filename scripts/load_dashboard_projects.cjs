/**
 * Drop & recreate Dashboard_projects from structure-list Excel.
 *
 * Usage:
 *   node scripts/load_dashboard_projects.cjs [path-to-xlsx]
 */
require('dotenv').config()
const path = require('path')
const ExcelJS = require('exceljs')
const mysql = require('mysql2/promise')

const DEFAULT_XLSX = String.raw`C:\Users\Vishal.Bhor\Downloads\structure list (2).xlsx`
const TABLE = 'Dashboard_projects'

/** Excel header -> DB column (order = CREATE / INSERT order) */
const COLUMN_MAP = [
  { excel: 'Project Name', db: 'project_name', type: 'VARCHAR(255)' },
  { excel: 'Actual Chainage', db: 'actual_chainage', type: 'VARCHAR(50)' },
  { excel: 'Longitude', db: 'longitude', type: 'DOUBLE' },
  { excel: 'Lagtitude', db: 'latitude', type: 'DOUBLE' }, // Excel typo
  { excel: 'Structures', db: 'structures', type: 'VARCHAR(100)' },
  { excel: 'MJB', db: 'mjb', type: 'INT' },
  { excel: 'MNB', db: 'mnb', type: 'INT' },
  { excel: 'Flyover', db: 'flyover', type: 'INT' },
  { excel: 'PUP', db: 'pup', type: 'INT' },
  { excel: 'VUP', db: 'vup', type: 'INT' },
  { excel: 'ROB', db: 'rob', type: 'INT' },
  { excel: 'Slab Culvert', db: 'slab_culvert', type: 'INT' },
  { excel: 'Box Culvert', db: 'box_culvert', type: 'INT' },
]

function cellValue(cell) {
  let v = cell?.value
  if (v == null) return null
  if (typeof v === 'object') {
    if (v.text != null) v = v.text
    else if (v.result != null) v = v.result
    else if (v.richText) v = v.richText.map((t) => t.text).join('')
    else if (v instanceof Date) return v
    else return null
  }
  if (typeof v === 'string') {
    const s = v.trim()
    return s === '' ? null : s
  }
  return v
}

function toNumber(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function toInt(v) {
  const n = toNumber(v)
  return n == null ? null : Math.trunc(n)
}

/** "606+100" → 606.1 ; also accepts plain numbers */
function parseChainageKm(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const s = String(v).trim()
  const plus = s.match(/(\d+)\s*\+\s*(\d+)/)
  if (plus) return Number(plus[1]) + Number(plus[2]) / 1000
  const n = Number(s.replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

function coerce(dbCol, raw) {
  const meta = COLUMN_MAP.find((c) => c.db === dbCol)
  if (!meta) return raw
  if (meta.type.startsWith('INT')) return toInt(raw)
  if (meta.type === 'DOUBLE') return toNumber(raw)
  if (raw == null) return null
  return String(raw).trim()
}

async function main() {
  const xlsxPath = path.resolve(process.argv[2] || DEFAULT_XLSX)
  console.log('Reading Excel:', xlsxPath)

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(xlsxPath)
  const ws = wb.worksheets[0]
  if (!ws) throw new Error('No worksheet found')

  const headerRow = ws.getRow(1)
  const headerIndex = {}
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const name = String(cellValue(cell) ?? '').trim()
    if (name) headerIndex[name] = colNumber
  })
  console.log('Excel headers:', Object.keys(headerIndex).join(' | '))

  const missing = COLUMN_MAP.filter((c) => !headerIndex[c.excel]).map((c) => c.excel)
  if (missing.length) {
    throw new Error(`Missing Excel columns: ${missing.join(', ')}`)
  }

  const rows = []
  for (let r = 2; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r)
    const project = cellValue(row.getCell(headerIndex['Project Name']))
    if (project == null) continue

    const obj = {}
    for (const col of COLUMN_MAP) {
      obj[col.db] = coerce(col.db, cellValue(row.getCell(headerIndex[col.excel])))
    }
    const km = parseChainageKm(obj.actual_chainage)
    obj.actual_start_chainage = km
    obj.actual_end_chainage = km
    obj.kilometer = km
    rows.push(obj)
  }
  console.log('Parsed data rows:', rows.length)

  const byProject = {}
  for (const r of rows) {
    byProject[r.project_name] = (byProject[r.project_name] || 0) + 1
  }
  console.log('By project:', byProject)

  const pool = await mysql.createPool({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    ssl: { rejectUnauthorized: false },
    multipleStatements: true,
  })

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    await conn.query('DROP TABLE IF EXISTS `PowerBI`')
    await conn.query('DROP TABLE IF EXISTS `powerbi`')
    await conn.query(`DROP TABLE IF EXISTS \`${TABLE}\``)

    await conn.query(`
      CREATE TABLE \`${TABLE}\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`project_name\` VARCHAR(255) NULL,
        \`actual_chainage\` VARCHAR(50) NULL,
        \`actual_start_chainage\` DOUBLE NULL,
        \`actual_end_chainage\` DOUBLE NULL,
        \`kilometer\` DOUBLE NULL,
        \`longitude\` DOUBLE NULL,
        \`latitude\` DOUBLE NULL,
        \`structures\` VARCHAR(100) NULL,
        \`mjb\` INT NULL,
        \`mnb\` INT NULL,
        \`flyover\` INT NULL,
        \`pup\` INT NULL,
        \`vup\` INT NULL,
        \`rob\` INT NULL,
        \`slab_culvert\` INT NULL,
        \`box_culvert\` INT NULL,
        PRIMARY KEY (\`id\`),
        KEY \`idx_project_name\` (\`project_name\`),
        KEY \`idx_structures\` (\`structures\`),
        KEY \`idx_chainage\` (\`actual_start_chainage\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `)
    console.log(`Created table ${TABLE}`)

    const dbCols = [
      'project_name',
      'actual_chainage',
      'actual_start_chainage',
      'actual_end_chainage',
      'kilometer',
      'longitude',
      'latitude',
      'structures',
      'mjb',
      'mnb',
      'flyover',
      'pup',
      'vup',
      'rob',
      'slab_culvert',
      'box_culvert',
    ]
    const placeholders = `(${dbCols.map(() => '?').join(',')})`

    const batchSize = 200
    let inserted = 0
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize)
      const valuesSql = batch.map(() => placeholders).join(',')
      const params = batch.flatMap((row) => dbCols.map((c) => row[c] ?? null))
      await conn.query(
        `INSERT INTO \`${TABLE}\` (${dbCols.map((c) => `\`${c}\``).join(',')}) VALUES ${valuesSql}`,
        params,
      )
      inserted += batch.length
      console.log(`Inserted ${inserted}/${rows.length}`)
    }

    await conn.commit()

    const [countRows] = await conn.query(`SELECT COUNT(*) AS c FROM \`${TABLE}\``)
    const [byStruct] = await conn.query(
      `SELECT structures, COUNT(*) c FROM \`${TABLE}\` GROUP BY structures ORDER BY c DESC`,
    )
    const [sample] = await conn.query(`SELECT * FROM \`${TABLE}\` ORDER BY id ASC LIMIT 2`)
    console.log('FINAL_COUNT:', countRows[0].c)
    console.log('BY_STRUCTURE:', byStruct)
    console.log('SAMPLE:', JSON.stringify(sample, null, 2))
  } catch (e) {
    await conn.rollback()
    throw e
  } finally {
    conn.release()
    await pool.end()
  }
}

main().catch((e) => {
  console.error('FAIL:', e.message)
  process.exit(1)
})
