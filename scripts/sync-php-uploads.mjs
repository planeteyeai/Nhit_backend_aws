import fs from 'fs'
import path from 'path'

/**
 * One-time (or repeatable) sync of legacy CodeIgniter file folders into Node backend.
 *
 * Copies:
 *   C:\xampp\htdocs\bms\upload    -> backend\upload
 *   C:\xampp\htdocs\bms\download  -> backend\upload\download
 *
 * This keeps old images/PDFs working under Node static route: /upload/...
 */

const SRC_UPLOAD = 'C:\\xampp\\htdocs\\bms\\upload'
const SRC_DOWNLOAD = 'C:\\xampp\\htdocs\\bms\\download'
const DST_UPLOAD = path.resolve('upload')
const DST_DOWNLOAD = path.resolve('upload', 'download')

function copyDir(src, dst) {
  if (!fs.existsSync(src)) {
    console.log(`Missing: ${src}`)
    return
  }
  fs.mkdirSync(dst, { recursive: true })
  fs.cpSync(src, dst, { recursive: true, force: true })
  console.log(`Copied ${src} -> ${dst}`)
}

copyDir(SRC_UPLOAD, DST_UPLOAD)
copyDir(SRC_DOWNLOAD, DST_DOWNLOAD)

