import { pool } from '../src/config/db.js'

const baseNonEmpty = (bridgeCol) =>
  `(b.${bridgeCol} IS NOT NULL AND TRIM(b.${bridgeCol})<>'')`

const getNonEmptyCount = async (bridgeCol) => {
  const sql = `SELECT COUNT(*) AS c FROM bridge b WHERE ${baseNonEmpty(bridgeCol)}`
  const [rows] = await pool.query(sql)
  return rows[0].c
}

const getDistinctSamples = async (bridgeCol, limit = 8) => {
  const sql = `SELECT DISTINCT b.${bridgeCol} AS v FROM bridge b WHERE ${baseNonEmpty(bridgeCol)} AND b.${bridgeCol} IS NOT NULL LIMIT ${limit}`
  const [rows] = await pool.query(sql)
  return rows.map((r) => r.v)
}

const countMatches = async (bridgeCol, lookupTable, lookupCol, lookupRatingCol = null) => {
  // We count how many bridge rows match each lookup column value for the dropdown key.
  const parts = []

  const bExpr = `CAST(b.${bridgeCol} AS CHAR) COLLATE utf8mb4_general_ci`
  const tExpr = (col) => `CAST(t.${col} AS CHAR) COLLATE utf8mb4_general_ci`

  parts.push(
    `(SELECT COUNT(*) FROM bridge b WHERE ${baseNonEmpty(bridgeCol)} AND EXISTS (SELECT 1 FROM ${lookupTable} t WHERE ${bExpr} = ${tExpr(lookupCol)})) AS matches_code_or_id`
  )
  if (lookupRatingCol) {
    parts.push(
      `(SELECT COUNT(*) FROM bridge b WHERE ${baseNonEmpty(bridgeCol)} AND EXISTS (SELECT 1 FROM ${lookupTable} t WHERE ${bExpr} = ${tExpr(lookupRatingCol)})) AS matches_rating_text`
    )
  }
  const sql = `SELECT ${parts.join(', ')}`
  const [rows] = await pool.query(sql)
  return rows[0]
}

async function main() {
  const results = {}

  for (const bridgeCol of [
    'rating_for_vertical_clearance',
    'rating_of_deck_geometry',
    'rating_of_waterway_adequacy',
    'rating_of_average_daily_traffic',
    'rating_for_social_importance',
    'rating_for_economic_growth_potential',
    'rating_alternate_route',
    'rating_environmental_impact',
  ]) {
    // eslint-disable-next-line no-await-in-loop
    results[`nonEmpty_${bridgeCol}`] = {
      count: await getNonEmptyCount(bridgeCol),
      samples: await getDistinctSamples(bridgeCol, 8),
    }
  }

  results.vertical_clearance = await countMatches(
    'rating_for_vertical_clearance',
    'rating_for_vertical_clearance',
    'vertical_clearance_id',
    'vertical_clearance_rating'
  )

  results.deck_geometry = await countMatches(
    'rating_of_deck_geometry',
    'rating_of_deck_geometry',
    'geometry_rating_code',
    'geometry_rating'
  )

  results.waterway_adequacy = await countMatches(
    'rating_of_waterway_adequacy',
    'rating_of_waterway_adequacy',
    'waterway_rating_code',
    'waterway_rating'
  )

  results.traffic = await countMatches(
    'rating_of_average_daily_traffic',
    'rating_of_average_daily_traffic',
    'traffic_rating_code',
    'traffic_rating'
  )

  results.social_importance = await countMatches(
    'rating_for_social_importance',
    'rating_for_social_importance',
    'social_importance_code',
    'social_importance_rating'
  )

  results.economic_growth_potential = await countMatches(
    'rating_for_economic_growth_potential',
    'rating_for_economic_growth_potential',
    'economic_growth_potential_code',
    'economic_growth_potential_rating'
  )

  results.alternate_route = await countMatches(
    'rating_alternate_route',
    'rating_alternate_route',
    'route_rating_code',
    'route_rating'
  )

  results.environmental_impact = await countMatches(
    'rating_environmental_impact',
    'rating_environmental_impact',
    'environmental_impact_rating_code',
    'environmental_impact_rating'
  )

  console.log(JSON.stringify(results, null, 2))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => pool.end())

