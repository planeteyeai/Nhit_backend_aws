import 'dotenv/config'
import mysql from 'mysql2/promise'

const p = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: +process.env.MYSQL_PORT,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
})

const [tables] = await p.query('SHOW TABLES')
const key = Object.keys(tables[0] || {})[0]
console.log('TABLES:', tables.map((r) => r[key]))

const names = ['users', 'bridge', 'state', 'bridge_inspection', 'bridge_inspection_distress', 'inspection_component_rating']
for (const n of names) {
  const [cols] = await p.query(
    `SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
    [n]
  )
  if (cols.length) console.log('\n' + n + ':', cols.map((c) => c.COLUMN_NAME).join(', '))
}

const [zc] = await p.query(
  `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'zone' ORDER BY ORDINAL_POSITION`
)
console.log('zone cols:', zc.map((x) => x.COLUMN_NAME).join(', '))

await p.end()
