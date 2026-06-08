/**
 * Verify Railway bucket credentials from .env
 * Usage: node scripts/test-bucket-connection.mjs
 */
import dotenv from 'dotenv'
import {
  storageStatus,
  isStorageEnabled,
  uploadBuffer,
  objectExists,
  getPresignedUrl,
} from '../src/lib/storage.js'

dotenv.config()

const status = storageStatus()
console.log('Storage config:', { ...status, enabled: isStorageEnabled() })

if (!isStorageEnabled()) {
  console.error('Bucket not configured. Set AWS_* vars in .env or Railway Variables.')
  process.exit(1)
}

const testKey = `upload/_connection_test/${Date.now()}.txt`
const body = Buffer.from(`BMS bucket test ${new Date().toISOString()}`)

try {
  await uploadBuffer(body, testKey, 'text/plain')
  const exists = await objectExists(testKey)
  const url = await getPresignedUrl(testKey, 300)
  console.log('Upload OK:', testKey)
  console.log('Exists:', exists)
  console.log('Presigned URL (5 min):', url ? `${url.slice(0, 80)}...` : null)
  console.log('\nBucket connection successful.')
} catch (e) {
  console.error('Bucket connection FAILED:', e.message)
  process.exit(1)
}
