/**
 * Project folders under upload/potree/{project}/{model}/
 * Names match upload/model_3d/ (LAS source of truth).
 */

export const POTREE_PROJECTS = [
  { name: 'Shivpuri jhansi', ranges: [[1305.087, 1380.387]] },
  { name: 'Palanpur+Swaroopganj', ranges: [[601, 677]] },
  { name: 'Kalijhar to Patacharkuchi', ranges: [[1013, 1040.3]] },
  { name: 'Kochugaon to Kalijhar', ranges: [[961.5, 1012.999], [30, 92.671]] },
  { name: 'Chithorgarh+to+Kota', ranges: [[891.929, 1052.429]] },
  { name: 'Agra Bypass', ranges: [[0, 32.8]] },
  { name: 'BKRP', ranges: [[36.6, 175]] },
  { name: 'Chichra+-+Kharagpur', ranges: [[129, 185.15], [16.13, 72.25]] },
]

/** Known top-level project directory names (model_3d + potree). */
export const EXISTING_PROJECT_DIRS = new Set([
  'Agra Bypass',
  'BKRP',
  'Chithorgarh+to+Kota',
  'Palanpur+Swaroopganj',
  'Chichra+-+Kharagpur',
  'Kalijhar to Patacharkuchi',
  'Kochugaon to Kalijhar',
  'Shivpuri jhansi',
  // legacy potree names (pre-align)
  'Abu Road-Swaroopganj',
  'Chichra-Kharagpur',
  'Khaljhar-Pattacharkuchi',
  'Kochugaon-Khaljhar',
  'Shivpuri-Jhansi',
])

export function chainageKeyToKm(key) {
  const m = String(key || '').match(/^(\d+)\+(\d+)$/)
  if (!m) return null
  return Number(m[1]) + Number(m[2]) / 1000
}

export function parseChainageKmFromName(name) {
  // Strip leading upload timestamp: 1789038098772-637-700-cleaned → 637-700-cleaned
  const leaf = String(name || '').replace(/^\d{10,}-/, '')
  const typed = leaf.match(
    /(?:mnb|mjb|vup|pup|rob|bxc|fo|flyover|box-?culvert|slab-?culvert|chainage|re-wall-ch)[_-]?(\d+)[_-](\d+)/i,
  )
  if (typed) return Number(typed[1]) + Number(typed[2]) / 1000
  const mnbStuck = leaf.match(/mnb(\d+)[_-](\d+)/i)
  if (mnbStuck) return Number(mnbStuck[1]) + Number(mnbStuck[2]) / 1000
  // Prefer first km-m pair after timestamp strip: 637-700-cleaned, 56-546-vup, 1328-500-box
  // Also 651-68cleaned-file (missing hyphen before "cleaned")
  const plain = leaf.match(/^(\d{1,4})[_-](\d{1,3})(?:-|$|[a-z])/i)
  if (plain) return Number(plain[1]) + Number(plain[2]) / 1000
  const mid = leaf.match(/(?:^|-)(\d{1,4})[_-](\d{1,3})(?:-|$|[a-z])/i)
  if (mid) return Number(mid[1]) + Number(mid[2]) / 1000
  const plus = leaf.match(/(\d+)\+(\d+)/)
  if (plus) return Number(plus[1]) + Number(plus[2]) / 1000
  return null
}

export function resolvePotreeProject(chainageKm, { alreadyUnderProject = '' } = {}) {
  const existing = String(alreadyUnderProject || '').trim()
  if (existing && EXISTING_PROJECT_DIRS.has(existing)) return existing
  if (chainageKm == null || !Number.isFinite(chainageKm)) return null
  for (const project of POTREE_PROJECTS) {
    for (const [lo, hi] of project.ranges) {
      const min = Math.min(lo, hi)
      const max = Math.max(lo, hi)
      if (chainageKm >= min && chainageKm <= max) return project.name
    }
  }
  return null
}
