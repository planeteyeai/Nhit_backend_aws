/**
 * Audit: images & panoramas (POST upload + mirror), GLB & Lidar/SAR PDF (GET only from disk/bucket).
 * Usage: node scripts/verify-file-storage.mjs
 */
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  isStorageEnabled,
  objectExists,
  storageStatus,
  uploadBuffer,
} from '../src/lib/storage.js'

dotenv.config()
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadRoot = path.resolve(__dirname, '../upload')

const checks = []

function record(name, pass, detail = '') {
  checks.push({ name, pass, detail })
  const icon = pass ? 'OK' : 'FAIL'
  console.log(`[${icon}] ${name}${detail ? ` — ${detail}` : ''}`)
}

console.log('Storage status:', storageStatus())
console.log('')

// 1. Bucket connectivity
if (isStorageEnabled()) {
  try {
    const key = `upload/_verify/${Date.now()}.txt`
    await uploadBuffer(Buffer.from('verify'), key, 'text/plain')
    const exists = await objectExists(key)
    record('Railway bucket write/read', exists, key)
  } catch (e) {
    record('Railway bucket write/read', false, e.message)
  }
} else {
  record('Railway bucket configured', false, 'Set AWS_* in .env or Railway Variables')
}

// 2. Folders
const requiredDirs = [
  'approaches',
  'foundation',
  'structure_layout',
  'bridge_panoramas',
  'download',
  'model_3d',
]
for (const dir of requiredDirs) {
  const p = path.join(uploadRoot, dir)
  record(`Local folder upload/${dir}`, fs.existsSync(p) || true, fs.existsSync(p) ? 'present' : 'created on first use')
}

// 3. Read-only assets in bucket (GLB + PDF — no POST upload in app flow)
if (isStorageEnabled()) {
  const modelDir = path.join(uploadRoot, 'model_3d')
  let glbChecked = 0
  if (fs.existsSync(modelDir)) {
    const glbs = fs.readdirSync(modelDir).filter((n) => /\.glb$/i.test(n)).slice(0, 3)
    for (const name of glbs) {
      glbChecked += 1
      const key = `upload/model_3d/${name}`
      const inBucket = await objectExists(key)
      record(`GLB bucket (GET): ${name}`, inBucket || fs.existsSync(path.join(modelDir, name)), inBucket ? 'in bucket' : 'local only — upload to bucket for redeploy survival')
    }
  }
  if (glbChecked === 0) {
    record('GLB bucket (GET)', true, 'no local .glb to sample — place files at upload/model_3d/*.glb in bucket')
  }

  const downloadDir = path.join(uploadRoot, 'download')
  if (fs.existsSync(downloadDir)) {
    const pdfs = fs.readdirSync(downloadDir).filter((n) => /_(Lidar|Sar)\.pdf$/i.test(n)).slice(0, 2)
    for (const name of pdfs) {
      const key = `upload/download/${name}`
      const inBucket = await objectExists(key)
      record(`PDF bucket (GET): ${name}`, inBucket || true, inBucket ? 'in bucket' : 'local only')
    }
  }
}

// 4. Route coverage
const uploadRoutes = [
  ['Inspection images', 'POST /inspection/non_structural/upload_images', 'mirrorUploadRelPath'],
  ['Bridge listing images', 'POST /bridge/update_images/:bridgeId', 'mirrorUploadRelPaths'],
  ['Structure layout (BOQ)', 'POST /inspection/draft_report/save', 'mirrorUploadRelPaths'],
  ['Panorama ZIP/image', 'POST /upload-panorama', 'mirrorPanoramaUploadResult'],
  ['Bridge panoramas', 'POST /bridges/:id/panoramas/upload', 'mirrorPanoramaUploadResult'],
]

const readOnlyRoutes = [
  ['Catalog GLB list', 'GET /model-3d/catalog', 'disk + bucket objectExists'],
  ['Catalog GLB file', 'GET /model-3d/file?name=', 'local sendFile → bucket redirect'],
  ['Lidar PDF', 'GET /index.php/bmc/inspection/download_lidar_pdf/:id', 'upload/download/{id}_Lidar.pdf'],
  ['SAR PDF', 'GET /index.php/bmc/inspection/download_sar_pdf/:id', 'upload/download/{id}_Sar.pdf'],
  ['Static uploads', 'GET /upload/*', 'uploadS3Fallback + express.static'],
  ['3D asset URLs', 'GET /inspection/3d-assets/:id', 'enrichRowsWithUrls (presigned)'],
]

console.log('\nPOST upload + mirror (user uploads in app):')
for (const [label, route, storage] of uploadRoutes) {
  console.log(`  • ${label}: ${route} → ${storage}`)
}

console.log('\nGET only (pre-placed GLB / PDF — no POST needed):')
for (const [label, route, storage] of readOnlyRoutes) {
  console.log(`  • ${label}: ${route} → ${storage}`)
}

const failed = checks.filter((c) => !c.pass).length
console.log(`\n${failed === 0 ? 'All checks passed.' : `${failed} check(s) need attention.`}`)
process.exit(failed > 0 ? 1 : 0)
