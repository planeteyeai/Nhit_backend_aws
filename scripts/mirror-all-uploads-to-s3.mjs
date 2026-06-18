/**
 * One-time / maintenance: mirror every file under backend/upload/ to the Railway S3 bucket.
 * Skips when STORAGE_BACKEND=local or bucket credentials are missing.
 *
 * Usage: node scripts/mirror-all-uploads-to-s3.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { isStorageEnabled, mirrorUploadDirectory, storageStatus } from '../src/lib/storage.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadRoot = path.resolve(__dirname, '../upload')

const TOP_LEVEL_FOLDERS = [
  'approaches',
  'protection',
  'waterway',
  'foundation',
  'substructure',
  'subways',
  'add_bearing_and_pedistal',
  'add_superstructure',
  'add_expansion_joints',
  'add_wearing_coat',
  'add_drainage_spouts_and_vest_holes',
  'add_handrails_parapets_crash_barriers',
  'add_utilities',
  'non_structural_elements',
  'bridge_images',
  'panaroma_3d',
  'threed_panoramas',
  'inspection_3d_assets',
  'structure_layout',
  'download',
  'sign',
  'model_3d',
]

async function main() {
  const st = storageStatus()
  console.log('[mirror-all] storage:', st)
  if (!isStorageEnabled()) {
    console.error('[mirror-all] S3 storage is not enabled — set AWS_* env vars or STORAGE_BACKEND=s3')
    process.exit(1)
  }
  if (!fs.existsSync(uploadRoot)) {
    console.log('[mirror-all] upload root does not exist:', uploadRoot)
    return
  }

  let totalOk = 0
  let totalFailed = 0

  for (const folder of TOP_LEVEL_FOLDERS) {
    const localDir = path.join(uploadRoot, folder)
    if (!fs.existsSync(localDir)) {
      console.log(`[mirror-all] skip (missing): ${folder}`)
      continue
    }
    const r = await mirrorUploadDirectory(`upload/${folder}`, uploadRoot)
    totalOk += r.ok
    totalFailed += r.failed
    console.log(`[mirror-all] ${folder}: ok=${r.ok} failed=${r.failed}`)
  }

  console.log(`[mirror-all] done — ok=${totalOk} failed=${totalFailed}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
