import 'dotenv/config'
import mysql from 'mysql2/promise'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(__dirname, '../../database')
const outFile = path.join(outDir, 'schema-from-pdf.sql')

function env(name, fallback = '') {
  return process.env[name] ?? fallback
}

// Table order copied from `C:\\Users\\Vishal.Bhor\\Downloads\\ramsneyv_bms1.pdf` (Table of contents).
const PDF_TABLE_ORDER = [
  'age_of_bridge',
  'approaches',
  'approaches_bridge',
  'bearing_and_pedistal',
  'bearing_and_pedistal_bridge',
  'bearing_and_pedistal_condition',
  'bearing_rating_details',
  'bridge',
  'bridge_inspection',
  'bridge_inspection_distress',
  'bridge_inspection_rejection_comment',
  'bridge_inspection_rejection_comment',
  'bridge_rejection_comment',
  'bridge_side',
  'company_firms',
  'component_pier_rating',
  'drainage_spouts_and_vest_holes',
  'expansion_joint',
  'expansion_joint_bridge',
  'expansion_joint_bridge_items',
  'expansion_joint_pilers',
  'footpaths',
  'foundation',
  'foundation_bridge',
  'general',
  'general_bridge',
  'handrails_parapets_crash_barriers',
  'handrails_parapets_crash_barriers_bridge',
  'hydraluic_tone_weightage',
  'inspection_cause_rating',
  'inspection_component_rating',
  'inspection_repair_methodology_map',
  'loading_icr',
  'material_of_construction',
  'material_of_construction_bkp',
  'non_structural_elements',
  'overall_bridge_rating',
  'protection_works',
  'protection_works_bridge',
  'rating_alternate_route',
  'rating_environmental_impact',
  'rating_for_abrasion',
  'rating_for_alkali',
  'rating_for_carbonation',
  'rating_for_carbon_dioxide',
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
  'sapn_arrangment',
  'schedule_adhoc_inspecion',
  'schedule_inspecion',
  'schedule_inspecion_notification',
  'state',
  'state_bkp',
  'structural_crossing_feature',
  'structural_form',
  'structural_form_bkp',
  'structural_rating',
  'structure_data_bridge',
  'substructure',
  'substructure_bridge',
  'substructure_piers_bridge',
  'substructure_pilers',
  'subways',
  'superstructure',
  'superstructure_bridge',
  'superstructure_no_of_girders',
  'traffic_lane_on_bridge',
  'type_of_bridge',
  'users',
  'utilities',
  'waterway',
  'wearing_coat',
  'wearing_coat_bridge',
  'zone',
]

const unique = (arr) => Array.from(new Set(arr.filter(Boolean)))

async function main() {
  const pool = await mysql.createPool({
    host: env('MYSQL_HOST', 'localhost'),
    port: env('MYSQL_PORT') ? Number(env('MYSQL_PORT')) : 3306,
    user: env('MYSQL_USER'),
    password: env('MYSQL_PASSWORD'),
    database: env('MYSQL_DATABASE'),
    connectionLimit: 5,
  })

  const [tablesRows] = await pool.query('SHOW TABLES')
  const actualTables = tablesRows.map((r) => Object.values(r)[0])
  const actualSet = new Set(actualTables)

  const pdfOrderedTables = unique(PDF_TABLE_ORDER)
  const ordered = pdfOrderedTables.filter((t) => actualSet.has(t))
  const missingFromDb = pdfOrderedTables.filter((t) => !actualSet.has(t))
  const extraInDb = actualTables.filter((t) => !new Set(pdfOrderedTables).has(t))

  const chunks = []
  chunks.push(`-- Generated from schema order in ramsneyv_bms1.pdf`)
  chunks.push(`-- Source DB: ${env('MYSQL_DATABASE')} @ ${env('MYSQL_HOST')}:${env('MYSQL_PORT') || 3306}`)
  chunks.push(`-- Generated at: ${new Date().toISOString()}`)
  chunks.push(``)

  if (missingFromDb.length) {
    chunks.push(`-- WARNING: tables listed in PDF but missing in DB:`)
    for (const t of missingFromDb) chunks.push(`--   - ${t}`)
    chunks.push(``)
  }
  if (extraInDb.length) {
    chunks.push(`-- NOTE: tables present in DB but not listed in PDF TOC:`)
    for (const t of extraInDb) chunks.push(`--   - ${t}`)
    chunks.push(``)
  }

  chunks.push(`SET FOREIGN_KEY_CHECKS=0;`)
  chunks.push(``)

  for (const table of ordered) {
    const [rows] = await pool.query(`SHOW CREATE TABLE \`${table}\``)
    const createSql = rows?.[0]?.['Create Table']
    if (!createSql) continue
    chunks.push(`-- ----------------------------`)
    chunks.push(`-- Table: ${table}`)
    chunks.push(`-- ----------------------------`)
    chunks.push(`DROP TABLE IF EXISTS \`${table}\`;`)
    chunks.push(createSql + `;`)
    chunks.push(``)
  }

  chunks.push(`SET FOREIGN_KEY_CHECKS=1;`)
  chunks.push(``)

  await fs.promises.mkdir(outDir, { recursive: true })
  await fs.promises.writeFile(outFile, chunks.join('\n'), 'utf8')
  await pool.end()

  // eslint-disable-next-line no-console
  console.log(`Wrote ${outFile}`)
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exit(1)
})

