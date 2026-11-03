import { requireAuth } from './auth.js'

/** Site photo reads — img tags cannot send Authorization headers. */
function isPublicBridgeImageRead(req) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false
  const path = String(req.path || '').replace(/\/+$/, '') || '/'
  return /^\/upload\/bridge_images\/\d+(?:\/[^/]+)?$/.test(path)
}

/** SAR / LIDAR PDF stream — opened in a new tab without Authorization headers. */
function isPublicShmPdfRead(req) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false
  const path = String(req.path || '').replace(/\/+$/, '') || '/'
  return path === '/sar-reports/file' || path === '/lidar-reports/file'
}

/** Potree octree streaming — potree-core Range GETs; allow without JWT (S3 objects are not secret). */
function isPublicPotreeRead(req) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false
  const path = String(req.path || '').replace(/\/+$/, '') || '/'
  if (path === '/potree-models') return true
  // Nested project/model paths use real slashes. A single %2F segment is also valid.
  if (!path.startsWith('/potree-models/') || path.includes('..')) return false
  const file = path.slice(path.lastIndexOf('/') + 1)
  let decoded = file
  try {
    decoded = decodeURIComponent(file)
  } catch {
    /* keep raw */
  }
  // inspection.json / classification.* are the Bridge Inspection sidecars that sit beside metadata.json.
  return [
    'metadata.json',
    'hierarchy.bin',
    'octree.bin',
    'log.txt',
    'inspection.json',
    'classification.json',
    'classification.vol.z',
  ].includes(decoded)
}

/** InSAR workbook bytes for dashboard iframe (no JWT — same pattern as Potree reads). */
function isPublicInsarWorkbook(req) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false
  const path = String(req.path || '').replace(/\/+$/, '') || '/'
  return path === '/insar/workbook' || path === '/insar/status'
}

/** Routes that stay public (login / logout / CORS preflight / public image reads). */
function isPublicRoute(req) {
  const path = String(req.path || '').replace(/\/+$/, '') || '/'
  const method = req.method

  if (method === 'OPTIONS') return true

  // ECS/ALB probes — never require JWT (also registered on app before this guard).
  if (
    (method === 'GET' || method === 'HEAD') &&
    (path === '/health' || path === '/api/health' || path === '/' || path === '/api')
  ) {
    return true
  }

  if (method === 'POST' && (path === '/login' || path === '/login_con/check_login' || path === '/logout')) {
    return true
  }

  if (isPublicBridgeImageRead(req)) return true
  if (isPublicShmPdfRead(req)) return true
  if (isPublicPotreeRead(req)) return true
  if (isPublicInsarWorkbook(req)) return true

  // Static BOQ / form dropdown constants (no sensitive data).
  if (
    (method === 'GET' || method === 'HEAD') &&
    (path === '/php/constants' || path.startsWith('/php/constants/'))
  ) {
    return true
  }

  return false
}

/**
 * Require JWT for all BMS API routes except explicitly public login/logout paths.
 * Point-cloud measurement writes are authenticated (no anonymous PUT/PATCH).
 */
export function productionRouteGuard(req, res, next) {
  if (isPublicRoute(req)) return next()
  return requireAuth(req, res, next)
}
