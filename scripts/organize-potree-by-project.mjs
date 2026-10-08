/**
 * Organize s3://nhitbucket/upload/potree/ into project folders by chainage.
 *
 * Usage:
 *   node scripts/organize-potree-by-project.mjs           # dry-run
 *   node scripts/organize-potree-by-project.mjs --execute # perform aws s3 mv
 */
import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  EXISTING_PROJECT_DIRS,
  parseChainageKmFromName,
  resolvePotreeProject,
} from '../src/lib/potreeProjects.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const BUCKET = 's3://nhitbucket/upload/potree/'
const EXECUTE = process.argv.includes('--execute')

function loadEnv() {
  const envPath = path.join(ROOT, '.env')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!m) continue
    const key = m[1]
    let val = m[2].trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
  process.env.AWS_DEFAULT_REGION = process.env.AWS_DEFAULT_REGION || process.env.AWS_S3_REGION_NAME || 'ap-south-1'
}

function aws(args, { inherit = false } = {}) {
  const res = spawnSync('aws', args, {
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 64 * 1024 * 1024,
    stdio: inherit ? 'inherit' : 'pipe',
  })
  if (res.status !== 0) {
    const err = (res.stderr || res.stdout || '').trim()
    throw new Error(`aws ${args.join(' ')} failed: ${err || res.status}`)
  }
  return res.stdout || ''
}

function listTopLevelPrefixes() {
  const out = aws(['s3', 'ls', BUCKET])
  const dirs = []
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^\s*PRE\s+(.+\/)\s*$/)
    if (m) dirs.push(m[1].replace(/\/$/, ''))
  }
  return dirs
}

function planMoves(topDirs) {
  const plan = []
  const unmatched = []
  const already = []

  for (const dir of topDirs) {
    if (EXISTING_PROJECT_DIRS.has(dir)) {
      already.push(dir)
      continue
    }
    // Nested leftover? skip unknown project parents
    if (dir.includes('/')) continue

    const km = parseChainageKmFromName(dir)
    const project = resolvePotreeProject(km)
    if (!project) {
      unmatched.push({ dir, km })
      continue
    }
    const dest = `${project}/${dir}`
    plan.push({ from: dir, to: dest, project, km })
  }
  return { plan, unmatched, already }
}

function main() {
  loadEnv()
  console.log(EXECUTE ? 'MODE: EXECUTE (aws s3 mv)' : 'MODE: DRY-RUN (no changes)')
  console.log('Listing', BUCKET, '...')
  const topDirs = listTopLevelPrefixes()
  console.log('Top-level prefixes:', topDirs.length)

  const { plan, unmatched, already } = planMoves(topDirs)
  console.log('\nAlready project folders:', already.length, already.join(', ') || '(none)')
  console.log('To move:', plan.length)
  console.log('Unmatched:', unmatched.length)

  const byProject = new Map()
  for (const row of plan) {
    if (!byProject.has(row.project)) byProject.set(row.project, [])
    byProject.get(row.project).push(row)
  }
  for (const [project, rows] of [...byProject.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`\n=== ${project} (${rows.length}) ===`)
    for (const r of rows.slice(0, 8)) {
      console.log(`  ${r.from}  (km ${r.km?.toFixed?.(3) ?? r.km})`)
    }
    if (rows.length > 8) console.log(`  ... +${rows.length - 8} more`)
  }

  if (unmatched.length) {
    console.log('\n=== UNMATCHED (leave at root) ===')
    for (const u of unmatched.slice(0, 40)) {
      console.log(`  ${u.dir}  km=${u.km ?? 'n/a'}`)
    }
    if (unmatched.length > 40) console.log(`  ... +${unmatched.length - 40} more`)
  }

  const reportPath = path.join(ROOT, 'scripts', '_potree-organize-plan.json')
  fs.writeFileSync(reportPath, JSON.stringify({ plan, unmatched, already, execute: EXECUTE }, null, 2))
  console.log('\nWrote plan:', reportPath)

  if (!EXECUTE) {
    console.log('\nDry-run only. Re-run with --execute to move.')
    return
  }

  let ok = 0
  let fail = 0
  for (let i = 0; i < plan.length; i += 1) {
    const row = plan[i]
    const src = `${BUCKET}${row.from}/`
    const dst = `${BUCKET}${row.to}/`
    process.stdout.write(`[${i + 1}/${plan.length}] mv ${row.from} → ${row.to} ... `)
    try {
      aws(['s3', 'mv', src, dst, '--recursive'], { inherit: false })
      ok += 1
      console.log('ok')
    } catch (e) {
      fail += 1
      console.log('FAIL')
      console.error(e.message)
    }
  }
  console.log(`\nDone. moved=${ok} failed=${fail}`)
}

main()
