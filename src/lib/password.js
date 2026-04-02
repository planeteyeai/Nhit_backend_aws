import crypto from 'crypto'

export function md5Hex(str) {
  return crypto.createHash('md5').update(String(str), 'utf8').digest('hex')
}

export function verifyPassword(stored, plain) {
  if (!stored || !plain) return false
  const s = String(stored).trim()
  const p = String(plain).trim()
  if (/^[a-f0-9]{32}$/i.test(s)) {
    return s.toLowerCase() === md5Hex(p).toLowerCase()
  }
  return s === p
}
