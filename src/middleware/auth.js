import jwt from 'jsonwebtoken'

const secret = () => process.env.JWT_SECRET || 'bms-dev-secret-change-in-production'

export function signToken(payload) {
  return jwt.sign(payload, secret(), { expiresIn: '7d' })
}

export function optionalAuth(req, res, next) {
  const h = req.headers.authorization
  if (!h || !h.startsWith('Bearer ')) {
    req.user = null
    return next()
  }
  try {
    req.user = jwt.verify(h.slice(7), secret())
  } catch {
    req.user = null
  }
  next()
}

export function requireAuth(req, res, next) {
  const h = req.headers.authorization
  if (!h || !h.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' })
  }
  try {
    req.user = jwt.verify(h.slice(7), secret())
    next()
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' })
  }
}
