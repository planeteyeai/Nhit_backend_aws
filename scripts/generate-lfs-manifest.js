/**
 * Build upload/model_3d/lfs-manifest.json from Git LFS pointer blobs in HEAD.
 * Commit this file so Railway can download GLBs without pointer files on disk.
 */
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const modelDir = path.join(root, 'upload', 'model_3d')
const catalog = JSON.parse(fs.readFileSync(path.join(modelDir, 'models.json'), 'utf8'))
const entries = Array.isArray(catalog.models) ? catalog.models : []

const files = []
for (const entry of entries) {
  const file = /\.glb$/i.test(entry) ? entry : `${entry}.glb`
  const gitPath = `HEAD:upload/model_3d/${file}`
  let text = ''
  try {
    text = execSync(`git show ${JSON.stringify(gitPath)}`, { encoding: 'utf8', cwd: root })
  } catch (e) {
    console.error('git show failed:', file, e.message)
    continue
  }
  const oid = text.match(/^oid (.+)$/m)?.[1]?.trim()
  const size = parseInt(text.match(/^size (.+)$/m)?.[1] || '0', 10)
  if (!oid || !size) {
    console.error('not a pointer in git:', file)
    continue
  }
  files.push({ file, oid, size })
}

const manifest = {
  repo: process.env.GITHUB_LFS_REPO || 'planeteyeai/nhit-backend1',
  branch: 'main',
  files,
}
const out = path.join(modelDir, 'lfs-manifest.json')
fs.writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Wrote ${files.length} entries to ${out}`)
