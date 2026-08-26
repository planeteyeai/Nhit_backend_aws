import mysql from 'mysql2/promise'
import dotenv from 'dotenv'

dotenv.config()

const SRC = 'railway'
const DST = 'database_Bms'
const OFFSET = 10000

const LOOKUP_TABLES = new Set([
  'age_of_bridge',
  'bridge_side',
  'company_firms',
  'component_pier_rating',
  'hydraluic_tone_weightage',
  'loading_icr',
  'material_of_construction',
  'material_of_construction_bkp',
  'rating_alternate_route',
  'rating_environmental_impact',
  'rating_for_abrasion',
  'rating_for_alkali',
  'rating_for_carbon_dioxide',
  'rating_for_carbonation',
  'rating_for_economic_growth_potential',
  'rating_for_erosion',
  'rating_for_fatigue',
  'rating_for_impact',
  'rating_for_overload',
  'rating_for_social_importance',
  'rating_for_sulphates',
  'rating_for_temperature',
  'rating_for_vertical_clearance',
  'rating_of_average_daily_traffic',
  'rating_of_deck_geometry',
  'rating_of_settlement',
  'rating_of_shrinkage',
  'rating_of_waterway_adequacy',
  'road_type',
  'state',
  'state_bkp',
  'structural_crossing_feature',
  'structural_form',
  'structural_form_bkp',
  'structural_rating',
  'traffic_lane_on_bridge',
  'type_of_bridge',
  'zone',
])

const NEW_ONLY_TABLES = new Set([
  'PowerBI',
  'bms_notification',
  'bridge_inspection_3d_assets',
  'bridge_panorama_marker_images',
  'bridge_panorama_markers',
  'bridge_panorama_stations',
  'non_structural_distress',
])

const EXTRA_FK = new Set([
  'bridge_id',
  'bridge_inspection_id',
  'bearing_and_pedistal_id',
  'expansion_joint_bridge_id',
  'foundation_id',
  'spans',
])

const conn = await mysql.createConnection({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  ssl: { rejectUnauthorized: false },
  multipleStatements: true,
})

async function tables(schema) {
  const [rows] = await conn.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = ? AND table_type = 'BASE TABLE'`,
    [schema],
  )
  return rows.map((r) => r.TABLE_NAME || r.table_name)
}

async function columns(schema, table) {
  const [rows] = await conn.query(
    `SELECT column_name, extra, column_key FROM information_schema.columns
     WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position`,
    [schema, table],
  )
  return rows.map((r) => ({
    name: r.COLUMN_NAME || r.column_name,
    extra: String(r.EXTRA || r.extra || ''),
    key: String(r.COLUMN_KEY || r.column_key || ''),
  }))
}

function q(name) {
  return `\`${name}\``
}

const srcTables = await tables(SRC)
const dstSet = new Set(await tables(DST))

await conn.query("SET SESSION sql_mode = 'NO_ENGINE_SUBSTITUTION,ALLOW_INVALID_DATES'")
await conn.query('SET FOREIGN_KEY_CHECKS = 0')
await conn.query('SET UNIQUE_CHECKS = 0')

// 1) Dropdowns: add Railway rows whose PK is not already in database_Bms
for (const table of srcTables) {
  if (!LOOKUP_TABLES.has(table) || !dstSet.has(table)) continue
  const cols = await columns(DST, table)
  const srcCols = new Set((await columns(SRC, table)).map((c) => c.name))
  const shared = cols.map((c) => c.name).filter((n) => srcCols.has(n))
  const pk = cols.find((c) => c.key === 'PRI')?.name
  if (!pk || !shared.includes(pk)) {
    console.log(`LOOKUP skip ${table} (no pk)`)
    continue
  }
  const list = shared.map(q).join(', ')
  const [result] = await conn.query(
    `INSERT INTO ${q(DST)}.${q(table)} (${list})
     SELECT ${list} FROM ${q(SRC)}.${q(table)} s
     WHERE NOT EXISTS (
       SELECT 1 FROM ${q(DST)}.${q(table)} d WHERE d.${q(pk)} = s.${q(pk)}
     )`,
  )
  console.log(`LOOKUP ${table}: +${result.affectedRows}`)
}

// 2) Users: add Railway users missing by username
{
  const cols = await columns(DST, 'users')
  const srcCols = new Set((await columns(SRC, 'users')).map((c) => c.name))
  const shared = cols.map((c) => c.name).filter((n) => srcCols.has(n) && n !== 'uid')
  const list = ['uid', ...shared].filter((n, i, a) => a.indexOf(n) === i && srcCols.has(n) && cols.some((c) => c.name === n))
  const quoted = list.map(q).join(', ')
  const [result] = await conn.query(
    `INSERT INTO ${q(DST)}.users (${quoted})
     SELECT ${quoted} FROM ${q(SRC)}.users s
     WHERE NOT EXISTS (SELECT 1 FROM ${q(DST)}.users d WHERE d.username = s.username)
       AND NOT EXISTS (SELECT 1 FROM ${q(DST)}.users d WHERE d.uid = s.uid)`,
  )
  console.log(`USERS extra: +${result.affectedRows}`)
}

// 3) Remap FKs on new-only tables that still point at Railway ids
for (const table of NEW_ONLY_TABLES) {
  if (!dstSet.has(table)) continue
  const cols = await columns(DST, table)
  const names = cols.map((c) => c.name)
  const updates = []
  const where = []
  if (names.includes('bridge_id')) {
    updates.push(`bridge_id = bridge_id + ${OFFSET}`)
    where.push(`IFNULL(bridge_id, 0) BETWEEN 1 AND ${OFFSET - 1}`)
  }
  if (names.includes('bridge_inspection_id')) {
    updates.push(`bridge_inspection_id = bridge_inspection_id + ${OFFSET}`)
    where.push(`IFNULL(bridge_inspection_id, 0) BETWEEN 1 AND ${OFFSET - 1}`)
  }
  if (!updates.length) {
    console.log(`NEW-ONLY keep ${table}`)
    continue
  }
  const [result] = await conn.query(
    `UPDATE ${q(DST)}.${q(table)} SET ${updates.join(', ')} WHERE ${where.join(' OR ')}`,
  )
  console.log(`REMAP ${table}: ${result.affectedRows}`)
}

// 4) Insert Railway inventory/inspection rows with offset ids
for (const table of srcTables) {
  if (LOOKUP_TABLES.has(table) || table === 'users' || NEW_ONLY_TABLES.has(table)) continue
  if (!dstSet.has(table)) {
    console.log(`SKIP missing dest ${table}`)
    continue
  }
  const destCols = await columns(DST, table)
  const srcCols = await columns(SRC, table)
  const srcNames = new Set(srcCols.map((c) => c.name))
  const shared = destCols.map((c) => c.name).filter((n) => srcNames.has(n))
  if (!shared.length) continue

  const selectExpr = shared.map((n) => {
    const shouldOffset =
      EXTRA_FK.has(n) || srcCols.some((c) => c.name === n && c.extra.toLowerCase().includes('auto_increment'))
    return shouldOffset ? `IFNULL(${q(n)}, 0) + ${OFFSET} AS ${q(n)}` : `${q(n)}`
  })
  const insertList = shared.map(q).join(', ')
  console.log(`MERGE ${table}`)
  const [result] = await conn.query(
    `INSERT INTO ${q(DST)}.${q(table)} (${insertList})
     SELECT ${selectExpr.join(', ')} FROM ${q(SRC)}.${q(table)}`,
  )
  console.log(`  +${result.affectedRows}`)
}

await conn.query('SET UNIQUE_CHECKS = 1')
await conn.query('SET FOREIGN_KEY_CHECKS = 1')

const [[b]] = await conn.query(`SELECT COUNT(*) c FROM ${q(DST)}.bridge`)
const [[i]] = await conn.query(`SELECT COUNT(*) c FROM ${q(DST)}.bridge_inspection`)
const [[u]] = await conn.query(`SELECT COUNT(*) c FROM ${q(DST)}.users`)
const [[z]] = await conn.query(`SELECT COUNT(*) c FROM ${q(DST)}.zone`)
console.log(`RESULT database_Bms bridge=${b.c} inspection=${i.c} users=${u.c} zone=${z.c}`)
console.log(`Railway rows are at id + ${OFFSET} (bridge_id 10001+)`)

await conn.end()
