import dotenv from 'dotenv'
import { listBucketKeysUnderPrefix } from '../src/lib/storage.js'

dotenv.config()

const prefixes = ['upload/download/SAR/', 'upload/download/sar/', 'upload/download/']
for (const p of prefixes) {
  const keys = await listBucketKeysUnderPrefix(p)
  const files = keys.filter((k) => !k.endsWith('/'))
  console.log(`\n=== ${p} (${files.length}) ===`)
  for (const k of files.slice(0, 80)) console.log(' ', k)
  if (files.length > 80) console.log(`  … ${files.length - 80} more`)
}
