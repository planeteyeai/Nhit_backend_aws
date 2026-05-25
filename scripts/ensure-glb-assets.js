import { runEnsureGlbAssets } from '../src/lib/glbEnsure.js'

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))
if (process.env.NODE_ENV !== 'production' && !process.env.FORCE_GLB_ENSURE) {
  console.log('[ensure-glb] set NODE_ENV=production or FORCE_GLB_ENSURE=1 to run')
  process.exit(0)
}

runEnsureGlbAssets()
  .then((s) => {
    if (s.ready === 0) process.exitCode = 1
  })
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
