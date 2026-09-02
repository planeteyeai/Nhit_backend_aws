/**
 * Convert pending LAS/LAZ files from S3 upload/model_3d/ to Potree in upload/potree/.
 *
 * Usage:
 *   npm run potree:pending          — list files awaiting conversion
 *   npm run potree:convert          — convert 1 pending file
 *   node scripts/las-to-potree-worker.mjs --max=3
 */
import 'dotenv/config'
import { convertPendingLasFiles, listPendingLasConversions } from '../src/lib/lasToPotree.js'

const args = process.argv.slice(2)
const listOnly = args.includes('--list')
const maxArg = args.find((a) => a.startsWith('--max='))
const maxFiles = maxArg ? Number(maxArg.split('=')[1]) : Number(process.env.POTREE_CONVERT_MAX || 1)

async function main() {
  const pending = await listPendingLasConversions()
  console.log(`Pending LAS/LAZ files: ${pending.length}`)
  for (const p of pending) {
    console.log(`  - ${p.fileName} (${p.chainageKey || 'no chainage'}) ${Math.round((p.sizeBytes || 0) / 1e6)} MB`)
  }

  if (listOnly) return

  if (!pending.length) {
    console.log('Nothing to convert.')
    return
  }

  console.log(`\nConverting up to ${maxFiles} file(s)...`)
  const result = await convertPendingLasFiles({ maxFiles })
  console.log(JSON.stringify(result, null, 2))
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
