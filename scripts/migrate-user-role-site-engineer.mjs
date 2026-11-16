/**
 * Apply 011: users.user_role Admin → Site Engineer on the configured MySQL DB.
 */
import mysql from 'mysql2/promise'
import dotenv from 'dotenv'

dotenv.config()

const NEW_ENUM = `'Site Engineer','BMC','Sales','Purchase','QC','Logistics','Accounts','Stores','Super Admin'`
const BOTH_ENUM = `'Admin','BMC','Sales','Purchase','QC','Logistics','Accounts','Stores','Super Admin','Site Engineer'`

function parseEnum(typeStr) {
  const m = String(typeStr || '').match(/^enum\((.*)\)$/i)
  if (!m) return []
  return m[1].split(',').map((p) => p.trim().replace(/^'|'$/g, '').replace(/''/g, "'"))
}

async function main() {
  const useSsl = process.env.MYSQL_SSL === '1' || process.env.MYSQL_SSL === 'true'
  const rejectUnauthorized = !['0', 'false'].includes(
    String(process.env.MYSQL_SSL_REJECT_UNAUTHORIZED || '').toLowerCase()
  )
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    ssl: useSsl ? { rejectUnauthorized } : undefined,
  })

  try {
    const [cols] = await conn.query(
      `SHOW COLUMNS FROM users LIKE 'user_role'`
    )
    const col = cols[0]
    if (!col) throw new Error('users.user_role column not found')
    const values = parseEnum(col.Type)
    console.log('current enum:', values.join(', '))

    const hasAdmin = values.includes('Admin')
    const hasSite = values.includes('Site Engineer')

    if (!hasAdmin && hasSite) {
      const [rows] = await conn.query(
        `SELECT user_role, COUNT(*) AS c FROM users GROUP BY user_role ORDER BY user_role`
      )
      console.log('already migrated')
      console.log(rows)
      return
    }

    if (!hasSite) {
      await conn.query(`ALTER TABLE users MODIFY COLUMN \`user_role\` ENUM(${BOTH_ENUM}) NOT NULL`)
      console.log('added Site Engineer to ENUM')
    }

    const [upd] = await conn.query(`UPDATE users SET user_role = 'Site Engineer' WHERE user_role = 'Admin'`)
    console.log('rows renamed Admin → Site Engineer:', upd.affectedRows)

    await conn.query(`ALTER TABLE users MODIFY COLUMN \`user_role\` ENUM(${NEW_ENUM}) NOT NULL`)
    console.log('removed Admin from ENUM')

    const [afterCols] = await conn.query(`SHOW COLUMNS FROM users LIKE 'user_role'`)
    console.log('new enum:', parseEnum(afterCols[0].Type).join(', '))
    const [rows] = await conn.query(
      `SELECT user_role, COUNT(*) AS c FROM users GROUP BY user_role ORDER BY user_role`
    )
    console.log(rows)
  } finally {
    await conn.end()
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
