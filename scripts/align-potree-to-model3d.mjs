/**
 * Compare LAS in upload/model_3d/{project}/… with Potree in upload/potree/{project}/…
 * Align potree project folders to match model_3d (source of truth by chainage).
 *
 *   node scripts/align-potree-to-model3d.mjs           # report only
 *   node scripts/align-potree-to-model3d.mjs --execute # aws s3 mv misaligned potree folders
 */
import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parseChainageKmFromName } from '../src/lib/potreeProjects.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const MODEL3D = 's3://nhitbucket/upload/model_3d/'
const POTREE = 's3://nhitbucket/upload/potree/'
const EXECUTE = process.argv.includes('--execute')
const LAS_RE = /\.(las|laz)$/i

function loadEnv() {
  const envPath = path.join(ROOT, '.env')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!m) continue
    let val = m[2].trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!process.env[m[1]]) process.env[m[1]] = val
  }
  process.env.AWS_DEFAULT_REGION =
    process.env.AWS_DEFAULT_REGION || process.env.AWS_S3_REGION_NAME || 'ap-south-1'
}

function aws(args) {
  const res = spawnSync('aws', args, {
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 128 * 1024 * 1024,
  })
  if (res.status !== 0) {
    throw new Error(`aws ${args.slice(0, 4).join(' ')}… failed: ${(res.stderr || res.stdout || '').trim()}`)
  }
  return res.stdout || ''
}

function listRecursive(prefix) {
  const out = aws(['s3', 'ls', prefix, '--recursive'])
  const rows = []
  for (const line of out.split(/\r?\n/)) {
    // 2026-07-01 10:16:40   58221748 path/to/file
    const m = line.match(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+(\d+)\s+(.+)$/)
    if (!m) continue
    rows.push({ size: Number(m[1]), key: m[2].trim() })
  }
  return rows
}

function chainageKeyFromKm(km) {
  if (km == null || !Number.isFinite(km)) return null
  const whole = Math.floor(km + 1e-9)
  const meters = Math.round((km - whole) * 1000)
  return `${whole}+${String(meters).padStart(3, '0')}`
}

function parseChainageKey(name) {
  const raw = String(name || '')
  const plus = raw.match(/(\d+)\s*\+\s*(\d+)/)
  if (plus) return `${Number(plus[1])}+${String(Number(plus[2])).padStart(3, '0')}`
  const km = parseChainageKmFromName(raw)
  return chainageKeyFromKm(km)
}

function projectFromKey(key, rootPrefix) {
  const rel = String(key || '').slice(rootPrefix.length)
  const parts = rel.split('/').filter(Boolean)
  if (parts.length < 2) return { project: '', leaf: parts[0] || '' }
  return { project: parts[0], leaf: parts[parts.length - 1] }
}

function buildLasIndex(objects) {
  const byChainage = new Map() // key -> [{project, key, file}]
  const noChainage = []
  for (const obj of objects) {
    if (!LAS_RE.test(obj.key)) continue
    const { project, leaf } = projectFromKey(obj.key, 'upload/model_3d/')
    if (!project) continue
    const ch = parseChainageKey(leaf) || parseChainageKey(obj.key)
    if (!ch) {
      noChainage.push({ project, key: obj.key, file: leaf })
      continue
    }
    if (!byChainage.has(ch)) byChainage.set(ch, [])
    byChainage.get(ch).push({ project, key: obj.key, file: leaf, size: obj.size })
  }
  return { byChainage, noChainage }
}

function buildPotreeIndex(objects) {
  // model folder = path containing metadata.json
  const models = new Map() // modelRelPath -> {project, model, chainageKey, files}
  for (const obj of objects) {
    const rel = obj.key.slice('upload/potree/'.length)
    const parts = rel.split('/').filter(Boolean)
    if (parts.length < 2) continue
    const file = parts[parts.length - 1]
    if (!['metadata.json', 'hierarchy.bin', 'octree.bin', 'log.txt'].includes(file)) continue
    const modelPath = parts.slice(0, -1).join('/')
    const project = parts.length >= 3 ? parts[0] : ''
    const model = parts[parts.length - 2]
    if (!models.has(modelPath)) {
      models.set(modelPath, {
        project,
        model,
        modelPath,
        chainageKey: parseChainageKey(model),
        files: {},
      })
    }
    models.get(modelPath).files[file] = obj.size
  }
  const complete = []
  const incomplete = []
  for (const m of models.values()) {
    const ok = m.files['metadata.json'] && m.files['hierarchy.bin'] && m.files['octree.bin']
    if (ok) complete.push(m)
    else incomplete.push(m)
  }
  const byChainage = new Map()
  for (const m of complete) {
    if (!m.chainageKey) continue
    if (!byChainage.has(m.chainageKey)) byChainage.set(m.chainageKey, [])
    byChainage.get(m.chainageKey).push(m)
  }
  return { complete, incomplete, byChainage }
}

function main() {
  loadEnv()
  console.log(EXECUTE ? 'MODE: EXECUTE' : 'MODE: REPORT (dry-run)')
  console.log('Listing model_3d LAS…')
  const lasObjs = listRecursive(MODEL3D)
  console.log('Listing potree…')
  const potreeObjs = listRecursive(POTREE)

  const las = buildLasIndex(lasObjs)
  const potree = buildPotreeIndex(potreeObjs)

  console.log(`\nLAS files with chainage: ${[...las.byChainage.values()].reduce((n, a) => n + a.length, 0)}`)
  console.log(`LAS unique chainages: ${las.byChainage.size}`)
  console.log(`LAS no-chainage: ${las.noChainage.length}`)
  console.log(`Potree complete models: ${potree.complete.length}`)
  console.log(`Potree unique chainages: ${potree.byChainage.size}`)

  const lasProjects = new Map()
  for (const [ch, rows] of las.byChainage) {
    for (const r of rows) {
      if (!lasProjects.has(r.project)) lasProjects.set(r.project, new Set())
      lasProjects.get(r.project).add(ch)
    }
  }
  console.log('\n=== model_3d project → LAS chainage count ===')
  for (const [p, set] of [...lasProjects.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${p}: ${set.size} unique chainages, files=${[...las.byChainage.values()].flat().filter((x) => x.project === p).length}`)
  }

  const potreeProjects = new Map()
  for (const m of potree.complete) {
    const p = m.project || '(root)'
    if (!potreeProjects.has(p)) potreeProjects.set(p, [])
    potreeProjects.get(p).push(m)
  }
  console.log('\n=== potree project → model count ===')
  for (const [p, rows] of [...potreeProjects.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${p}: ${rows.length}`)
  }

  // Canonical project for a chainage = first LAS project folder (model_3d is source of truth)
  const chainageToLasProject = new Map()
  for (const [ch, rows] of las.byChainage) {
    const projects = [...new Set(rows.map((r) => r.project))]
    chainageToLasProject.set(ch, { project: projects[0], allProjects: projects, files: rows })
  }

  const matched = []
  const wrongFolder = []
  const potreeOnly = []
  const lasOnly = []
  const moves = []

  for (const [ch, meta] of chainageToLasProject) {
    const potreeModels = potree.byChainage.get(ch) || []
    if (!potreeModels.length) {
      lasOnly.push({ chainage: ch, lasProject: meta.project, lasFiles: meta.files.map((f) => f.file) })
      continue
    }
    for (const pm of potreeModels) {
      if (pm.project === meta.project) {
        matched.push({ chainage: ch, project: meta.project, potreePath: pm.modelPath })
      } else {
        const dest = `${meta.project}/${pm.model}`
        wrongFolder.push({
          chainage: ch,
          lasProject: meta.project,
          potreeProject: pm.project || '(root)',
          potreePath: pm.modelPath,
          dest,
        })
        if (pm.modelPath !== dest) {
          moves.push({ from: pm.modelPath, to: dest, chainage: ch })
        }
      }
    }
  }

  for (const [ch, models] of potree.byChainage) {
    if (!chainageToLasProject.has(ch)) {
      for (const pm of models) {
        potreeOnly.push({
          chainage: ch,
          potreeProject: pm.project || '(root)',
          potreePath: pm.modelPath,
        })
      }
    }
  }

  // Potree models with no parseable chainage
  const potreeNoCh = potree.complete.filter((m) => !m.chainageKey)

  console.log('\n========== SUMMARY ==========')
  console.log(`Matched (same project):     ${matched.length}`)
  console.log(`Wrong potree folder:        ${wrongFolder.length}`)
  console.log(`LAS only (no potree):       ${lasOnly.length}`)
  console.log(`Potree only (no LAS):       ${potreeOnly.length}`)
  console.log(`Potree no chainage parse:   ${potreeNoCh.length}`)
  console.log(`LAS no chainage parse:      ${las.noChainage.length}`)

  console.log('\n=== WRONG FOLDER (LAS project ≠ potree project) ===')
  for (const row of wrongFolder.slice(0, 80)) {
    console.log(
      `  ${row.chainage}: LAS[${row.lasProject}]  potree[${row.potreeProject}]  ${row.potreePath} → ${row.dest}`,
    )
  }
  if (wrongFolder.length > 80) console.log(`  ... +${wrongFolder.length - 80} more`)

  console.log('\n=== LAS ONLY (converted missing) ===')
  for (const row of lasOnly.slice(0, 60)) {
    console.log(`  ${row.chainage}: ${row.lasProject}  files=${row.lasFiles.join(' | ')}`)
  }
  if (lasOnly.length > 60) console.log(`  ... +${lasOnly.length - 60} more`)

  console.log('\n=== POTREE ONLY (no matching LAS chainage) ===')
  for (const row of potreeOnly.slice(0, 60)) {
    console.log(`  ${row.chainage}: potree[${row.potreeProject}]  ${row.potreePath}`)
  }
  if (potreeOnly.length > 60) console.log(`  ... +${potreeOnly.length - 60} more`)

  if (las.noChainage.length) {
    console.log('\n=== LAS NO CHAINAGE ===')
    for (const row of las.noChainage.slice(0, 40)) {
      console.log(`  [${row.project}] ${row.file}`)
    }
  }
  if (potreeNoCh.length) {
    console.log('\n=== POTREE NO CHAINAGE ===')
    for (const row of potreeNoCh.slice(0, 40)) {
      console.log(`  [${row.project}] ${row.modelPath}`)
    }
  }

  const report = {
    matched: matched.length,
    wrongFolder,
    lasOnly,
    potreeOnly,
    lasNoChainage: las.noChainage,
    potreeNoChainage: potreeNoCh.map((m) => ({ project: m.project, path: m.modelPath })),
    moves,
    lasProjects: Object.fromEntries([...lasProjects].map(([k, v]) => [k, v.size])),
    potreeProjects: Object.fromEntries([...potreeProjects].map(([k, v]) => [k, v.length])),
  }
  const reportPath = path.join(ROOT, 'scripts', '_potree-model3d-align-report.json')
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log('\nWrote', reportPath)

  if (!EXECUTE) {
    console.log('\nDry-run only. Re-run with --execute to move misaligned potree folders to model_3d project names.')
    return
  }

  let ok = 0
  let fail = 0
  for (let i = 0; i < moves.length; i += 1) {
    const row = moves[i]
    const src = `${POTREE}${row.from}/`
    const dst = `${POTREE}${row.to}/`
    process.stdout.write(`[${i + 1}/${moves.length}] mv ${row.from} → ${row.to} ... `)
    try {
      aws(['s3', 'mv', src, dst, '--recursive'])
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
