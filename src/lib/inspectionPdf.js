/**
 * Formatted Bridge Inspection PDF (PDFKit).
 * Used by GET /inspection/download_pdf/:inspectionId
 */

const PAGE = { size: 'A4', margin: 42 }
const COLORS = {
  ink: '#0f172a',
  muted: '#475569',
  line: '#cbd5e1',
  headerBg: '#1e3a8a',
  headerFg: '#ffffff',
  sectionBg: '#e0e7ff',
  sectionFg: '#1e3a8a',
  rowAlt: '#f8fafc',
  accent: '#b45309',
}

const SKIP_FIELD =
  /(?:^|_)(id|uid|uuid|pk)$|_id$|_pk$|created_on|created_at|updated_on|updated_at|upadted_on|created_by|updated_by|bridge_inspection_id|bridge_id|_images$|^images$|password|token|sign$/i

const COMPONENT_TITLES = {
  general: '1. General',
  approaches: '2. Approaches',
  protection_works: '3. Protection Works',
  waterway: '4. Waterway',
  foundation: '5. Foundation',
  substructure: '6. Substructure',
  bearing_and_pedestal: '7. Bearing & Pedestal',
  superstructure: '8. Superstructure',
  expansion_joint: '9. Expansion Joint',
  wearing_coat: '10. Wearing Coat',
  drainage_spouts_and_vest_holes: '11. Drainage Spouts & Vest Holes',
  handrails: '12. Handrails / Parapets / Crash Barriers',
  footpaths: '13. Footpaths',
  utilities: '14. Utilities',
}

function humanizeKey(key) {
  return String(key || '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function cleanValue(val) {
  if (val == null) return ''
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val)
    } catch {
      return String(val)
    }
  }
  return String(val).replace(/\s+/g, ' ').trim()
}

function formatDate(val) {
  if (val == null || val === '') return '—'
  const d = val instanceof Date ? val : new Date(val)
  if (Number.isNaN(d.getTime())) return String(val)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function ensureSpace(doc, need = 60) {
  const bottom = doc.page.height - PAGE.margin
  if (doc.y + need > bottom) doc.addPage()
}

function drawHeader(doc, { inspectionId, bridgeName }) {
  const x = PAGE.margin
  const w = doc.page.width - PAGE.margin * 2
  const y = PAGE.margin
  const h = 52

  doc.save()
  doc.rect(x, y, w, h).fill(COLORS.headerBg)
  doc.fillColor(COLORS.headerFg).font('Helvetica-Bold').fontSize(16)
  doc.text('Bridge Inspection Report', x + 14, y + 12, { width: w - 28, align: 'left' })
  doc.font('Helvetica').fontSize(9)
  doc.text(
    `Inspection #${inspectionId}${bridgeName ? `  ·  ${bridgeName}` : ''}`,
    x + 14,
    y + 32,
    { width: w - 28 }
  )
  doc.restore()
  doc.y = y + h + 16
  doc.fillColor(COLORS.ink)
}

function drawFooter(doc, pageNo, pageCount) {
  const y = doc.page.height - 28
  doc.save()
  doc.strokeColor(COLORS.line).lineWidth(0.6)
  doc
    .moveTo(PAGE.margin, y - 6)
    .lineTo(doc.page.width - PAGE.margin, y - 6)
    .stroke()
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8)
  doc.text('NHIT BMS · Confidential', PAGE.margin, y, { continued: false })
  doc.text(`Page ${pageNo} of ${pageCount}`, PAGE.margin, y, {
    width: doc.page.width - PAGE.margin * 2,
    align: 'right',
  })
  doc.restore()
}

function sectionHeading(doc, title) {
  ensureSpace(doc, 36)
  const x = PAGE.margin
  const w = doc.page.width - PAGE.margin * 2
  const y = doc.y
  doc.save()
  doc.roundedRect(x, y, w, 22, 3).fill(COLORS.sectionBg)
  doc.fillColor(COLORS.sectionFg).font('Helvetica-Bold').fontSize(11)
  doc.text(title, x + 10, y + 5, { width: w - 20 })
  doc.restore()
  doc.y = y + 28
  doc.fillColor(COLORS.ink)
}

function narrativeBlock(doc, title, body) {
  sectionHeading(doc, title)
  const text = cleanValue(body) || 'Not provided.'
  ensureSpace(doc, 40)
  doc.font('Helvetica').fontSize(9).fillColor(COLORS.ink)
  doc.text(text, PAGE.margin, doc.y, {
    width: doc.page.width - PAGE.margin * 2,
    align: 'justify',
    lineGap: 2,
  })
  doc.moveDown(0.8)
}

function metaTable(doc, pairs) {
  const x = PAGE.margin
  const w = doc.page.width - PAGE.margin * 2
  const colW = w / 2
  const labelW = colW * 0.38
  const valueW = colW * 0.62
  const rowH = 18

  ensureSpace(doc, pairs.length * rowH + 8)
  let y = doc.y

  doc.save()
  doc.strokeColor(COLORS.line).lineWidth(0.8)
  doc.roundedRect(x, y, w, Math.ceil(pairs.length / 2) * rowH + 4, 3).stroke()

  for (let i = 0; i < pairs.length; i++) {
    const col = i % 2
    const row = Math.floor(i / 2)
    const cx = x + col * colW
    const cy = y + 2 + row * rowH
    const [label, value] = pairs[i]
    doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(8)
    doc.text(label, cx + 8, cy + 4, { width: labelW - 10, ellipsis: true })
    doc.fillColor(COLORS.ink).font('Helvetica').fontSize(8)
    doc.text(cleanValue(value) || '—', cx + labelW, cy + 4, {
      width: valueW - 12,
      ellipsis: true,
    })
  }
  doc.restore()
  doc.y = y + Math.ceil(pairs.length / 2) * rowH + 16
  doc.fillColor(COLORS.ink)
}

function kvRows(doc, entries) {
  if (!entries.length) {
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(COLORS.muted)
    doc.text('No data recorded for this component.', PAGE.margin, doc.y)
    doc.fillColor(COLORS.ink)
    doc.moveDown(0.6)
    return
  }

  const x = PAGE.margin
  const w = doc.page.width - PAGE.margin * 2
  const labelW = w * 0.36
  const valueW = w * 0.64

  for (let i = 0; i < entries.length; i++) {
    const [label, value] = entries[i]
    const text = cleanValue(value) || '—'
    doc.font('Helvetica').fontSize(8)
    const h = Math.max(
      16,
      doc.heightOfString(label, { width: labelW - 8 }),
      doc.heightOfString(text, { width: valueW - 8 })
    ) + 6
    ensureSpace(doc, h + 4)
    const y = doc.y
    if (i % 2 === 0) {
      doc.save()
      doc.rect(x, y, w, h).fill(COLORS.rowAlt)
      doc.restore()
    }
    doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(8)
    doc.text(label, x + 6, y + 3, { width: labelW - 8 })
    doc.fillColor(COLORS.ink).font('Helvetica').fontSize(8)
    doc.text(text, x + labelW, y + 3, { width: valueW - 8 })
    doc.y = y + h
  }
  doc.moveDown(0.5)
}

function componentEntries(row) {
  if (!row || typeof row !== 'object') return []
  const out = []
  for (const [k, v] of Object.entries(row)) {
    if (SKIP_FIELD.test(k)) continue
    if (v == null || v === '') continue
    const s = cleanValue(v)
    if (!s || s === '{}' || s === '[]' || s === 'null') continue
    // Skip huge blobs / data URLs
    if (s.length > 500 || /^data:image\//i.test(s)) continue
    out.push([humanizeKey(k), s])
  }
  return out
}

function drawDistressTable(doc, rows) {
  sectionHeading(doc, 'Distress Observations')
  if (!rows.length) {
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(COLORS.muted)
    doc.text('No distress records.', PAGE.margin, doc.y)
    doc.fillColor(COLORS.ink)
    doc.moveDown()
    return
  }

  const x = PAGE.margin
  const w = doc.page.width - PAGE.margin * 2
  const cols = [
    { key: 'no', label: '#', width: 22 },
    { key: 'element', label: 'Element', width: 78 },
    { key: 'type', label: 'Distress Type', width: 90 },
    { key: 'location', label: 'Location', width: 70 },
    { key: 'l', label: 'L (m)', width: 36 },
    { key: 'w', label: 'W (m)', width: 36 },
    { key: 'd', label: 'D (m)', width: 36 },
    { key: 'rm', label: 'Repair Methodology', width: w - 22 - 78 - 90 - 70 - 36 - 36 - 36 },
  ]

  const drawTableHeader = () => {
    ensureSpace(doc, 28)
    let cx = x
    const y = doc.y
    doc.save()
    doc.rect(x, y, w, 18).fill(COLORS.headerBg)
    doc.fillColor(COLORS.headerFg).font('Helvetica-Bold').fontSize(7)
    for (const c of cols) {
      doc.text(c.label, cx + 3, y + 5, { width: c.width - 6, ellipsis: true })
      cx += c.width
    }
    doc.restore()
    doc.y = y + 20
    doc.fillColor(COLORS.ink)
  }

  drawTableHeader()

  rows.forEach((r, idx) => {
    const cells = {
      no: String(idx + 1),
      element: cleanValue(r.element_name || r.table_type || r.component || ''),
      type: cleanValue(r.distress_type || r.observation || ''),
      location: cleanValue(r.location || ''),
      l: cleanValue(r.distress_length ?? ''),
      w: cleanValue(r.distress_width ?? ''),
      d: cleanValue(r.distress_depth ?? ''),
      rm: cleanValue(r.repair_methodology || ''),
    }

    doc.font('Helvetica').fontSize(7)
    let rowH = 14
    for (const c of cols) {
      rowH = Math.max(rowH, doc.heightOfString(cells[c.key] || '—', { width: c.width - 6 }) + 6)
    }
    if (doc.y + rowH > doc.page.height - PAGE.margin - 20) {
      doc.addPage()
      drawTableHeader()
    }

    const y = doc.y
    if (idx % 2 === 0) {
      doc.save()
      doc.rect(x, y, w, rowH).fill(COLORS.rowAlt)
      doc.restore()
    }
    let cx = x
    doc.fillColor(COLORS.ink).font('Helvetica').fontSize(7)
    for (const c of cols) {
      doc.text(cells[c.key] || '—', cx + 3, y + 3, { width: c.width - 6 })
      cx += c.width
    }
    doc.y = y + rowH
  })
  doc.moveDown(0.8)
}

/**
 * @param {import('pdfkit')} doc
 * @param {{ inspection: object, components: Record<string, object|null>, distressRows: object[], nonStructuralRows?: object[] }} data
 */
export function buildInspectionPdf(doc, data) {
  const i = data.inspection || {}
  const inspectionId = i.bridge_inspection_id || i.id || ''
  const bridgeName = i.popular_name_of_bridge || i.bridge_name || ''

  drawHeader(doc, { inspectionId, bridgeName })

  metaTable(doc, [
    ['Inspection ID', inspectionId],
    ['Status', i.status || i.bmc_inspection_status || '—'],
    ['Bridge Identity No.', i.bridge_identity_no || '—'],
    ['Chainage', i.chainage || '—'],
    ['Project', i.project_name || '—'],
    ['Bridge Name', bridgeName || '—'],
    ['Inspection Type', i.inspecion_type || i.inspection_type || '—'],
    ['Inspection Date', formatDate(i.inspection_date || i.inspecion_date || i.created_on)],
    ['BMC Status', i.bmc_inspection_status || '—'],
    ['Last Updated', formatDate(i.upadted_on || i.updated_on || i.updated_at)],
  ])

  narrativeBlock(doc, 'Conclusion Report', i.boq_conclusion_report)
  narrativeBlock(doc, 'Causes of Distress', i.boq_causes_of_distress)
  narrativeBlock(doc, 'Remedial Measures', i.boq_remedial_measures)
  if (i.boq_repair_methodology) {
    narrativeBlock(doc, 'Repair Methodology (Summary)', i.boq_repair_methodology)
  }

  sectionHeading(doc, 'Component Condition Details')
  doc.moveDown(0.2)

  const order = Object.keys(COMPONENT_TITLES)
  const componentKeys = [
    ...order.filter((k) => Object.prototype.hasOwnProperty.call(data.components || {}, k)),
    ...Object.keys(data.components || {}).filter((k) => !order.includes(k)),
  ]

  for (const key of componentKeys) {
    const title = COMPONENT_TITLES[key] || humanizeKey(key)
    const entries = componentEntries(data.components?.[key])
    // Skip empty components to keep PDF focused
    if (!entries.length) continue
    ensureSpace(doc, 48)
    doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.accent)
    doc.text(title, PAGE.margin, doc.y)
    doc.fillColor(COLORS.ink)
    doc.moveDown(0.25)
    kvRows(doc, entries)
  }

  const structural = Array.isArray(data.distressRows) ? data.distressRows : []
  const nonStructural = Array.isArray(data.nonStructuralRows) ? data.nonStructuralRows : []
  const allDistress = [
    ...structural.map((r) => ({ ...r, _src: 'Structural' })),
    ...nonStructural.map((r) => ({
      ...r,
      table_type: r.table_type || r.element_name || 'Non-Structural',
      _src: 'Non-Structural',
    })),
  ]
  drawDistressTable(doc, allDistress)

  // Footer on every page
  const range = doc.bufferedPageRange()
  for (let p = 0; p < range.count; p++) {
    doc.switchToPage(range.start + p)
    drawFooter(doc, p + 1, range.count)
  }
}

export { PAGE as INSPECTION_PDF_PAGE }
