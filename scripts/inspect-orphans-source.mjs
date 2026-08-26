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

const [liveB] = await conn.query(
  `SELECT bridge_id FROM railway.bridge WHERE bridge_id IN (3,4,8,15,149)`,
)
const [liveI] = await conn.query(
  `SELECT bridge_inspection_id, bridge_id FROM railway.bridge_inspection WHERE bridge_inspection_id IN (2,3,4,5,6,7,8,18,20,22,24,25,26,39)`,
)
const [allLiveOrphan] = await conn.query(`
  SELECT i.bridge_inspection_id, i.bridge_id
  FROM railway.bridge_inspection i
  LEFT JOIN railway.bridge b ON b.bridge_id = i.bridge_id
  WHERE b.bridge_id IS NULL
`)
console.log('live bridges with those ids', liveB)
console.log('live inspections', liveI)
console.log('orphans already in railway', allLiveOrphan)

const [[schedOrphan]] = await conn.query(`
  SELECT COUNT(*) c FROM database_Bms.schedule_inspecion s
  LEFT JOIN database_Bms.bridge b ON b.bridge_id = s.bridge_id WHERE b.bridge_id IS NULL
`)
const [[adhocOrphan]] = await conn.query(`
  SELECT COUNT(*) c FROM database_Bms.schedule_adhoc_inspecion s
  LEFT JOIN database_Bms.bridge b ON b.bridge_id = s.bridge_id WHERE b.bridge_id IS NULL
`)
console.log({ schedule_orphan: schedOrphan.c, adhoc_orphan: adhocOrphan.c })

await conn.end()
