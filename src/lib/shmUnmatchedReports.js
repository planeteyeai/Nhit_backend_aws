/**
 * SAR / LIDAR PDFs in S3 that do not match any approved inspection chainage.
 */
import { pool } from '../config/db.js'
import { extractChainageKey } from './lidarReports.js'
import { listLidarReportFiles } from './lidarReports.js'
import { listSarReportFiles } from './sarReports.js'

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

function enrichReport(report, bridgeMeta) {
  const meta = bridgeMeta.get(report.chainageKey) || {}
  return {
    ...report,
    chainage: report.chainageKey,
    projectName: meta.projectName || '—',
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

  const unmatchedLidar = lidarFiles
    .filter((f) => f.chainageKey && !approvedKeys.has(f.chainageKey))
    .map((f) => enrichReport(f, bridgeMeta))

  const lidar = filterReports(unmatchedLidar, { projectName, structureType })
  const sar = filterReports(unmatchedSar, { projectName, structureType })

  const projects = [...new Set([...unmatchedLidar, ...unmatchedSar].map((r) => r.projectName).filter((p) => p && p !== '—'))].sort()
  const structureTypes = [
    ...new Set(
      [...unmatchedLidar, ...unmatchedSar]
        .map((r) => String(r.structureType || '').trim().toUpperCase())
        .filter(Boolean)
    ),
  ].sort()

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
