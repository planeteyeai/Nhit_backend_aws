import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import AdmZip from 'adm-zip'

const FACE_MAP = {
  px: ['right', 'px'],
  nx: ['left', 'nx'],
  py: ['top', 'up', 'py'],
  ny: ['bottom', 'down', 'ny'],
  pz: ['front', 'pz'],
  nz: ['back', 'nz'],
}

function publicBaseUrl(req) {
  const proto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim()
  const host = req.get('x-forwarded-host') || req.get('host')
  return `${proto}://${host}`
}

/**
 * POST /upload-panorama — same contract as legacy Python threed/main.py
 */
export async function processPanoramaUpload(req, uploadRoot) {
  const file = req.file
  if (!file?.buffer?.length) {
    const err = new Error('No file uploaded')
    err.status = 400
    throw err
  }

  const stationId = randomUUID().replace(/-/g, '').slice(0, 8)
  const savePath = path.join(uploadRoot, 'threed_panoramas', stationId)
  fs.mkdirSync(savePath, { recursive: true })

  const baseUrl = `${publicBaseUrl(req)}/upload/threed_panoramas/${stationId}`
  const filename = String(file.originalname || 'upload').toLowerCase()

  let results = {}
  let pType = 'sphere'

  if (filename.endsWith('.zip')) {
    const zip = new AdmZip(file.buffer)
    const entries = zip.getEntries().filter((e) => !e.isDirectory && !e.entryName.includes('__MACOSX'))

    for (const [faceKey, keywords] of Object.entries(FACE_MAP)) {
      const match = entries.find((e) => {
        const n = e.entryName.toLowerCase()
        return keywords.some((k) => n.includes(k))
      })
      if (match) {
        const ext = path.extname(match.entryName) || '.jpg'
        const targetName = `${faceKey}${ext}`
        fs.writeFileSync(path.join(savePath, targetName), match.getData())
        results[faceKey] = `${baseUrl}/${targetName}`
      }
    }

    if (Object.keys(results).length === 6) {
      pType = 'cube'
    } else {
      const imgEntry = entries.find((e) => /\.(jpe?g|png|webp)$/i.test(e.entryName))
      if (!imgEntry) {
        const err = new Error('ZIP has no recognizable panorama images')
        err.status = 400
        throw err
      }
      const ext = path.extname(imgEntry.entryName) || '.jpg'
      const targetName = `sphere${ext}`
      fs.writeFileSync(path.join(savePath, targetName), imgEntry.getData())
      results = { url: `${baseUrl}/${targetName}` }
      pType = 'sphere'
    }
  } else {
    const ext = path.extname(filename) || '.jpg'
    const targetName = `sphere${ext}`
    fs.writeFileSync(path.join(savePath, targetName), file.buffer)
    results = { url: `${baseUrl}/${targetName}` }
    pType = 'sphere'
  }

  return {
    id: stationId,
    panorama_type: pType,
    images: results,
    markers: [],
    lat: 11.1271 + Math.random() * 0.05,
    lng: 78.6569 + Math.random() * 0.05,
  }
}
