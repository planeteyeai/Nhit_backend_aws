/**
 * SAR displacement reports in Amazon S3: upload/download/SAR/{chainage}_SAR_{type}.pdf
 */
import path from 'path'
import { PDFParse } from 'pdf-parse'
import {
  isStorageEnabled,
  listBucketKeysUnderPrefix,
  objectExists,
  pipeBucketObjectToResponse,
  readObjectBuffer,
} from './storage.js'

export const SAR_BUCKET_PREFIX = 'upload/download/SAR/'

let catalogCache = { at: 0, files: [] }
const extractCache = new Map()
const CATALOG_TTL_MS = 5 * 60 * 1000

function extractChainageKey(text) {
  const m = String(text || '').match(/(\d+)\s*\+\s*(\d+)/)
  if (!m) return null
  return `${Number(m[1])}+${Number(m[2])}`
}

function parseFileName(fileName) {
  const name = String(fileName || '').trim()
  const chainageKey = extractChainageKey(name)
  const typeMatch = name.match(/SAR\d*_([A-Za-z]+)\.pdf$/i)
  return {
    file: name,
    key: `${SAR_BUCKET_PREFIX}${name}`,
    chainageKey,
    structureType: typeMatch ? typeMatch[1].toUpperCase() : '',
  }
}

export async function listSarReportFiles() {
  if (!isStorageEnabled()) return []
  if (catalogCache.files.length && Date.now() - catalogCache.at < CATALOG_TTL_MS) {
    return catalogCache.files
  }
  const keys = await listBucketKeysUnderPrefix(SAR_BUCKET_PREFIX)
  const files = keys
    .map((k) => path.basename(k))
    .filter((n) => /\.pdf$/i.test(n))
    .map(parseFileName)
    .filter((f) => f.chainageKey)
  catalogCache = { at: Date.now(), files }
  return files
}

export async function findSarReportByChainage(chainage) {
  const key = extractChainageKey(chainage)
  if (!key) return null
  const files = await listSarReportFiles()
  const matches = files.filter((f) => f.chainageKey === key)
  if (!matches.length) return null
  return matches.find((f) => !/SAR\d+_/.test(f.file)) || matches[0]
}

function firstRange(label, block) {
  const re = new RegExp(`${label}[^\\n]{0,80}ranges from[^\\n]{0,40}(-?\\d+(?:\\.\\d+)?)\\s*mm to[^\\n]{0,20}([+\\-]?\\d+(?:\\.\\d+)?)\\s*mm`, 'i')
  const m = String(block || '').match(re)
  if (!m) return null
  return [Number(m[1]), Number(m[2])]
}

function monthlySeries(block) {
  const months = [
    ['january', 'Jan'],
    ['february', 'Feb'],
    ['march', 'Mar'],
    ['april', 'Apr'],
    ['may', 'May'],
    ['june', 'Jun'],
    ['july', 'Jul'],
    ['august', 'Aug'],
    ['september', 'Sep'],
    ['october', 'Oct'],
    ['november', 'Nov'],
    ['december', 'Dec'],
  ]
  const series = []
  for (const [full, short] of months) {
    const re = new RegExp(`${full}[^\\n]{0,40}:([\\s\\S]{0,280}?)(?=\\n•|\\n[A-Z][a-z]+ \\d{4}|A1 |A2 |$)`, 'i')
    const m = String(block || '').match(re)
    if (!m) continue
    const chunk = m[1]
    const vv = chunk.match(/VV[^\\n]{0,80}(~|around|near)?\s*([+\-]?\d+(?:\.\d+)?)(?:\s*[–\-]\s*([+\-]?\d+(?:\.\d+)?))?/i)
    const vh = chunk.match(/VH[^\\n]{0,80}(~|around|near)?\s*([+\-]?\d+(?:\.\d+)?)(?:\s*[–\-]\s*([+\-]?\d+(?:\.\d+)?))?/i)
    const avg = (a, b) => {
      const x = Number(a)
      const y = b != null && b !== '' ? Number(b) : x
      if (!Number.isFinite(x)) return null
      return Number.isFinite(y) ? (x + y) / 2 : x
    }
    series.push({
      period: short,
      label: `${short} ${chunk.match(/20\d{2}/)?.[0] || ''}`.trim(),
      vv: vv ? avg(vv[2], vv[3]) : null,
      vh: vh ? avg(vh[2], vh[3]) : null,
      note: chunk.replace(/\s+/g, ' ').trim().slice(0, 220),
    })
  }
  return series.filter((p) => p.vv != null || p.vh != null)
}

function parsePointBlock(abutment, side, block) {
  const vvRange = firstRange('VV', block) || firstRange('Vertical Displacement', block)
  const vhRange = firstRange('VH', block) || firstRange('Horizontal Displacement', block)
  const series = monthlySeries(block)
  const observations = []
  const vvObs = String(block).match(/Vertical Displacement \(VV\):([\s\S]*?)(?=•\s*Horizontal|Critical Events|$)/i)
  const vhObs = String(block).match(/Horizontal Displacement \(VH\):([\s\S]*?)(?=Critical Events|$)/i)
  if (vvObs) observations.push({ title: 'Vertical Displacement VV', text: vvObs[1].replace(/\s+/g, ' ').trim() })
  if (vhObs) observations.push({ title: 'Horizontal Displacement VH', text: vhObs[1].replace(/\s+/g, ' ').trim() })

  const events = []
  const eventBlock = String(block).match(/Critical Events[\s\S]*$/i)?.[0] || ''
  for (const m of eventBlock.matchAll(/•\s*([A-Z][a-z]+ \d{4}):\s*([^\n•]+)/g)) {
    events.push({ period: m[1], text: m[2].replace(/\s+/g, ' ').trim() })
  }

  const coord = String(block).match(/\((-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\)/)
  return {
    id: `${abutment} ${side}`,
    abutment,
    side,
    schematicPoint: abutment,
    coords: coord ? { lat: Number(coord[1]), lng: Number(coord[2]) } : null,
    vvRange,
    vhRange,
    series,
    observations,
    events,
    raw: String(block).replace(/\s+/g, ' ').trim().slice(0, 2500),
  }
}

function captureNum(text, re) {
  const m = String(text || '').match(re)
  if (!m) return null
  const n = Number(String(m[1]).replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

function sectionText(text, startRe, endRe) {
  const src = String(text || '')
  const start = src.search(startRe)
  if (start < 0) return ''
  const rest = src.slice(start)
  const end = rest.search(endRe)
  return (end > 0 ? rest.slice(0, end) : rest).replace(/\s+/g, ' ').trim()
}

function datedAxisSeries(block) {
  const series = []
  const re = /([+\-]?\d+(?:\.\d+)?)\s*mm[^\n]{0,24}on\s+(\d{1,2}[- ][A-Za-z]{3,}[- ]\d{2,4})/gi
  let m
  while ((m = re.exec(String(block || '')))) {
    series.push({ date: m[2].replace(/\s+/g, '-'), value: Number(m[1]) })
  }
  return series
}

function parseShmResults(text) {
  const src = String(text || '')
  return {
    fosVv: captureNum(src, /Factor of Safety \(FOS\) VV:\s*\**\s*([\d.]+)/i),
    fosVh: captureNum(src, /Factor of Safety \(FOS\) VH:\s*\**\s*([\d.]+)/i),
    governingFos: captureNum(src, /Governing FOS:\s*\**\s*([\d.]+)/i),
    stabilityVv: captureNum(src, /Percentage Stability VV:\s*\**\s*([\d.]+)/i),
    stabilityVh: captureNum(src, /Percentage Stability VH:\s*\**\s*([\d.]+)/i),
    lifetimeVvYears: captureNum(src, /VV:[^\n]{0,80}?=\s*\**\s*([\d.]+)\s*years/i),
    lifetimeVhYears: captureNum(src, /VH:[^\n]{0,80}?=\s*\**\s*([\d.]+)\s*years/i),
    avgRateVv: captureNum(src, /Average:[\s\S]{0,80}?VV:\s*\**\s*([+\-]?\d+(?:\.\d+)?)\s*mm\/month/i),
    avgRateVh: captureNum(src, /Average:[\s\S]{0,120}?VH:\s*\**\s*([+\-]?\d+(?:\.\d+)?)\s*mm\/month/i),
  }
}

function parseShmPeriodTable(text) {
  const rows = []
  const re =
    /(Jan[–\-].*?Feb\s+\d{4}|Mar[–\-].*?Apr\s+\d{4}|May[–\-].*?Jun\s+\d{4}|Jul[–\-].*?Aug\s+\d{4}|Sep[–\-].*?Oct\s+\d{4}|Nov[–\-].*?Dec\s+\d{4})\s+([+\-]?\d+(?:\.\d+)?\s+to\s+[+\-]?\d+(?:\.\d+)?)\s+([+\-]?\d+(?:\.\d+)?\s+to\s+[+\-]?\d+(?:\.\d+)?)\s+([+\-]?\d+(?:\.\d+)?)\s+([+\-]?\d+(?:\.\d+)?)/gi
  let m
  while ((m = re.exec(String(text || '')))) {
    rows.push({
      period: m[1].replace(/\s+/g, ' ').trim(),
      vv: m[2],
      vh: m[3],
      vvRate: Number(m[4]),
      vhRate: Number(m[5]),
    })
  }
  return rows
}

function parseShmPoint(block) {
  const src = String(block || '')
  const mp =
    src.match(/Monitoring Point:\s*\**\s*([A-Z0-9]+(?:\s+LHS|\s+RHS)?(?:\s+VH\/VV)?)/i)?.[1]?.replace(/\s+/g, ' ').trim() ||
    ''
  const idMatch = mp.match(/^(A\d+|P\d+)\s*(LHS|RHS)?/i)
  const abutment = idMatch ? idMatch[1].toUpperCase() : 'A1'
  const side = idMatch?.[2] ? idMatch[2].toUpperCase() : 'LHS'
  const period =
    src.match(/Monitoring Period:\s*\**\s*([0-9]{1,2}[- ][A-Za-z]{3,}[- ]\d{2,4}\s+to\s+[0-9]{1,2}[- ][A-Za-z]{3,}[- ]\d{2,4})/i)?.[1] ||
    ''

  const vvBlock = sectionText(src, /Vertical Displacement VV/i, /Horizontal Displacement VH|Overall Trend|PERIOD-WISE/i)
  const vhBlock = sectionText(src, /Horizontal Displacement VH/i, /Overall Trend|PERIOD-WISE|RATE OF CHANGE/i)
  const overall = sectionText(src, /Overall Trend/i, /PERIOD-WISE|RATE OF CHANGE/i)

  const observations = []
  if (vvBlock) observations.push({ title: 'Vertical Displacement VV', text: vvBlock.replace(/^Vertical Displacement VV[:\s]*/i, '') })
  if (vhBlock) observations.push({ title: 'Horizontal Displacement VH', text: vhBlock.replace(/^Horizontal Displacement VH[:\s]*/i, '') })
  if (overall) observations.push({ title: 'Overall Trend', text: overall.replace(/^Overall Trend[:\s]*/i, '') })

  const vvDates = datedAxisSeries(vvBlock || src)
  const vhDates = datedAxisSeries(vhBlock)
  const labels = [...new Set([...vvDates, ...vhDates].map((d) => d.date))]
  const series = labels.map((label) => ({
    period: label,
    label,
    vv: vvDates.find((d) => d.date === label)?.value ?? null,
    vh: vhDates.find((d) => d.date === label)?.value ?? null,
  }))

  const comments = []
  const commentBlock = src.match(/#\s*COMMENTS([\s\S]*?)(?:#\s+[A-Z]|$)/i)?.[1] || src.match(/COMMENTS([\s\S]*)$/i)?.[1] || ''
  for (const m of String(commentBlock).matchAll(/[•\-*]\s+([^\n•]+)/g)) {
    comments.push(m[1].replace(/\s+/g, ' ').trim())
  }

  const results = parseShmResults(src)
  const hasResults = Object.values(results).some((v) => v != null)

  return {
    id: `${abutment} ${side}`,
    abutment,
    side,
    schematicPoint: abutment,
    monitoringPoint: mp || `${abutment} ${side} VH/VV`,
    period,
    observations,
    series,
    periodTable: parseShmPeriodTable(src),
    results: hasResults ? results : null,
    comments,
    raw: src.replace(/\s+/g, ' ').trim().slice(0, 4000),
  }
}

function parseShmReports(text) {
  const src = String(text || '')
  if (!/SHM DISPLACEMENT|Monitoring Point:|Governing FOS/i.test(src)) return []
  const parts = src.split(/(?=#\s*SHM DISPLACEMENT ANALYSIS REPORT|Monitoring Point:)/i).filter((p) => /Monitoring Point:/i.test(p))
  const blocks = parts.length ? parts : [src]
  return blocks.map(parseShmPoint).filter((p) => p.monitoringPoint || p.observations.length || p.results)
}

function parseSarText(text, meta) {
  const points = []
  const re =
    /SAR Based Analysis at Abutment\s+(\d)\s+(LHS|RHS):([\s\S]*?)(?=SAR Based Analysis at Abutment|\nANALYSIS\b|$)/gi
  let m
  while ((m = re.exec(String(text || '')))) {
    points.push(parsePointBlock(`A${m[1]}`, m[2].toUpperCase(), m[3]))
  }

  const shmPoints = parseShmReports(text)
  const byId = new Map(points.map((p) => [p.id, p]))
  for (const shm of shmPoints) {
    const existing = byId.get(shm.id)
    byId.set(shm.id, existing ? { ...existing, ...shm, series: shm.series?.length ? shm.series : existing.series, observations: shm.observations?.length ? shm.observations : existing.observations } : shm)
  }

  const conclusion = String(text).match(/Conclusion:([\s\S]{0,900})/i)?.[1]?.replace(/\s+/g, ' ').trim() || ''
  const period =
    String(text).match(/From\s*:\s*([0-9]{1,2}\s+\w+\s+\d{4})\s*To\s*:\s*([0-9]{1,2}\s+\w+\s+\d{4})/i) ||
    String(text).match(/From\s+(\d{1,2}\s+\w+\s+\d{4})\s+to\s+(\d{1,2}\s+\w+\s+\d{4})/i) ||
    String(text).match(/Monitoring Period:\s*\**\s*([0-9]{1,2}[- ][A-Za-z]{3,}[- ]\d{2,4}\s+to\s+[0-9]{1,2}[- ][A-Za-z]{3,}[- ]\d{2,4})/i)
  const length = String(text).match(/Length\s*[–-]\s*([0-9.]+)\s*M/i)?.[1]

  return {
    ...meta,
    period: period ? (period[2] ? `${period[1]} to ${period[2]}` : period[1]) : '',
    lengthM: length ? Number(length) : null,
    conclusion,
    points: [...byId.values()],
  }
}

export async function extractSarReportByChainage(chainage) {
  const file = await findSarReportByChainage(chainage)
  if (!file) return null
  if (extractCache.has(file.file)) return extractCache.get(file.file)

  const buf = await readObjectBuffer(file.key)
  if (!buf) return null
  const parser = new PDFParse({ data: buf })
  try {
    const result = await parser.getText()
    const parsed = parseSarText(result.text || '', file)
    extractCache.set(file.file, parsed)
    return parsed
  } finally {
    await parser.destroy().catch(() => {})
  }
}

export async function streamSarPdf(res, fileName) {
  const safe = path.basename(String(fileName || ''))
  if (!/\.pdf$/i.test(safe)) return false
  const key = `${SAR_BUCKET_PREFIX}${safe}`
  if (!(await objectExists(key))) return false
  return pipeBucketObjectToResponse(res, key)
}
