/**
 * SAR / LIDAR PDFs in S3 that do not match any approved inspection chainage.
 */
import { pool } from '../config/db.js'
import { extractChainageKey } from './lidarReports.js'
import { listLidarReportFiles } from './lidarReports.js'
import { listSarReportFiles } from './sarReports.js'
import { DASHBOARD_PROJECT_CATALOG, chainageKeyToKm } from './dashboardProjects.js'

function isExcludedCatalogEntry() {
  return false
}

function isExcludedProjectName() {
  return false
}

function normProjectToken(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function findCatalogByFilter(filter) {
  const key = String(filter || '').trim()
  if (!key) return null
  const lower = key.toLowerCase()
  const token = normProjectToken(key)
  return (
    DASHBOARD_PROJECT_CATALOG.find((p) => {
      if (String(p.id || '').toLowerCase() === lower) return true
      if (String(p.shortLabel || '').toLowerCase() === lower) return true
      if (normProjectToken(p.shortLabel) === token) return true
      if ((p.shortNames || []).some((n) => String(n).toLowerCase() === lower || normProjectToken(n) === token)) {
        return true
      }
      if ((p.s3ProjectFolders || []).some((f) => normProjectToken(f) === token)) return true
      return false
    }) || null
  )
}

function reportBelongsToCatalogProject(report, project) {
  if (!project) return true
  const label = String(report.projectName || '').trim()
  const folder = String(report.project || '').trim()
  const labelTok = normProjectToken(label)
  const folderTok = normProjectToken(folder)
  const shortTok = normProjectToken(project.shortLabel)

  if (label && (label === project.shortLabel || labelTok === shortTok)) return true
  if ((project.shortNames || []).some((n) => {
    const t = normProjectToken(n)
    return t && (t === labelTok || t === folderTok)
  })) {
    return true
  }
  if ((project.s3ProjectFolders || []).some((f) => {
    const t = normProjectToken(f)
    return t && (t === folderTok || t === labelTok)
  })) {
    return true
  }

  const resolved = normalizeProjectLabel(label) || normalizeProjectLabel(folder)
  if (resolved && resolved === project.shortLabel) return true

  const km = chainageKeyToKm(report.chainageKey)
  if (Number.isFinite(km)) {
    const pad = 0.5
    const ranges =
      Array.isArray(project.chainageRanges) && project.chainageRanges.length
        ? project.chainageRanges
        : [[project.chainageMin, project.chainageMax]]
    if (
      ranges.some(([lo, hi]) => {
        const min = Number(lo)
        const max = Number(hi)
        return Number.isFinite(min) && Number.isFinite(max) && km >= min - pad && km <= max + pad
      })
    ) {
      return true
    }
  }
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

/** S3 folder names under upload/download/SAR/{project}/ → catalog short labels */
const SAR_S3_PROJECT_ALIASES = [
  [/palanpur|swaroopganj|abu\s*road/i, 'Abu Road-Swaroopganj'],
  [/shivapuri|shivpuri|jhansi/i, 'Shivpuri-Jhansi'],
  [/borkhedi|bhorkhedi|wadner/i, 'Bhorkhedi-Wadner-Deodhari-Kelapur'],
  [/chittorgarh|kota/i, 'Chittorgarh Bypass to Kota'],
  [/agra\s*bypass/i, 'Agra Bypass'],
]

function normalizeProjectLabel(name) {
  const raw = String(name || '').trim()
  if (!raw || raw === '—') return ''
  if (isExcludedProjectName(raw)) return ''
  const lower = raw.toLowerCase()
  for (const [re, label] of SAR_S3_PROJECT_ALIASES) {
    if (re.test(lower)) return label
  }
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
  const fromFolder = normalizeProjectLabel(report.project)
  if (fromFolder) return fromFolder

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
    const catalog = findCatalogByFilter(projectName)
    list = list.filter((r) =>
      catalog ? reportBelongsToCatalogProject(r, catalog) : r.projectName === projectName
    )
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
  // Canonical dashboard catalog — unique options (no S3 folder duplicates)
  return DASHBOARD_PROJECT_CATALOG.map((p) => {
    const count = [...unmatchedLidar, ...unmatchedSar].filter((r) =>
      reportBelongsToCatalogProject(r, p)
    ).length
    const lidar = unmatchedLidar.filter((r) => reportBelongsToCatalogProject(r, p)).length
    const sar = unmatchedSar.filter((r) => reportBelongsToCatalogProject(r, p)).length
    return { name: p.shortLabel, id: p.id, count, lidar, sar }
  })
}

/** Full S3 totals per catalog project (matched + unmatched). */
function buildProjectTotals(lidarFiles, sarFiles, bridgeMeta) {
  const map = new Map()
  const bump = (file, kind) => {
    const enriched = enrichReport(file, bridgeMeta)
    const key = String(enriched.projectName || '—').trim() || '—'
    if (!map.has(key)) map.set(key, { lidar: 0, sar: 0, total: 0 })
    const row = map.get(key)
    if (kind === 'lidar') row.lidar += 1
    if (kind === 'sar') row.sar += 1
    row.total = row.lidar + row.sar
  }
  for (const f of lidarFiles || []) bump(f, 'lidar')
  for (const f of sarFiles || []) bump(f, 'sar')
  return Object.fromEntries(map)
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

function uniqueChainageKeys(files) {
  const keys = []
  const seen = new Set()
  for (const f of files || []) {
    const k = String(f?.chainageKey || '').trim()
    if (!k || seen.has(k)) continue
    seen.add(k)
    keys.push(k)
  }
  return keys
}

/**
 * @param {{ scope?: string, projectName?: string, structureType?: string, includeLists?: boolean }} options
 * includeLists=false → counts/filters/index only (no fat PDF row arrays).
 */
export async function listUnmatchedShmReports(options = {}) {
  const scope = String(options.scope || 'bmc').toLowerCase()
  const projectName = String(options.projectName || '').trim()
  const structureType = String(options.structureType || '').trim()
  // Default: only ship row lists when a project is selected (keeps first paint light).
  const includeLists =
    options.includeLists === true ||
    (options.includeLists !== false && Boolean(projectName))

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

  const lidar = includeLists ? filterReports(unmatchedLidar, { projectName, structureType }) : []
  const sar = includeLists ? filterReports(unmatchedSar, { projectName, structureType }) : []

  const projects = buildProjectOptions(unmatchedLidar, unmatchedSar)
  const structureTypes = buildStructureTypeOptions(unmatchedLidar, unmatchedSar)
  const projectTotals = buildProjectTotals(lidarFiles, sarFiles, bridgeMeta)

  return {
    lidar,
    sar,
    listsIncluded: includeLists,
    counts: {
      total: includeLists
        ? lidar.length + sar.length
        : unmatchedLidar.length + unmatchedSar.length,
      lidar: includeLists ? lidar.length : unmatchedLidar.length,
      sar: includeLists ? sar.length : unmatchedSar.length,
      lidarAll: unmatchedLidar.length,
      sarAll: unmatchedSar.length,
    },
    filters: { projects, structureTypes },
    projectTotals,
    // Compact presence index for inspection-table icons (no file payloads).
    chainageIndex: {
      lidar: uniqueChainageKeys(lidarFiles),
      sar: uniqueChainageKeys(sarFiles),
    },
  }
}
