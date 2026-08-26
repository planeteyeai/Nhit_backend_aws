import dotenv from 'dotenv'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'

dotenv.config()

const client = new S3Client({
  region: process.env.AWS_DEFAULT_REGION || process.env.AWS_S3_REGION_NAME,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
})
const bucket = process.env.AWS_S3_BUCKET_NAME || process.env.AWS_STORAGE_BUCKET_NAME
const key = 'upload/download/SAR/609+670_SAR_BXC.pdf'
const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
const chunks = []
for await (const c of out.Body) chunks.push(c)
const buf = Buffer.concat(chunks)
console.log('size', buf.length, 'magic', buf.slice(0, 8).toString('latin1'))
const latin = buf.toString('latin1')
const hits = ['Monitoring Point', 'Vertical Displacement', 'A1 LHS', 'VH/VV', 'Factor of Safety', 'BT']
for (const h of hits) console.log(h, latin.includes(h))
const sample = latin.replace(/[^\x20-\x7E\n]/g, ' ').replace(/\s+/g, ' ').slice(0, 800)
console.log('sample', sample)
