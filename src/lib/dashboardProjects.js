/**
 * Dashboard_projects query helpers for BMS map / asset summary.
 */

export function normalizeDashboardProjectRow(row = {}) {
  const structures = String(row.structures || '').trim()
  const start = Number(row.actual_start_chainage)
  const end = Number(row.actual_end_chainage)
  return {
    id: row.id,
    project_name: row.project_name || '',
    chainage_start: Number.isFinite(start) ? start : null,
    chainage_end: Number.isFinite(end) ? end : null,
    actual_start_chainage: Number.isFinite(start) ? start : null,
    actual_end_chainage: Number.isFinite(end) ? end : null,
    latitude: Number.isFinite(Number(row.latitude)) ? Number(row.latitude) : null,
    longitude: Number.isFinite(Number(row.longitude)) ? Number(row.longitude) : null,
    kilometer: row.kilometer != null ? Number(row.kilometer) : null,
    length: row.length != null ? Number(row.length) : null,
    toll_plaza_location: row.toll_plaza_location || '',
    originating: row.originating || '',
    terminating: row.terminating || '',
    carriage_width: row.carriage_width || '',
    structures,
    type_of_structure: structures,
    structure_type: structures,
    structure: structures,
    asset_type: structures,
    mjb: Number(row.mjb || 0),
    mnb: Number(row.mnb || 0),
    flyover: Number(row.flyover || 0),
    aadt: row.aadt != null ? Number(row.aadt) : null,
    pup: Number(row.pup || 0),
    vup: Number(row.vup || 0),
    rob: Number(row.rob || 0),
    direction: row.direction || '',
    lane: row.lane || '',
    carriage_type: row.carriage_type || '',
  }
}

export function buildDashboardProjectFilters(query = {}) {
  const where = []
  const params = []

  const projectName = String(query.project_name || query.projectName || '').trim()
  if (projectName) {
    where.push('project_name = ?')
    params.push(projectName)
  }

  const direction = String(query.direction || '').trim()
  if (direction && direction.toLowerCase() !== 'all') {
    where.push('direction = ?')
    params.push(direction)
  }

  const structure = String(
    query.structure || query.type_of_structure || query.structure_type || '',
  ).trim()
  if (structure && structure.toLowerCase() !== 'all') {
    where.push('structures = ?')
    params.push(structure)
  }

  const chainageMin = Number(query.chainage_min ?? query.chainageMin)
  if (Number.isFinite(chainageMin)) {
    where.push('actual_end_chainage >= ?')
    params.push(chainageMin)
  }

  const chainageMax = Number(query.chainage_max ?? query.chainageMax)
  if (Number.isFinite(chainageMax)) {
    where.push('actual_start_chainage <= ?')
    params.push(chainageMax)
  }

  return {
    whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params,
  }
}

export async function fetchDashboardProjectsMeta(pool) {
  const [projectRows] = await pool.query(
    `SELECT
       project_name,
       COUNT(*) AS row_count,
       MIN(actual_start_chainage) AS chainage_min,
       MAX(actual_end_chainage) AS chainage_max,
       MIN(length) AS length_km,
       MAX(originating) AS originating,
       MAX(terminating) AS terminating,
       MAX(toll_plaza_location) AS toll_plaza_location,
       MAX(carriage_width) AS carriage_width,
       MAX(aadt) AS aadt
     FROM Dashboard_projects
     WHERE project_name IS NOT NULL AND TRIM(project_name) <> ''
     GROUP BY project_name
     ORDER BY project_name ASC`,
  )

  const [directionRows] = await pool.query(
    `SELECT DISTINCT direction AS value
     FROM Dashboard_projects
     WHERE direction IS NOT NULL AND TRIM(direction) <> ''
     ORDER BY direction ASC`,
  )

  const [structureRows] = await pool.query(
    `SELECT structures AS value, COUNT(*) AS c
     FROM Dashboard_projects
     WHERE structures IS NOT NULL AND TRIM(structures) <> ''
     GROUP BY structures
     ORDER BY c DESC, structures ASC`,
  )

  return {
    projects: (projectRows || []).map((r) => ({
      project_name: r.project_name,
      row_count: Number(r.row_count || 0),
      chainage_min: r.chainage_min != null ? Number(r.chainage_min) : null,
      chainage_max: r.chainage_max != null ? Number(r.chainage_max) : null,
      length_km: r.length_km != null ? Number(r.length_km) : null,
      originating: r.originating || '',
      terminating: r.terminating || '',
      toll_plaza_location: r.toll_plaza_location || '',
      carriage_width: r.carriage_width || '',
      aadt: r.aadt != null ? Number(r.aadt) : null,
    })),
    directions: (directionRows || []).map((r) => r.value).filter(Boolean),
    structures: (structureRows || []).map((r) => r.value).filter(Boolean),
  }
}

export async function fetchDashboardProjectRows(pool, query = {}) {
  const { whereSql, params } = buildDashboardProjectFilters(query)
  const [rows] = await pool.query(
    `SELECT *
     FROM Dashboard_projects
     ${whereSql}
     ORDER BY actual_start_chainage ASC, id ASC`,
    params,
  )
  return (rows || []).map(normalizeDashboardProjectRow)
}

export function summarizeDashboardProjectRows(rows = []) {
  const byStructure = {}
  for (const row of rows) {
    const key = String(row.type_of_structure || row.structures || 'Other').trim() || 'Other'
    byStructure[key] = (byStructure[key] || 0) + 1
  }

  const first = rows[0] || {}
  return {
    total: rows.length,
    by_structure: byStructure,
    project_name: first.project_name || '',
    originating: first.originating || '',
    terminating: first.terminating || '',
    length_km: first.length ?? null,
    aadt: first.aadt ?? null,
    toll_plaza_location: first.toll_plaza_location || '',
    carriage_width: first.carriage_width || '',
    mjb: rows.reduce((a, r) => a + Number(r.mjb || 0), 0),
    mnb: rows.reduce((a, r) => a + Number(r.mnb || 0), 0),
    flyover: rows.reduce((a, r) => a + Number(r.flyover || 0), 0),
    pup: rows.reduce((a, r) => a + Number(r.pup || 0), 0),
    vup: rows.reduce((a, r) => a + Number(r.vup || 0), 0),
    rob: rows.reduce((a, r) => a + Number(r.rob || 0), 0),
  }
}

/** Keep in sync with Frontend dashboardProjectCatalog.js */
export const DASHBOARD_PROJECT_CATALOG = [
  {
    id: 'abu-swaroopganj',
    shortLabel: 'Abu Road – Swaroopganj',
    shortNames: ['Abu road to swaroopganj', 'Palanpur/Khemana-Abu Road'],
    fullName:
      'Tolling, Operation, Maintenance & Transfer of Abu Road-Swaroopganj / Palanpur-Khemana section from km 601+000 to 677+000 of NH-27',
    highway: 'NH-27',
    state: 'Gujarat / Rajasthan',
    chainageMin: 601,
    chainageMax: 677,
  },
  {
    id: 'agra-bypass',
    shortLabel: 'Agra Bypass',
    shortNames: ['Agra Bypass Road'],
    fullName:
      'Tolling, Operation, Maintenance & Transfer of Agra Bypass section from km 0.000 to 32.800 in the state of Uttar Pradesh',
    highway: 'NH',
    state: 'Uttar Pradesh',
    chainageMin: 0,
    chainageMax: 32.8,
  },
  {
    id: 'borkhedi-wadner',
    shortLabel: 'Borkhedi – Wadner',
    shortNames: ['Borkhedi to Wadner'],
    fullName:
      'Tolling, Operation, Maintenance & Transfer of Bhorkhedi-Wadner-Deodhari-Kelapur Maharashtra/Telangana Border from km 36.600 to km 175.000 of NH-44 (Old NH-7)',
    highway: 'NH-44',
    state: 'Maharashtra / Telangana',
    chainageMin: 36.6,
    chainageMax: 175,
  },
  {
    id: 'chittorgarh-kota',
    shortLabel: 'Chittorgarh – Kota',
    shortNames: ['Chittorgarh to Kota'],
    fullName:
      'Tolling, Operation, Maintenance & Transfer of Chittorgarh Bypass to Kota section from km 891+929 to 1052+429 of NH-27 in the state of Rajasthan',
    highway: 'NH-27',
    state: 'Rajasthan',
    chainageMin: 891.929,
    chainageMax: 1052.429,
  },
  {
    id: 'chichra-kharagpur',
    shortLabel: 'Chichra – Kharagpur',
    shortNames: [],
    fullName:
      'Tolling, Operation, Maintenance & Transfer of Four lane Chichra to Kharagpur (existing Km 185+150 (Design Km 16+130) to Km 129+000 (Design Km 72+250) in the state of West Bengal',
    highway: 'NH',
    state: 'West Bengal',
    chainageMin: 16.13,
    chainageMax: 72.25,
  },
  {
    id: 'kaljhar-patacharkuchi',
    shortLabel: 'Kaljhar – Pattacharkuchi',
    shortNames: ['Kaljhar to Patacharkuchi'],
    fullName:
      'Tolling, Operation, Maintenance & Transfer of Khaljhar - Pattacharkuchi section from km 1013+000 to 1040+300 of NH-27 in the state of Assam',
    highway: 'NH-27',
    state: 'Assam',
    chainageMin: 1013,
    chainageMax: 1040.3,
  },
  {
    id: 'kochugaon-kaljar-1',
    shortLabel: 'Kochugaon – Kaljar (Seg 1)',
    shortNames: ['Kochugaon to Kaljar -1'],
    fullName:
      'Tolling, Operation, Maintenance & Transfer of Kochugaon – Khaljhar section from km 30+000 to 92+671 / 961+500 to 1013+000 of NH-27 in the state of Assam',
    highway: 'NH-27',
    state: 'Assam',
    chainageMin: 30,
    chainageMax: 92.671,
  },
  {
    id: 'kochugaon-kaljar-2',
    shortLabel: 'Kochugaon – Kaljar (Seg 2)',
    shortNames: ['Kochugaon to Kaljar -2'],
    fullName:
      'Tolling, Operation, Maintenance & Transfer of Kochugaon – Khaljhar section from km 30+000 to 92+671 / 961+500 to 1013+000 of NH-27 in the state of Assam',
    highway: 'NH-27',
    state: 'Assam',
    chainageMin: 961.5,
    chainageMax: 1013,
  },
  {
    id: 'shivpuri-jhansi',
    shortLabel: 'Shivpuri – Jhansi',
    shortNames: ['Shivpuri to Jhansi'],
    fullName:
      'Tolling, Operation, Maintenance & Transfer of Shivpuri-Jhansi section from km 1305+087 to 1380+387 of NH-22 in the state of Madhya Pradesh',
    highway: 'NH-22',
    state: 'Madhya Pradesh',
    chainageMin: 1305.087,
    chainageMax: 1380.387,
  },
]

export function chainageKeyToKm(key) {
  const s = String(key || '').trim()
  const plus = s.match(/(\d+)\s*\+\s*(\d+)/)
  if (plus) return Number(plus[1]) + Number(plus[2]) / 1000
  const dotted = Number(s.replace(/[^\d.]/g, ''))
  return Number.isFinite(dotted) ? dotted : null
}

function isKmInRange(km, min, max, pad = 0.5) {
  if (!Number.isFinite(km) || !Number.isFinite(min) || !Number.isFinite(max)) return false
  return km >= min - pad && km <= max + pad
}

/**
 * Build project cards: catalog + Dashboard_projects stats + Potree models by chainage.
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ listPotreeModels?: () => Promise<any[]> }} deps
 */
export async function fetchDashboardProjectCards(pool, deps = {}) {
  const meta = await fetchDashboardProjectsMeta(pool)
  const byShort = new Map((meta.projects || []).map((p) => [String(p.project_name || '').toLowerCase(), p]))

  let potreeModels = []
  try {
    if (typeof deps.listPotreeModels === 'function') {
      potreeModels = await deps.listPotreeModels()
    }
  } catch {
    potreeModels = []
  }

  const cards = DASHBOARD_PROJECT_CATALOG.map((entry) => {
    const shortName = entry.shortNames?.[0] || ''
    const db = shortName ? byShort.get(shortName.toLowerCase()) : null
    const chainageMin = db?.chainage_min != null ? Number(db.chainage_min) : entry.chainageMin
    const chainageMax = db?.chainage_max != null ? Number(db.chainage_max) : entry.chainageMax

    const models = (potreeModels || []).filter((m) => {
      const km = chainageKeyToKm(m.chainageKey || m.name || m.folder)
      return isKmInRange(km, chainageMin, chainageMax)
    })

    return {
      id: entry.id,
      short_label: entry.shortLabel,
      short_name: shortName || entry.shortLabel,
      full_name: entry.fullName,
      highway: entry.highway,
      state: entry.state,
      chainage_min: chainageMin,
      chainage_max: chainageMax,
      chainage_label: `km ${chainageMin} – ${chainageMax}`,
      structure_count: Number(db?.row_count || 0),
      length_km: db?.length_km ?? null,
      originating: db?.originating || '',
      terminating: db?.terminating || '',
      aadt: db?.aadt ?? null,
      has_dashboard_data: Boolean(db),
      potree_count: models.length,
      potree_models: models.slice(0, 40).map((m) => ({
        folder: m.folder,
        name: m.name,
        chainageKey: m.chainageKey,
        points: m.points ?? null,
      })),
    }
  })

  return {
    cards,
    totals: {
      projects: cards.length,
      with_data: cards.filter((c) => c.has_dashboard_data).length,
      structures: cards.reduce((a, c) => a + c.structure_count, 0),
      potree_models: cards.reduce((a, c) => a + c.potree_count, 0),
    },
  }
}
