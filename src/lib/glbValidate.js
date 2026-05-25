import fs from 'fs'

const GLB_MAGIC = 0x46546c67 // "glTF" little-endian

export function isValidGlbBuffer(buf) {
  if (!buf || buf.length < 4) return false
  return buf.readUInt32LE(0) === GLB_MAGIC
}

export function isLfsPointerFile(filePath) {
  try {
    const stat = fs.statSync(filePath)
    if (!stat.isFile() || stat.size > 512) return false
    const head = fs.readFileSync(filePath, { encoding: 'utf8' }).slice(0, 64)
    return head.startsWith('version https://git-lfs.github.com/spec/v1')
  } catch {
    return false
  }
}

export function isValidGlbFile(filePath) {
  try {
    const stat = fs.statSync(filePath)
    if (!stat.isFile() || stat.size < 12) return false
    if (isLfsPointerFile(filePath)) return false
    const fd = fs.openSync(filePath, 'r')
    const head = Buffer.alloc(4)
    fs.readSync(fd, head, 0, 4, 0)
    fs.closeSync(fd)
    return isValidGlbBuffer(head)
  } catch {
    return false
  }
}

/** Remove invalid uploads; throws if none remain valid. */
export function assertValid3dUploadFiles(files, assetType) {
  const list = Array.isArray(files) ? files : []
  const errors = []

  for (const f of list) {
    const filePath = f.path
    if (!filePath) continue

    let size = Number(f.size || 0)
    try {
      size = fs.statSync(filePath).size
    } catch {
      errors.push(`${f.originalname || 'file'}: could not read uploaded file`)
      continue
    }

    if (size < 12) {
      try {
        fs.unlinkSync(filePath)
      } catch {
        /* ignore */
      }
      errors.push(`${f.originalname || 'file'}: file is empty or incomplete (re-upload the GLB)`)
      continue
    }

    if (assetType === 'glb' && !isValidGlbFile(filePath)) {
      try {
        fs.unlinkSync(filePath)
      } catch {
        /* ignore */
      }
      errors.push(`${f.originalname || 'file'}: not a valid GLB model`)
    }
  }

  if (errors.length) {
    const err = new Error(errors.join('; '))
    err.status = 400
    throw err
  }
}
