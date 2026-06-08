import dotenv from 'dotenv'
import { countValidGlbs, runEnsureGlbAssets } from '../src/lib/glbEnsure.js'

dotenv.config()

const tokenSet = Boolean(process.env.GITHUB_TOKEN || process.env.GH_TOKEN)
const { valid, total } = countValidGlbs()

if (valid >= total && total > 0) {
  console.log(`[ensure-glb] already ready (${valid}/${total})`)
  process.exit(0)
}

if (!tokenSet) {
  console.error('[ensure-glb] GITHUB_TOKEN missing in nhit-backend/.env')
  console.error('[ensure-glb] Create a GitHub PAT (repo read) for planeteyeai/nhit-backend1')
  console.error('[ensure-glb] Or clone the repo with git lfs: git lfs install && git lfs pull')
  process.exit(1)
}

console.log(`[ensure-glb] downloading GLBs (${valid}/${total} ready)…`)

runEnsureGlbAssets()
  .then((s) => {
    console.log(`[ensure-glb] finished ${s.ready}/${s.total}`)
    if (s.ready === 0) process.exitCode = 1
  })
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
