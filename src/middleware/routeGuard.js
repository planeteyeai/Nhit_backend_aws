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

  return false
}

/**
 * Require JWT for all BMS API routes except explicitly public login/logout paths.
 * Applies in every environment so local/dev cannot expose bridge / user data anonymously.
 */
export function productionRouteGuard(req, res, next) {
  if (isPublicRoute(req)) return next()
  return requireAuth(req, res, next)
}
