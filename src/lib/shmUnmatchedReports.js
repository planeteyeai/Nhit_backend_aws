/**
 * SAR / LIDAR PDFs in S3 that do not match any approved inspection chainage.
 */
import { pool } from '../config/db.js'
import { extractChainageKey } from './lidarReports.js'
import { listLidarReportFiles } from './lidarReports.js'
import { listSarReportFiles } from './sarReports.js'
import { DASHBOARD_PROJECT_CATALOG, chainageKeyToKm } from './dashboardProjects.js'

/** Hidden from unmatched PDF project filter / assignment. */
const EXCLUDED_PROJECT_IDS = new Set([
  'chichra-kharagpur',
  'kaljhar-patacharkuchi',
  'kochugaon-kaljar-1',
  'kochugaon-kaljar-2',
])

function isExcludedCatalogEntry(entry) {
  return Boolean(entry && EXCLUDED_PROJECT_IDS.has(String(entry.id || '')))
}

function isExcludedProjectName(name) {
  const lower = String(name || '')
    .toLowerCase()
    .replace(/[–—]/g, '-')
  if (!lower || lower === '—') return false
  if (/chichra|kharagpur/.test(lower)) return true
  if (/kaljhar|khaljhar|patacharkuchi|pattacharkuchi/.test(lower)) return true
  if (/kochugaon/.test(lower)) return true
  return false
}

function approvedWhereClause(scope = 'bmc') {
  const notClosed = `LOWER(TRIM(i.status)) <> 'closed'`
  const isSite = String(scope || '').toLowerCase() === 'site'
  if (isSite) {
    return `${notClosed} AND LOWER(TRIM(i.status)) = 'approved'`
  }
  return `${notClosed}
    AND LOWER(TRIM(i.status)) = 'approved'
    AND LOWER(TRIM(i.bmc_inspection_status)) = 'approved'`
}

async function getApprovedChainageKeys(scope = 'bmc') {
  const where = approvedWhereClause(scope)
  const [rows] = await pool.query(
    `SELECT DISTINCT b.chainage
     FROM bridge_inspection i
     INNER JOIN bridge b ON b.bridge_id = i.bridge_id
     WHERE ${where}
       AND b.chainage IS NOT NULL
       AND TRIM(b.chainage) <> ''`
  )
  const keys = new Set()
  for (const row of rows) {
    const key = extractChainageKey(row.chainage)
    if (key) keys.add(key)
  }
  return keys
}

async function getBridgeMetaByChainage() {
  const [rows] = await pool.query(
    `SELECT chainage, project_name, type_of_bridge
     FROM bridge
     WHERE chainage IS NOT NULL AND TRIM(chainage) <> ''`
  )
  const map = new Map()
  for (const row of rows) {
    const key = extractChainageKey(row.chainage)
    if (!key || map.has(key)) continue
    map.set(key, {
      projectName: String(row.project_name || '').trim(),
      bridgeStructureType: String(row.type_of_bridge || '').trim(),
    })
  }
  return map
}

function catalogRanges(entry) {
  if (Array.isArray(entry.chainageRanges) && entry.chainageRanges.length) {
    return entry.chainageRanges.map(([lo, hi]) => [Number(lo), Number(hi)])
  }
  return [[Number(entry.chainageMin), Number(entry.chainageMax)]]
}

function rangeWidth(ranges) {
  return ranges.reduce((sum, [lo, hi]) => {
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return sum
    return sum + Math.abs(hi - lo)
  }, 0)
}

/** Prefer narrowest corridor match so broad windows (e.g. 0–32) don't steal other projects. */
function findCatalogProjectByKm(km) {
  if (!Number.isFinite(km)) return null
  const pad = 0.5
  let best = null
  let bestWidth = Infinity
  for (const entry of DASHBOARD_PROJECT_CATALOG) {
    if (isExcludedCatalogEntry(entry)) continue
    const ranges = catalogRanges(entry)
    const hit = ranges.some(([lo, hi]) => Number.isFinite(lo) && Number.isFinite(hi) && km >= lo - pad && km <= hi + pad)
    if (!hit) continue
    const width = rangeWidth(ranges)
    if (width < bestWidth) {
      best = entry
      bestWidth = width
    }
  }
  return best
}

function normalizeProjectLabel(name) {
  const raw = String(name || '').trim()
  if (!raw || raw === '—') return ''
  if (isExcludedProjectName(raw)) return ''
  const lower = raw.toLowerCase()
  for (const entry of DASHBOARD_PROJECT_CATALOG) {
    if (isExcludedCatalogEntry(entry)) continue
    const short = String(entry.shortLabel || entry.shortNames?.[0] || '').trim()
    if (!short) continue
    if (String(entry.fullName || '').toLowerCase() === lower) return short
    if ((entry.shortNames || []).some((n) => String(n).toLowerCase() === lower)) return short
    if (String(entry.shortLabel || '').toLowerCase() === lower) return short
  }
  // Unknown / excluded corridors stay unassigned for this panel
  if (isExcludedProjectName(raw)) return ''
  return raw
}

function resolveProjectName(report, bridgeMeta) {
  const meta = bridgeMeta.get(report.chainageKey) || {}
  const fromBridge = normalizeProjectLabel(meta.projectName)
  if (fromBridge) return fromBridge

  const km = chainageKeyToKm(report.chainageKey)
  const catalog = findCatalogProjectByKm(km)
  if (catalog?.shortLabel) return catalog.shortLabel
  if (catalog?.fullName) return normalizeProjectLabel(catalog.fullName) || catalog.fullName
  return '—'
}

function resolveProjectFullName(report, bridgeMeta) {
  const meta = bridgeMeta.get(report.chainageKey) || {}
  const raw = String(meta.projectName || '').trim()
  if (raw && !isExcludedProjectName(raw)) {
    const lower = raw.toLowerCase()
    for (const entry of DASHBOARD_PROJECT_CATALOG) {
      if (isExcludedCatalogEntry(entry)) continue
      if (String(entry.fullName || '').toLowerCase() === lower) return entry.fullName
      if ((entry.shortNames || []).some((n) => String(n).toLowerCase() === lower)) return entry.fullName
      if (String(entry.shortLabel || '').toLowerCase() === lower) return entry.fullName
    }
    return raw
  }
  const km = chainageKeyToKm(report.chainageKey)
  const catalog = findCatalogProjectByKm(km)
  return catalog?.fullName || ''
}

function enrichReport(report, bridgeMeta) {
  const meta = bridgeMeta.get(report.chainageKey) || {}
  return {
    ...report,
    chainage: report.chainageKey,
    projectName: resolveProjectName(report, bridgeMeta),
    projectFullName: resolveProjectFullName(report, bridgeMeta),
    structureType: report.structureType || meta.bridgeStructureType || '',
  }
}

function filterReports(reports, { projectName = '', structureType = '' } = {}) {
  let list = reports
  if (projectName) {
    list = list.filter((r) => r.projectName === projectName)
  }
  if (structureType) {
    list = list.filter(
      (r) => String(r.structureType || '').toUpperCase() === String(structureType).toUpperCase()
    )
  }
  return list
}

function sortByProjectThenChainage(a, b) {
  const pa = String(a.projectName || '')
  const pb = String(b.projectName || '')
  if (pa !== pb) {
    if (pa === '—') return 1
    if (pb === '—') return -1
    return pa.localeCompare(pb)
  }
  return String(a.chainageKey || '').localeCompare(String(b.chainageKey || ''), undefined, {
    numeric: true,
  })
}

function buildProjectOptions(unmatchedLidar, unmatchedSar) {
  const map = new Map()
  const bump = (projectName, kind) => {
    const name = String(projectName || '').trim()
    if (!name || name === '—') return
    if (!map.has(name)) map.set(name, { name, count: 0, lidar: 0, sar: 0 })
    const row = map.get(name)
    row.count += 1
    if (kind === 'lidar') row.lidar += 1
    if (kind === 'sar') row.sar += 1
  }
  for (const r of unmatchedLidar) bump(r.projectName, 'lidar')
  for (const r of unmatchedSar) bump(r.projectName, 'sar')
  return [...map.values()]
    .filter((p) => !isExcludedProjectName(p.name))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function buildStructureTypeOptions(unmatchedLidar, unmatchedSar) {
  const map = new Map()
  for (const r of [...unmatchedLidar, ...unmatchedSar]) {
    const type = String(r.structureType || '').trim().toUpperCase()
    if (!type) continue
    map.set(type, (map.get(type) || 0) + 1)
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function listUnmatchedShmReports(options = {}) {
  const scope = String(options.scope || 'bmc').toLowerCase()
  const projectName = String(options.projectName || '').trim()
  const structureType = String(options.structureType || '').trim()

  const [approvedKeys, bridgeMeta, sarFiles, lidarFiles] = await Promise.all([
    getApprovedChainageKeys(scope),
    getBridgeMetaByChainage(),
    listSarReportFiles(),
    listLidarReportFiles(),
  ])

  const unmatchedSar = sarFiles
    .filter((f) => f.chainageKey && !approvedKeys.has(f.chainageKey))
    .map((f) => enrichReport(f, bridgeMeta))
    .sort(sortByProjectThenChainage)

  const unmatchedLidar = lidarFiles
    .filter((f) => f.chainageKey && !approvedKeys.has(f.chainageKey))
    .map((f) => enrichReport(f, bridgeMeta))
    .sort(sortByProjectThenChainage)

  const lidar = filterReports(unmatchedLidar, { projectName, structureType })
  const sar = filterReports(unmatchedSar, { projectName, structureType })

  const projects = buildProjectOptions(unmatchedLidar, unmatchedSar)
  const structureTypes = buildStructureTypeOptions(unmatchedLidar, unmatchedSar)

  return {
    lidar,
    sar,
    counts: {
      total: lidar.length + sar.length,
      lidar: lidar.length,
      sar: sar.length,
      lidarAll: unmatchedLidar.length,
      sarAll: unmatchedSar.length,
    },
    filters: { projects, structureTypes },
  }
}
