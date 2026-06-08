import { requireAuth } from './auth.js'
import { isProduction } from '../lib/envValidate.js'

/** Routes that stay public in production (login only). */
function isPublicRoute(req) {
  const path = String(req.path || '').replace(/\/+$/, '') || '/'
  const method = req.method

  if (method === 'OPTIONS') return true

  if (method === 'POST' && (path === '/login' || path === '/login_con/check_login' || path === '/logout')) {
    return true
  }

  return false
}

/** Require JWT for all BMS API routes in production except login/logout. */
export function productionRouteGuard(req, res, next) {
  if (!isProduction()) return next()
  if (isPublicRoute(req)) return next()
  return requireAuth(req, res, next)
}
