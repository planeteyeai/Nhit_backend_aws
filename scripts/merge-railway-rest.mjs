import mysql from 'mysql2/promise'
import dotenv from 'dotenv'

dotenv.config()

const SRC = 'railway'
const DST = 'database_Bms'
const FK_OFFSET = 10000
const PK_OFFSET = 200000

const DONE = new Set([
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
  'users',
  'PowerBI',
  'bms_notification',
  'bridge_inspection_3d_assets',
  'bridge_panorama_marker_images',
  'bridge_panorama_markers',
  'bridge_panorama_stations',
  'non_structural_distress',
  'approaches',
  'approaches_bridge',
  'bearing_and_pedistal',
  'bearing_and_pedistal_bridge',
  'bearing_and_pedistal_condition',
  'bearing_rating_details',
  'bridge',
  'bridge_inspection',
])

const LOOKUP = new Set([...DONE].filter((t) => ![
  'users', 'bridge', 'bridge_inspection', 'approaches', 'approaches_bridge',
  'bearing_and_pedistal', 'bearing_and_pedistal_bridge', 'bearing_and_pedistal_condition',
  'bearing_rating_details',
].includes(t)))

const FK_COLS = new Set(['bridge_id', 'bridge_inspection_id', 'bearing_and_pedistal_id'])

const conn = await mysql.createConnection({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  ssl: { rejectUnauthorized: false },
})

async function tableList(schema) {
  const [rows] = await conn.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema=? AND table_type='BASE TABLE'`,
    [schema],
  )
  return rows.map((r) => r.TABLE_NAME || r.table_name)
}

async function colMeta(schema, table) {
  const [rows] = await conn.query(
    `SELECT column_name, extra FROM information_schema.columns
     WHERE table_schema=? AND table_name=? ORDER BY ordinal_position`,
    [schema, table],
  )
  return rows.map((r) => ({
    name: r.COLUMN_NAME || r.column_name,
    extra: String(r.EXTRA || r.extra || '').toLowerCase(),
  }))
}

const srcTables = await tableList(SRC)
const dstSet = new Set(await tableList(DST))

await conn.query("SET SESSION sql_mode='NO_ENGINE_SUBSTITUTION,ALLOW_INVALID_DATES'")
await conn.query('SET FOREIGN_KEY_CHECKS=0')
await conn.query('SET UNIQUE_CHECKS=0')

for (const table of srcTables) {
  if (DONE.has(table) || LOOKUP.has(table) || table === 'users') continue
  if (!dstSet.has(table)) {
    console.log(`skip missing ${table}`)
    continue
  }
  const destCols = await colMeta(DST, table)
  const srcCols = await colMeta(SRC, table)
  const srcNames = new Set(srcCols.map((c) => c.name))
  const shared = destCols.map((c) => c.name).filter((n) => srcNames.has(n))
  const selectExpr = shared.map((n) => {
    const src = srcCols.find((c) => c.name === n)
    if (src?.extra.includes('auto_increment')) return `IFNULL(\`${n}\`,0)+${PK_OFFSET} AS \`${n}\``
    if (FK_COLS.has(n)) return `IFNULL(\`${n}\`,0)+${FK_OFFSET} AS \`${n}\``
    return `\`${n}\``
  })
  console.log(`MERGE ${table}`)
  try {
    const [result] = await conn.query(
      `INSERT INTO \`${DST}\`.\`${table}\` (${shared.map((n) => `\`${n}\``).join(',')})
       SELECT ${selectExpr.join(',')} FROM \`${SRC}\`.\`${table}\``,
    )
    console.log(`  +${result.affectedRows}`)
  } catch (e) {
    console.log(`  FAIL ${table}: ${e.message}`)
  }
}

await conn.query('SET UNIQUE_CHECKS=1')
await conn.query('SET FOREIGN_KEY_CHECKS=1')
const [[b]] = await conn.query(`SELECT COUNT(*) c FROM \`${DST}\`.bridge`)
const [[i]] = await conn.query(`SELECT COUNT(*) c FROM \`${DST}\`.bridge_inspection`)
console.log(`RESULT bridge=${b.c} inspection=${i.c}`)
await conn.end()
