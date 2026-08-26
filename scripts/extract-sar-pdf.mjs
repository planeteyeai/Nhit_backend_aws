import dotenv from 'dotenv'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { PDFParse } from 'pdf-parse'

dotenv.config()

const client = new S3Client({
  region: process.env.AWS_DEFAULT_REGION || process.env.AWS_S3_REGION_NAME,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
})
const bucket = process.env.AWS_S3_BUCKET_NAME || process.env.AWS_STORAGE_BUCKET_NAME
const key = process.argv[2] || 'upload/download/SAR/609+670_SAR_BXC.pdf'
const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
const chunks = []
for await (const c of out.Body) chunks.push(c)
const buf = Buffer.concat(chunks)
const parser = new PDFParse({ data: buf })
const data = await parser.getText()
await parser.destroy()
console.log('pages', data.pages?.length, 'chars', String(data.text || '').length)
if (Array.isArray(data.pages)) {
  for (const p of data.pages) {
    const n = p.num || p.pageNumber || p.index
    const t = String(p.text || '')
    if (/Abutment|A1 LHS|A2 LHS|Analysis|FOS|Displacement @/i.test(t)) {
      console.log('\n===== PAGE', n, '=====')
      console.log(t.slice(0, 2500))
    }
  }
} else {
  console.log(String(data.text || '').slice(4000, 9000))
}
