import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import ExcelJS from 'exceljs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadRoot = path.resolve(__dirname, '../../upload')
const cachePath = path.join(uploadRoot, 'insar', 'BMS.xlsx')
const publicFallback = path.resolve(
  __dirname,
  '../../../Frontend/nhit-frontend/public/insar/BMS.xlsx',
)

/** SharePoint / hosted workbook URL (anonymous download preferred). */
export const INSAR_REMOTE_URL =
  process.env.INSAR_EXCEL_URL ||
  process.env.INSAR_SHAREPOINT_URL ||
  'https://planeteyefarma.sharepoint.com/:x:/r/_layouts/15/doc2.aspx?sourcedoc=%7B53F28071-D2CA-4D7B-919B-3A239CFF780C%7D&file=BMS.xlsx&download=1'

function looksLikeXlsx(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 4) return false
  // ZIP (xlsx) or OLE (xls)
  return (
    (buf[0] === 0x50 && buf[1] === 0x4b) ||
    (buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0)
  )
}

function ensureInsarDir() {
  const dir = path.dirname(cachePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

export async function fetchRemoteInsarWorkbook(url = INSAR_REMOTE_URL) {
  if (!url) return { ok: false, reason: 'no_url' }
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream,*/*',
        'User-Agent': 'BMS-InSAR-Sync/1.0',
      },
    })
    if (!res.ok) return { ok: false, reason: `http_${res.status}` }
    const buf = Buffer.from(await res.arrayBuffer())
    if (!looksLikeXlsx(buf)) {
      return { ok: false, reason: 'not_xlsx_login_or_html', bytes: buf.length }
    }
    ensureInsarDir()
    fs.writeFileSync(cachePath, buf)
    return { ok: true, buf, source: 'remote', bytes: buf.length }
  } catch (e) {
    return { ok: false, reason: e?.message || 'fetch_failed' }
  }
}

export function readCachedInsarWorkbook() {
  if (fs.existsSync(cachePath)) {
    return { ok: true, buf: fs.readFileSync(cachePath), source: 'cache', path: cachePath }
  }
  if (fs.existsSync(publicFallback)) {
    return { ok: true, buf: fs.readFileSync(publicFallback), source: 'public', path: publicFallback }
  }
  return { ok: false, reason: 'missing' }
}

/** Try remote refresh, then fall back to local cache / public copy. */
export async function resolveInsarWorkbook({ refresh = false } = {}) {
  if (refresh) {
    const remote = await fetchRemoteInsarWorkbook()
    if (remote.ok) return remote
  } else {
    // Opportunistic refresh if cache older than 6h
    let stale = true
    if (fs.existsSync(cachePath)) {
      const ageMs = Date.now() - fs.statSync(cachePath).mtimeMs
      stale = ageMs > 6 * 60 * 60 * 1000
    }
    if (stale) {
      const remote = await fetchRemoteInsarWorkbook()
      if (remote.ok) return remote
    }
  }
  return readCachedInsarWorkbook()
}

export async function inspectInsarWorkbook(buf) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  const sheets = []
  for (const s of wb.worksheets) {
    const headers = []
    s.getRow(1).eachCell((c, i) => {
      headers[i] = String(c.value ?? '')
    })
    const cols = headers.filter(Boolean)
    const dcols = cols.filter((c) => /^D_\d{8}$/.test(c))
    sheets.push({
      name: s.name,
      rows: Math.max(0, s.rowCount - 1),
      hasVelocity: cols.includes('velocity'),
      hasSubArea: cols.includes('SubArea ID'),
      displacementEpochs: dcols.length,
      firstEpoch: dcols[0] || null,
      lastEpoch: dcols[dcols.length - 1] || null,
      usable: cols.includes('velocity') && dcols.length >= 5,
    })
  }
  return {
    sheetCount: sheets.length,
    usableSheets: sheets.filter((x) => x.usable).map((x) => x.name),
    sheets,
  }
}
