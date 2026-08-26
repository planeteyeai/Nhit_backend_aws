import mysql from 'mysql2/promise'
import dotenv from 'dotenv'

dotenv.config()

const SRC = 'ramsneyv_bms_staging'
const DST = 'database_Bms'
const TABLE_MAP = { age_of_brdge: 'age_of_bridge' }

const conn = await mysql.createConnection({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  ssl: { rejectUnauthorized: false },
  multipleStatements: true,
})

async function tableNames(schema) {
  const [rows] = await conn.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = ? AND table_type = 'BASE TABLE'`,
    [schema],
  )
  return rows.map((r) => r.TABLE_NAME || r.table_name)
}

async function columns(schema, table) {
  const [rows] = await conn.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = ? AND table_name = ?
     ORDER BY ordinal_position`,
    [schema, table],
  )
  return rows.map((r) => r.COLUMN_NAME || r.column_name)
}

const srcTables = await tableNames(SRC)
const dstTables = new Set(await tableNames(DST))
console.log(`staging tables: ${srcTables.length}, database_Bms tables: ${dstTables.size}`)

const jobs = []
for (const src of srcTables) {
  const dst = TABLE_MAP[src] || src
  if (!dstTables.has(dst)) {
    console.log(`SKIP (no dest table): ${src}`)
    continue
  }
  jobs.push({ src, dst })
}

await conn.query('SET SESSION sql_mode = ?', ['NO_ENGINE_SUBSTITUTION,ALLOW_INVALID_DATES'])
await conn.query('SET FOREIGN_KEY_CHECKS = 0')
await conn.query('SET UNIQUE_CHECKS = 0')

for (const { src, dst } of jobs) {
  const srcCols = await columns(SRC, src)
  const dstCols = await columns(DST, dst)
  const shared = srcCols.filter((c) => dstCols.includes(c))
  if (!shared.length) {
    console.log(`SKIP (no shared columns): ${src} -> ${dst}`)
    continue
  }
  const quoted = shared.map((c) => `\`${c}\``).join(', ')
  console.log(`COPY ${src} -> ${DST}.${dst} (${shared.length} cols)`)
  await conn.query(`TRUNCATE TABLE \`${DST}\`.\`${dst}\``)
  const [result] = await conn.query(
    `INSERT INTO \`${DST}\`.\`${dst}\` (${quoted})
     SELECT ${quoted} FROM \`${SRC}\`.\`${src}\``,
  )
  console.log(`  inserted ${result.affectedRows}`)
}

for (const { dst } of jobs) {
  const cols = await columns(DST, dst)
  const [pkRows] = await conn.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = ? AND table_name = ? AND extra LIKE '%auto_increment%'`,
    [DST, dst],
  )
  const pk = pkRows[0]?.COLUMN_NAME || pkRows[0]?.column_name
  if (!pk || !cols.includes(pk)) continue
  const [mx] = await conn.query(`SELECT COALESCE(MAX(\`${pk}\`), 0) + 1 AS n FROM \`${DST}\`.\`${dst}\``)
  const n = Number(mx[0].n || 1)
  try {
    await conn.query(`ALTER TABLE \`${DST}\`.\`${dst}\` AUTO_INCREMENT = ${n}`)
  } catch (e) {
    console.log(`  auto_inc skip ${dst}: ${e.message}`)
  }
}

await conn.query('SET UNIQUE_CHECKS = 1')
await conn.query('SET FOREIGN_KEY_CHECKS = 1')

const checks = ['bridge', 'bridge_inspection', 'users', 'zone', 'approaches']
for (const t of checks) {
  const [[a]] = await conn.query(`SELECT COUNT(*) AS c FROM \`${SRC}\`.\`${t}\``).catch(() => [[{ c: 'n/a' }]])
  const [[b]] = await conn.query(`SELECT COUNT(*) AS c FROM \`${DST}\`.\`${t}\``)
  console.log(`VERIFY ${t}: staging=${a.c} database_Bms=${b.c}`)
}

await conn.end()
console.log('migration complete')
