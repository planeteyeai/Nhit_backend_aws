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
  return path === '/potree-models' || /^\/potree-models\/[^/]+\/[^/]+$/.test(path)
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

  if (method === 'POST' && (path === '/login' || path === '/login_con/check_login' || path === '/logout')) {
    return true
  }

  if (isPublicBridgeImageRead(req)) return true
  if (isPublicShmPdfRead(req)) return true
  if (isPublicPotreeRead(req)) return true
  if (isPublicPointCloudDataWrite(req)) return true
  if (isPublicInsarWorkbook(req)) return true

  return false
}

/** Point-cloud measurement/image sync from Potree iframe (Bearer preferred; optionalAuth on route). */
function isPublicPointCloudDataWrite(req) {
  const path = String(req.path || '').replace(/\/+$/, '') || '/'
  const byBridge = /^\/bridges\/\d+\/point-cloud-data(?:\/images(?:\/[^/]+)?)?$/.test(path)
  const byCloud = path === '/point-cloud-data' || path.startsWith('/point-cloud-data/images')
  if (!byBridge && !byCloud) return false
  return req.method === 'GET' || req.method === 'PUT' || req.method === 'PATCH' || req.method === 'OPTIONS'
}

/**
 * Require JWT for all BMS API routes except explicitly public login/logout paths.
 * Applies in every environment so local/dev cannot expose bridge / user data anonymously.
 */
export function productionRouteGuard(req, res, next) {
  if (isPublicRoute(req)) return next()
  return requireAuth(req, res, next)
}
