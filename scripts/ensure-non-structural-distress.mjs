import { pool } from '../src/config/db.js'
import { ensureNonStructuralDistressTable } from '../src/lib/nonStructuralDistressDb.js'

await ensureNonStructuralDistressTable(pool)
const [rows] = await pool.query("SHOW TABLES LIKE 'non_structural_distress'")
console.log('Table exists:', rows.length > 0)
await pool.end()
