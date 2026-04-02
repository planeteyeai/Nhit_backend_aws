import 'dotenv/config'
import mysql from 'mysql2/promise'

const p = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: +process.env.MYSQL_PORT,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
})

const b = {
  project_name: 'Test Project',
  state_id: '27',
  zone: 'AP-01',
  road_type: 'NH',
  highway_no: '44',
  chainage: '100+200',
  bridge_no: 'B-11',
  bridge_identity_no: 'TEST-BRIDGE-001',
  status: 'Pending',
  bmc_status: 'No',
}

try {
  const [tplRows] = await p.query('SELECT * FROM bridge ORDER BY bridge_id ASC LIMIT 1')
  const tpl = tplRows[0] || {}
  delete tpl.bridge_id
  const normalized = {
    ...tpl,
    ...b,
    bridge_images: tpl.bridge_images ?? '',
    status: b.status || 'Pending',
    bmc_status: b.bmc_status || 'No',
    bmc_user: Number(tpl.bmc_user || 0),
    is_inspecion_schedule: tpl.is_inspecion_schedule || 'No',
    created_by: Number(tpl.created_by || 0),
    updated_by: Number(tpl.updated_by || 0),
    created_on: new Date(),
    updated_on: new Date(),
  }
  const use = Object.keys(normalized).filter((k) => normalized[k] !== undefined)
  const [r] = await p.query(
    `INSERT INTO bridge (${use.join(', ')}) VALUES (${use.map(() => '?').join(', ')})`,
    use.map((c) => normalized[c])
  )
  console.log('inserted', r.insertId)
} catch (e) {
  console.error('insert error', e.code, e.message)
}

await p.end()

