import ExcelJS from 'exceljs'

const COLS = 16
const HEADER_BLUE = 'FF4472C4'
const WHITE = 'FFFFFFFF'
const SECTION_RED = 'FFFEE2E2'
const SECTION_BLUE = 'FFDBEAFE'
const SECTION_AMBER = 'FFFEF3C7'
const TITLE_RED = 'FFB91C1C'
const ZEBRA = 'FFF8FAFC'

function cell(v) {
  if (v === null || v === undefined) return ''
  return v
}

function styleFill(row, argb) {
  row.eachCell({ includeEmpty: true }, (c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }
  })
}

function styleFont(row, opts) {
  row.eachCell({ includeEmpty: true }, (c) => {
    c.font = { ...(c.font || {}), ...opts }
  })
}

function applyBorders(ws, fromRow, toRow) {
  for (let r = fromRow; r <= toRow; r += 1) {
    const row = ws.getRow(r)
    for (let c = 1; c <= COLS; c += 1) {
      const cellRef = row.getCell(c)
      cellRef.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      }
      cellRef.alignment = { ...(cellRef.alignment || {}), wrapText: true, vertical: 'middle' }
    }
  }
}

function addMergedRow(ws, values, { fill, font, height } = {}) {
  const row = ws.addRow(Array.from({ length: COLS }, (_, i) => cell(values[i] ?? '')))
  ws.mergeCells(row.number, 1, row.number, COLS)
  if (fill) styleFill(row, fill)
  if (font) styleFont(row, font)
  if (height) row.height = height
  row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  return row
}

function pad16(arr) {
  const out = Array.from({ length: COLS }, (_, i) => cell(arr[i] ?? ''))
  return out
}

/**
 * Build a full BOQ workbook matching the on-screen table:
 * Bridge info → Distress + BOQ Measurement → Measurement Sheet → Line Items
 */
export async function buildBoqExcelBuffer(payload = {}) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'BMS'
  wb.created = new Date()
  const ws = wb.addWorksheet('BOQ', {
    views: [{ state: 'frozen', ySplit: 1, showGridLines: true }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, paperSize: 9 },
  })

  ws.columns = [
    { width: 22 },
    { width: 14 },
    { width: 28 },
    { width: 22 },
    { width: 10 },
    { width: 12 },
    { width: 10 },
    { width: 10 },
    { width: 10 },
    { width: 14 },
    { width: 28 },
    { width: 10 },
    { width: 10 },
    { width: 10 },
    { width: 10 },
    { width: 12 },
  ]

  const start = ws.rowCount + 1

  const title = ws.addRow(pad16(['Bill of Quantities (BOQ)']))
  ws.mergeCells(title.number, 1, title.number, COLS)
  title.height = 24
  styleFill(title, HEADER_BLUE)
  styleFont(title, { bold: true, size: 14, color: { argb: WHITE } })
  title.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }

  const ident = payload.identity || payload.bridge?.bridge_identity_no || ''
  const sub = ws.addRow(
    pad16([
      ident
        ? `Bridge Identity No: ${ident}${payload.bridge?.highway_no ? `  ·  Highway No: ${payload.bridge.highway_no}` : ''}`
        : 'Bridge General Information',
    ]),
  )
  ws.mergeCells(sub.number, 1, sub.number, COLS)
  styleFont(sub, { italic: true, size: 10 })

  addMergedRow(ws, ['Bridge General Information'], {
    fill: 'FFE2E8F0',
    font: { bold: true, size: 12 },
    height: 20,
  })

  const infoHeaders = [
    'Project Name',
    'Type of Structure',
    'Chainage',
    'No. of Spans',
    'Slab Type',
    'Total Length',
    'Deck Width',
    'Deck Height from GL',
    'No. of Girders in Each Span',
    'Height of Bridge',
  ]
  const ih = ws.addRow(pad16(infoHeaders))
  styleFill(ih, HEADER_BLUE)
  styleFont(ih, { bold: true, color: { argb: WHITE }, size: 9 })

  const b = payload.bridge || {}
  ws.addRow(
    pad16([
      b.project_name,
      b.type_of_bridge,
      b.chainage,
      b.total_no_of_span,
      b.slab_type,
      b.length_of_bridge,
      b.deck_width,
      b.deck_height_from_gl,
      b.no_of_girders_each_span,
      b.height_of_bridge,
    ]),
  )

  const insp = payload.inspection || {}
  const inspRow = ws.addRow(
    pad16([
      insp.id
        ? `Last Approved Inspection: ${insp.id}    Inspection Date: ${insp.date || 'N/A'}`
        : 'No BMC-approved inspection found for this bridge.',
    ]),
  )
  ws.mergeCells(inspRow.number, 1, inspRow.number, COLS)
  styleFill(inspRow, insp.id ? 'FFD1FAE5' : 'FFFEF3C7')
  styleFont(inspRow, { bold: true, size: 10 })

  addMergedRow(ws, [''], { height: 8 })

  const band = ws.addRow(pad16(['Distress Data', '', '', '', '', '', '', '', '', '', '', 'BOQ Measurement']))
  ws.mergeCells(band.number, 1, band.number, 11)
  ws.mergeCells(band.number, 12, band.number, 16)
  styleFill(band, HEADER_BLUE)
  styleFont(band, { bold: true, color: { argb: WHITE } })
  band.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  band.getCell(12).alignment = { horizontal: 'center', vertical: 'middle' }

  const colHeads = [
    'Element Name',
    'Notation',
    'Observation',
    'Location of Distress',
    'Fig. No.',
    'Units',
    'L (M)',
    'B (M)',
    'D (M)',
    'Area of Repair',
    'Repair Methodology',
    'No',
    'L',
    'W',
    'D',
    'Qty',
  ]
  const ch = ws.addRow(pad16(colHeads))
  styleFill(ch, 'FF1E3A8A')
  styleFont(ch, { bold: true, color: { argb: WHITE }, size: 9 })
  ch.height = 22

  const sections = Array.isArray(payload.sections) ? payload.sections : []
  for (const item of sections) {
    if (item.type === 'group') {
      const g = ws.addRow(pad16([String(item.title || '').toUpperCase()]))
      ws.mergeCells(g.number, 1, g.number, COLS)
      const fill =
        item.kind === 'pier' ? SECTION_BLUE : item.kind === 'nse' ? SECTION_AMBER : SECTION_RED
      styleFill(g, fill)
      styleFont(g, {
        bold: true,
        size: 11,
        color: { argb: item.kind === 'pier' ? 'FF1E40AF' : item.kind === 'nse' ? 'FF92400E' : TITLE_RED },
      })
      g.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
      g.height = 20
      continue
    }
    if (item.type === 'rmTotal') {
      const r = ws.addRow(
        pad16([
          '',
          '',
          '',
          '',
          '',
          item.rm,
          '',
          item.unit,
          item.total,
          '',
          '',
          '',
          '',
          '',
          item.scaffoldQty || '',
        ]),
      )
      styleFill(r, 'FFEEF2FF')
      styleFont(r, { bold: true, size: 9 })
      continue
    }
    if (item.type === 'row') {
      const r = ws.addRow(
        pad16([
          item.tableType,
          item.notation,
          item.observation,
          item.location,
          item.figNo || '',
          item.unit,
          item.length,
          item.width,
          item.depth,
          item.area,
          item.repairMethodology,
          item.no,
          item.l,
          item.w,
          item.d,
          item.qty,
        ]),
      )
      r.height = 28
      if (r.number % 2 === 0) styleFill(r, ZEBRA)
      r.getCell(12).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
      r.getCell(16).font = { bold: true }
    }
  }

  addMergedRow(ws, ['Measurement Sheet'], {
    fill: SECTION_RED,
    font: { bold: true, color: { argb: TITLE_RED }, size: 12 },
    height: 22,
  })

  const msHeads = ws.addRow(
    pad16(['Description', '', '', '', '', '', 'Nos.', '', '', 'Unit', 'Length', 'Breadth', 'Height', '', 'Quantity', '']),
  )
  ws.mergeCells(msHeads.number, 1, msHeads.number, 6)
  ws.mergeCells(msHeads.number, 7, msHeads.number, 9)
  ws.mergeCells(msHeads.number, 13, msHeads.number, 14)
  ws.mergeCells(msHeads.number, 15, msHeads.number, 16)
  styleFill(msHeads, 'FFE2E8F0')
  styleFont(msHeads, { bold: true, size: 9 })

  const measurements = Array.isArray(payload.measurementRows) ? payload.measurementRows : []
  for (const m of measurements) {
    const titleRow = ws.addRow(
      pad16([
        `Item No. ${m.itemNo || ''} – ${m.title || ''}${m.sub ? `\n${m.sub}` : ''}`,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        m.unit,
      ]),
    )
    ws.mergeCells(titleRow.number, 1, titleRow.number, 6)
    ws.mergeCells(titleRow.number, 7, titleRow.number, 9)
    ws.mergeCells(titleRow.number, 11, titleRow.number, 16)
    titleRow.height = m.sub ? 36 : 22
    styleFont(titleRow, { bold: true, size: 10 })

    const spanRow = ws.addRow(pad16(['Span –', '', '', '', '', '', '', '', '', '', '', '', '', '', m.spanTotal, '']))
    ws.mergeCells(spanRow.number, 1, spanRow.number, 6)
    ws.mergeCells(spanRow.number, 15, spanRow.number, 16)
    spanRow.getCell(15).alignment = { horizontal: 'right' }

    const extraRow = ws.addRow(
      pad16(['Adding 10% extra', '', '', '', '', '', '', '', '', '', '', '', '', '', m.extra10, '']),
    )
    ws.mergeCells(extraRow.number, 1, extraRow.number, 6)
    ws.mergeCells(extraRow.number, 15, extraRow.number, 16)
    extraRow.getCell(15).alignment = { horizontal: 'right' }

    const totRow = ws.addRow(pad16(['', '', '', '', '', '', '', '', '', '', '', '', '', '', m.totalWithExtra, '']))
    ws.mergeCells(totRow.number, 15, totRow.number, 16)
    totRow.getCell(15).alignment = { horizontal: 'right' }
    styleFont(totRow, { bold: true })

    const rndRow = ws.addRow(pad16(['', '', '', '', '', '', '', '', '', '', '', '', '', '', m.roundedQty, '']))
    ws.mergeCells(rndRow.number, 15, rndRow.number, 16)
    rndRow.getCell(15).alignment = { horizontal: 'right' }
    styleFont(rndRow, { bold: true, size: 11 })
    styleFill(rndRow, 'FFFEF9C3')
  }

  addMergedRow(ws, ['Line Items'], {
    fill: SECTION_RED,
    font: { bold: true, color: { argb: TITLE_RED }, size: 12 },
    height: 22,
  })

  const liHeads = ws.addRow(
    pad16(['S.No', 'Item Description', '', '', '', '', '', 'Short Description', '', '', 'Unit', 'Quantity', 'Rate', '', 'Remarks', '']),
  )
  ws.mergeCells(liHeads.number, 2, liHeads.number, 7)
  ws.mergeCells(liHeads.number, 8, liHeads.number, 10)
  ws.mergeCells(liHeads.number, 13, liHeads.number, 14)
  ws.mergeCells(liHeads.number, 15, liHeads.number, 16)
  styleFill(liHeads, 'FFE2E8F0')
  styleFont(liHeads, { bold: true, size: 9 })

  const lineItems = Array.isArray(payload.lineItems) ? payload.lineItems : []
  for (const item of lineItems) {
    if (item.visible === false) continue
    const r = ws.addRow(
      pad16([
        item.item_no,
        `${item.title || ''}${item.sub ? `\n${item.sub}` : ''}`,
        '',
        '',
        '',
        '',
        '',
        item.short_name,
        '',
        '',
        item.unit,
        item.qty,
        item.rate || '',
        '',
        item.remarks || '',
        '',
      ]),
    )
    ws.mergeCells(r.number, 2, r.number, 7)
    ws.mergeCells(r.number, 8, r.number, 10)
    ws.mergeCells(r.number, 13, r.number, 14)
    ws.mergeCells(r.number, 15, r.number, 16)
    r.height = item.sub ? 36 : 22
    r.getCell(12).alignment = { horizontal: 'right' }
    r.getCell(1).alignment = { horizontal: 'center' }
    r.getCell(11).alignment = { horizontal: 'center' }
  }

  applyBorders(ws, start, ws.rowCount)
  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}
