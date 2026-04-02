import { pool } from '../src/config/db.js'

const bExpr = (col) => `CAST(b.${col} AS CHAR) COLLATE utf8mb4_general_ci`
const tExpr = (col) => `CAST(t.${col} AS CHAR) COLLATE utf8mb4_general_ci`

const nonEmptyCount = async (bridgeCol) => {
  const sql = `SELECT COUNT(*) AS c FROM bridge b WHERE b.${bridgeCol} IS NOT NULL AND TRIM(b.${bridgeCol})<>''`
  const [rows] = await pool.query(sql)
  return rows[0].c
}

const distinctSamples = async (bridgeCol, limit = 8) => {
  const sql = `SELECT DISTINCT b.${bridgeCol} AS v FROM bridge b WHERE b.${bridgeCol} IS NOT NULL AND TRIM(b.${bridgeCol})<>'' LIMIT ${limit}`
  const [rows] = await pool.query(sql)
  return rows.map((r) => r.v)
}

const matchCounts = async (bridgeCol, lookupTable, codeCol, labelCol) => {
  const sql = `SELECT
    (SELECT COUNT(*) FROM bridge b
      WHERE b.${bridgeCol} IS NOT NULL AND TRIM(b.${bridgeCol})<>''
      AND EXISTS (SELECT 1 FROM ${lookupTable} t WHERE ${bExpr(bridgeCol)} = ${tExpr(codeCol)})
    ) AS matches_code,
    (SELECT COUNT(*) FROM bridge b
      WHERE b.${bridgeCol} IS NOT NULL AND TRIM(b.${bridgeCol})<>''
      AND EXISTS (SELECT 1 FROM ${lookupTable} t WHERE ${bExpr(bridgeCol)} = ${tExpr(labelCol)})
    ) AS matches_label
  `
  const [rows] = await pool.query(sql)
  return rows[0]
}

async function main() {
  const fields = [
    // bridgeCol, lookupTable, codeCol, labelCol
    ['type_of_bridge', 'type_of_bridge', 'type_of_bridge_code', 'type_of_bridge'],
    ['age_of_bridge', 'age_of_bridge', 'age_code', 'age_when_inspection_done_first'],
    ['structural_form', 'structural_form', 'structural_form_code', 'structural_form_description'],
    ['material_of_construction', 'material_of_construction', 'material_of_construction_code', 'material_of_construction_description'],
    ['loading_as_per_irc', 'loading_icr', 'loading_code', 'allowed_loading'],
    ['hydraluic_tone_weightage', 'hydraluic_tone_weightage', 'hydraluic_tone_code', 'hydraluic_tone_rating'],
    ['bridge_crossing_feature', 'structural_crossing_feature', 'structural_crossing_feature_code', 'structural_crossing_feature_description'],
  ]

  const out = {}
  for (const [bridgeCol, lookupTable, codeCol, labelCol] of fields) {
    // eslint-disable-next-line no-await-in-loop
    const c = await nonEmptyCount(bridgeCol)
    // eslint-disable-next-line no-await-in-loop
    const samples = await distinctSamples(bridgeCol, 8)
    // eslint-disable-next-line no-await-in-loop
    const match = await matchCounts(bridgeCol, lookupTable, codeCol, labelCol)
    out[bridgeCol] = { nonEmptyCount: c, samples, match }
  }

  console.log(JSON.stringify(out, null, 2))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => pool.end())

