/**
 * Backfill classifier sidecars for an existing Potree cloud on S3.
 *
 * Usage:
 *   node scripts/classify-and-upload.mjs <folder>
 *   e.g.  node scripts/classify-and-upload.mjs "Chithorgarh+to+Kota/1791183335316-box-culvert-893-272-tdx-cleaned-dr31r0"
 *
 * Reads POTREE_BUCKET_PREFIX/<folder>/{metadata.json,hierarchy.bin,octree.bin} from the bucket,
 * runs scripts classifier (src/pointcloudViewer/bridge/classify-octree.js), then uploads
 * classification.json + classification.vol.z back under the same prefix.
 * Nothing in the original octree is overwritten.
 */
import 'dotenv/config'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { downloadObjectToFile, uploadFromFile, objectExists } from '../src/lib/storage.js'
import { POTREE_BUCKET_PREFIX } from '../src/lib/potreeModels.js'

const SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'pointcloudViewer',
  'bridge',
  'classify-octree.js',
)

async function run(folder) {
  if (!folder) throw new Error('Pass a folder, e.g.  node scripts/classify-and-upload.mjs "Agra Bypass/<leaf>"')
  const prefix = `${POTREE_BUCKET_PREFIX}${folder.replace(/^\/+|\/+$/g, '')}`
  console.log(`[backfill] prefix = ${prefix}`)

  for (const f of ['metadata.json', 'hierarchy.bin', 'octree.bin']) {
    const ok = await objectExists(`${prefix}/${f}`)
    if (!ok) throw new Error(`Missing s3://${prefix}/${f} — not a Potree folder.`)
  }

  const localDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ptbackfill-'))
  console.log(`[backfill] scratch dir ${localDir}`)
  try {
    for (const f of ['metadata.json', 'hierarchy.bin', 'octree.bin']) {
      const dest = path.join(localDir, f)
      console.log(`[backfill] download  s3://${prefix}/${f}`)
      await downloadObjectToFile(`${prefix}/${f}`, dest)
      const st = await fs.stat(dest)
      console.log(`             -> ${dest}  (${st.size.toLocaleString()} B)`)
    }

    const t0 = Date.now()
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [SCRIPT, localDir], { stdio: 'inherit', windowsHide: true })
      child.on('error', reject)
      child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`classifier exited with ${code}`))))
    })
    const dt = ((Date.now() - t0) / 1000).toFixed(2)
    console.log(`[backfill] classifier finished in ${dt}s`)

    for (const f of ['classification.json', 'classification.vol.z']) {
      const p = path.join(localDir, f)
      if (!fsSync.existsSync(p)) {
        console.warn(`[backfill] classifier did not produce ${f}; skipping`)
        continue
      }
      const key = `${prefix}/${f}`
      const ct = f.endsWith('.json') ? 'application/json' : 'application/octet-stream'
      console.log(`[backfill] upload    s3://${key}`)
      await uploadFromFile(p, key, ct)
    }
  } finally {
    try { await fs.rm(localDir, { recursive: true, force: true }) } catch {}
  }
  console.log('[backfill] done.')
}

run(process.argv[2]).catch((err) => {
  console.error(err.stack || err.message || String(err))
  process.exit(1)
})
