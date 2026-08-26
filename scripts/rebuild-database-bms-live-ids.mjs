import mysql from 'mysql2/promise'
import dotenv from 'dotenv'

dotenv.config()

/** Live Railway keeps original ids. Old dump (staging) is inserted at +OFFSET. */
const LIVE = 'railway'
const OLD = 'ramsneyv_bms_staging'
const DST = 'database_Bms'
const FK_OFFSET = 10000
const PK_OFFSET = 200000
const TABLE_MAP = { age_of_brdge: 'age_of_bridge' }

const LOOKUP_TABLES = new Set([
  'age_of_bridge',
  'age_of_brdge',
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

const SKIP_OFFSET_TABLES = new Set([
  'PowerBI',
  'bms_notification',
  'bridge_inspection_3d_assets',
  'bridge_panorama_marker_images',
  'bridge_panorama_markers',
  'bridge_panorama_stations',
  'non_structural_distress',
])

const FK_COLS = new Set([
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

function q(name) {
  return `\`${name}\``
}

async function tables(schema) {
  const [rows] = await conn.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = ? AND table_type = 'BASE TABLE'`,
    [schema],
  )
  return rows.map((r) => r.TABLE_NAME || r.table_name)
}

async function colMeta(schema, table) {
  const [rows] = await conn.query(
    `SELECT column_name, extra, column_key FROM information_schema.columns
     WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position`,
    [schema, table],
  )
  return rows.map((r) => ({
    name: r.COLUMN_NAME || r.column_name,
    extra: String(r.EXTRA || r.extra || '').toLowerCase(),
    key: String(r.COLUMN_KEY || r.column_key || ''),
  }))
}

function destName(srcTable) {
  return TABLE_MAP[srcTable] || srcTable
}

const liveTables = await tables(LIVE)
const oldTables = await tables(OLD)
const destTables = await tables(DST)
const destSet = new Set(destTables)
const liveSet = new Set(liveTables)

await conn.query("SET SESSION sql_mode = 'NO_ENGINE_SUBSTITUTION,ALLOW_INVALID_DATES'")
await conn.query('SET FOREIGN_KEY_CHECKS = 0')
await conn.query('SET UNIQUE_CHECKS = 0')

console.log('PHASE 1: copy railway (live ids) into database_Bms')
for (const table of destTables) {
  await conn.query(`TRUNCATE TABLE ${q(DST)}.${q(table)}`)
  if (!liveSet.has(table)) {
    console.log(`  emptied dest-only ${table}`)
    continue
  }
  const destCols = await colMeta(DST, table)
  const srcCols = await colMeta(LIVE, table)
  const srcNames = new Set(srcCols.map((c) => c.name))
  const shared = destCols.map((c) => c.name).filter((n) => srcNames.has(n))
  if (!shared.length) continue
  const list = shared.map(q).join(', ')
  const [result] = await conn.query(
    `INSERT INTO ${q(DST)}.${q(table)} (${list}) SELECT ${list} FROM ${q(LIVE)}.${q(table)}`,
  )
  console.log(`  COPY ${table} +${result.affectedRows}`)
}

console.log('PHASE 2: add missing old-dump lookups')
for (const srcTable of oldTables) {
  if (!LOOKUP_TABLES.has(srcTable)) continue
  const table = destName(srcTable)
  if (!destSet.has(table)) continue
  const destCols = await colMeta(DST, table)
  const srcCols = await colMeta(OLD, srcTable)
  const srcNames = new Set(srcCols.map((c) => c.name))
  const shared = destCols.map((c) => c.name).filter((n) => srcNames.has(n))
  const pk = destCols.find((c) => c.key === 'PRI')?.name
  if (!pk || !shared.includes(pk)) continue
  const list = shared.map(q).join(', ')
  const [result] = await conn.query(
    `INSERT INTO ${q(DST)}.${q(table)} (${list})
     SELECT ${list} FROM ${q(OLD)}.${q(srcTable)} s
     WHERE NOT EXISTS (
       SELECT 1 FROM ${q(DST)}.${q(table)} d WHERE d.${q(pk)} = s.${q(pk)}
     )`,
  )
  console.log(`  LOOKUP ${srcTable}->${table} +${result.affectedRows}`)
}

console.log('PHASE 3: add missing old-dump users')
{
  const destCols = await colMeta(DST, 'users')
  const srcCols = await colMeta(OLD, 'users')
  const srcNames = new Set(srcCols.map((c) => c.name))
  const shared = destCols.map((c) => c.name).filter((n) => srcNames.has(n))
  const list = shared.map(q).join(', ')
  const [result] = await conn.query(
    `INSERT INTO ${q(DST)}.users (${list})
     SELECT ${list} FROM ${q(OLD)}.users s
     WHERE NOT EXISTS (SELECT 1 FROM ${q(DST)}.users d WHERE d.username = s.username)
       AND NOT EXISTS (SELECT 1 FROM ${q(DST)}.users d WHERE d.uid = s.uid)`,
  )
  console.log(`  USERS +${result.affectedRows}`)
}

console.log('PHASE 4: insert old dump rows at id +', FK_OFFSET)
for (const srcTable of oldTables) {
  const table = destName(srcTable)
  if (LOOKUP_TABLES.has(srcTable) || srcTable === 'users') continue
  if (SKIP_OFFSET_TABLES.has(table)) continue
  if (!destSet.has(table)) {
    console.log(`  SKIP no dest ${srcTable}`)
    continue
  }
  const destCols = await colMeta(DST, table)
  const srcCols = await colMeta(OLD, srcTable)
  const srcNames = new Set(srcCols.map((c) => c.name))
  const shared = destCols.map((c) => c.name).filter((n) => srcNames.has(n))
  if (!shared.length) continue

  const selectExpr = shared.map((n) => {
    const src = srcCols.find((c) => c.name === n)
    const isAuto = src?.extra.includes('auto_increment')
    if (n === 'bridge_id' || n === 'bridge_inspection_id') {
      return `IFNULL(${q(n)}, 0) + ${FK_OFFSET} AS ${q(n)}`
    }
    if (isAuto) return `IFNULL(${q(n)}, 0) + ${PK_OFFSET} AS ${q(n)}`
    if (FK_COLS.has(n)) return `IFNULL(${q(n)}, 0) + ${FK_OFFSET} AS ${q(n)}`
    return `${q(n)}`
  })
  const insertList = shared.map(q).join(', ')
  try {
    const [result] = await conn.query(
      `INSERT INTO ${q(DST)}.${q(table)} (${insertList})
       SELECT ${selectExpr.join(', ')} FROM ${q(OLD)}.${q(srcTable)}`,
    )
    console.log(`  MERGE ${srcTable}->${table} +${result.affectedRows}`)
  } catch (e) {
    console.log(`  FAIL ${srcTable}: ${e.message}`)
  }
}

await conn.query('SET UNIQUE_CHECKS = 1')
await conn.query('SET FOREIGN_KEY_CHECKS = 1')

const [[liveB]] = await conn.query(`SELECT COUNT(*) c FROM ${q(LIVE)}.bridge`)
const [[oldB]] = await conn.query(`SELECT COUNT(*) c FROM ${q(OLD)}.bridge`)
const [[dstB]] = await conn.query(`SELECT COUNT(*) c FROM ${q(DST)}.bridge`)
const [[dstI]] = await conn.query(`SELECT COUNT(*) c FROM ${q(DST)}.bridge_inspection`)
const [[minOld]] = await conn.query(
  `SELECT MIN(bridge_id) mn, MAX(bridge_id) mx FROM ${q(DST)}.bridge WHERE bridge_id >= ?`,
  [FK_OFFSET],
)
console.log(
  JSON.stringify({
    railway_bridges: liveB.c,
    old_dump_bridges: oldB.c,
    database_Bms_bridges: dstB.c,
    database_Bms_inspections: dstI.c,
    old_dump_id_range_in_bms: minOld,
  }),
)

await conn.end()
