/**
 * Persist Potree project markings into MySQL `point_cloud_data` (keyed by bridge_id + point_cloud_id).
 * One row per measurement and per annotation so all columns are used; summary counts are copied onto each row.
 */

let schemaReady = false

function numOrNull(v) {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function strOrNull(v, max) {
  if (v == null) return null
  const s = String(v).trim()
  if (!s) return null
  return max ? s.slice(0, max) : s
}

function asVec3(point) {
  if (Array.isArray(point) && point.length >= 3) {
    return [numOrNull(point[0]), numOrNull(point[1]), numOrNull(point[2])]
  }
  if (point && typeof point === 'object') {
    return [numOrNull(point.x), numOrNull(point.y), numOrNull(point.z)]
  }
  return [null, null, null]
}

/** Flatten Potree annotation tree (roots + descendants). */
export function flattenAnnotations(nodes, out = []) {
  for (const node of Array.isArray(nodes) ? nodes : []) {
    if (!node || typeof node !== 'object') continue
    out.push(node)
    if (Array.isArray(node.children) && node.children.length) {
      flattenAnnotations(node.children, out)
    }
  }
  return out
}

function countAnnotationChildren(nodes) {
  let n = 0
  for (const node of Array.isArray(nodes) ? nodes : []) {
    const kids = Array.isArray(node?.children) ? node.children : []
    n += kids.length
    if (kids.length) n += countAnnotationChildren(kids)
  }
  return n
}

function makeRowId(prefix, uuid, fallbackKey) {
  const raw = String(uuid || '').trim() || `${prefix}-${fallbackKey}`
  return raw.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 50)
}

/**
 * Map a Potree saveProject payload (+ optional image annotations) into `point_cloud_data` rows.
 */
export function projectToPointCloudRows({
  bridgeId,
  bridgeInspectionId = null,
  pointCloudId,
  project,
  imageAnnotations = [],
  createdAt = new Date(),
} = {}) {
  const bid = Number(bridgeId)
  const cloudId = String(pointCloudId || '').trim()
  if (!bid || !cloudId) return []

  const proj = project && typeof project === 'object' ? project : {}
  const measurements = Array.isArray(proj.measurements) ? proj.measurements : []
  const annotationRoots = Array.isArray(proj.annotations) ? proj.annotations : []
  const annotations = flattenAnnotations(annotationRoots)
  const images = Array.isArray(imageAnnotations) ? imageAnnotations : []

  const counts = {
    volumes_count: Array.isArray(proj.volumes) ? proj.volumes.length : 0,
    profiles_count: Array.isArray(proj.profiles) ? proj.profiles.length : 0,
    camera_animations_count: Array.isArray(proj.cameraAnimations) ? proj.cameraAnimations.length : 0,
    oriented_images_count: Array.isArray(proj.orientedImages) ? proj.orientedImages.length : 0,
    annotation_children_count: countAnnotationChildren(annotationRoots),
  }

  const base = {
    bridge_id: bid,
    point_cloud_id: cloudId.slice(0, 255),
    created_at: createdAt,
    bridge_inspection_id: bridgeInspectionId == null || bridgeInspectionId === '' ? null : Number(bridgeInspectionId) || null,
    project_type: strOrNull(proj.type || 'Potree', 100),
    project_version: numOrNull(proj.version ?? 1.7),
    images: null,
    ...counts,
  }

  const emptyMarkingFields = {
    measurement_name: null,
    point_1_x: null,
    point_1_y: null,
    point_1_z: null,
    point_2_x: null,
    point_2_y: null,
    point_2_z: null,
    annotation_uuid: null,
    annotation_title: null,
    annotation_description: null,
    annotation_position_x: null,
    annotation_position_y: null,
    annotation_position_z: null,
    annotation_offset_x: null,
    annotation_offset_y: null,
    annotation_offset_z: null,
    images: null,
  }

  const rows = []

  measurements.forEach((m, idx) => {
    const points = Array.isArray(m?.points) ? m.points : []
    const [p1x, p1y, p1z] = asVec3(points[0])
    const [p2x, p2y, p2z] = asVec3(points[1])
    rows.push({
      ...base,
      ...emptyMarkingFields,
      id: makeRowId('m', m?.uuid, `${cloudId}-m-${idx}`),
      measurement_name: strOrNull(m?.name, 100),
      point_1_x: p1x,
      point_1_y: p1y,
      point_1_z: p1z,
      point_2_x: p2x,
      point_2_y: p2y,
      point_2_z: p2z,
    })
  })

  annotations.forEach((a, idx) => {
    const [px, py, pz] = asVec3(a?.position)
    const [ox, oy, oz] = asVec3(a?.offset)
    rows.push({
      ...base,
      ...emptyMarkingFields,
      id: makeRowId('a', a?.uuid, `${cloudId}-a-${idx}`),
      annotation_uuid: strOrNull(a?.uuid, 100),
      annotation_title: strOrNull(a?.title, 255),
      annotation_description: a?.description != null ? String(a.description) : null,
      annotation_position_x: px,
      annotation_position_y: py,
      annotation_position_z: pz,
      annotation_offset_x: ox,
      annotation_offset_y: oy,
      annotation_offset_z: oz,
    })
  })

  images.forEach((item, idx) => {
    const dataUrl = extractImageDataUrl(item)
    if (!dataUrl) return
    const [px, py, pz] = asVec3(item?.position)
    const name = item?.image?.name || item?.name || 'Image'
    rows.push({
      ...base,
      ...emptyMarkingFields,
      id: makeRowId('i', item?.id, `${cloudId}-i-${idx}`),
      annotation_uuid: strOrNull(item?.id, 100),
      annotation_title: strOrNull(name, 255),
      annotation_description: strOrNull(item?.image?.mimeType || item?.mimeType, 255),
      annotation_position_x: px,
      annotation_position_y: py,
      annotation_position_z: pz,
      images: dataUrl,
    })
  })

  // Always keep at least one row so the cloud is registered under the bridge.
  if (!rows.length) {
    rows.push({
      ...base,
      ...emptyMarkingFields,
      id: makeRowId('s', null, `${cloudId}-summary`),
    })
  }

  return rows
}

/** Pull a data-URL / base64 string from an image-annotation payload. */
function extractImageDataUrl(item) {
  if (!item || typeof item !== 'object') return null
  const raw =
    item.image?.data ||
    item.data ||
    (typeof item.images === 'string' ? item.images : null) ||
    null
  if (!raw || typeof raw !== 'string') return null
  const s = raw.trim()
  if (!s) return null
  if (s.startsWith('data:')) return s
  // bare base64 → assume jpeg
  if (/^[A-Za-z0-9+/=\s]+$/.test(s.slice(0, 80))) {
    return `data:image/jpeg;base64,${s.replace(/\s+/g, '')}`
  }
  return s
}

/** Rebuild viewer imageAnnotations from DB rows that have `images` set. */
export function rowsToImageAnnotations(rows) {
  const out = []
  for (const r of Array.isArray(rows) ? rows : []) {
    const dataUrl = extractImageDataUrl({ images: r?.images, image: { data: r?.images } })
    if (!dataUrl) continue
    const mimeMatch = /^data:([^;,]+)/i.exec(dataUrl)
    out.push({
      id: r.annotation_uuid || r.id,
      type: 'image',
      position: {
        x: numOrNull(r.annotation_position_x) ?? 0,
        y: numOrNull(r.annotation_position_y) ?? 0,
        z: numOrNull(r.annotation_position_z) ?? 0,
      },
      image: {
        data: dataUrl,
        mimeType: mimeMatch?.[1] || r.annotation_description || 'image/jpeg',
        name: r.annotation_title || 'Image',
      },
      createdAt: r.created_at || null,
      updatedAt: r.created_at || null,
    })
  }
  return out
}

/**
 * Ensure table allows multiple entity rows per potree folder and optional inspection.
 * Safe to call repeatedly.
 */
export async function ensurePointCloudDataSchema(pool) {
  if (schemaReady) return
  // Drop UNIQUE on point_cloud_id (one cloud → many measurements/annotations).
  try {
    await pool.query('ALTER TABLE point_cloud_data DROP INDEX uk_point_cloud_id')
  } catch (e) {
    if (e?.code !== 'ER_CANT_DROP_FIELD_OR_KEY' && e?.errno !== 1091) {
      // ignore missing index; rethrow unexpected
      if (!/check that it exists|Unknown key|doesn't exist/i.test(String(e?.message || ''))) {
        console.warn('[point_cloud_data] drop uk_point_cloud_id:', e.message)
      }
    }
  }

  try {
    await pool.query(
      'CREATE INDEX idx_pcd_bridge_cloud ON point_cloud_data (bridge_id, point_cloud_id)'
    )
  } catch (e) {
    if (e?.code !== 'ER_DUP_KEYNAME' && e?.errno !== 1061) {
      console.warn('[point_cloud_data] create idx_pcd_bridge_cloud:', e.message)
    }
  }

  // Allow inventory 3D saves without an inspection.
  try {
    await pool.query('ALTER TABLE point_cloud_data DROP FOREIGN KEY fk_point_cloud_data_bridge_inspection')
  } catch (e) {
    if (e?.errno !== 1091 && e?.code !== 'ER_CANT_DROP_FIELD_OR_KEY') {
      console.warn('[point_cloud_data] drop fk inspection:', e.message)
    }
  }

  try {
    await pool.query(
      'ALTER TABLE point_cloud_data MODIFY COLUMN bridge_inspection_id INT NULL'
    )
  } catch (e) {
    console.warn('[point_cloud_data] modify bridge_inspection_id:', e.message)
  }

  try {
    await pool.query(`
      ALTER TABLE point_cloud_data
      ADD CONSTRAINT fk_point_cloud_data_bridge_inspection
      FOREIGN KEY (bridge_inspection_id) REFERENCES bridge_inspection (bridge_inspection_id)
      ON DELETE SET NULL ON UPDATE CASCADE
    `)
  } catch (e) {
    if (e?.code !== 'ER_DUP_KEYNAME' && e?.errno !== 1826 && e?.errno !== 1005) {
      // 1826 = duplicate FK name; 1005 = cannot create (already exists / mismatch)
      if (!/Duplicate|already exists/i.test(String(e?.message || ''))) {
        console.warn('[point_cloud_data] add fk inspection:', e.message)
      }
    }
  }

  // Ensure base64 image column exists (LONGTEXT).
  try {
    await pool.query(
      'ALTER TABLE point_cloud_data ADD COLUMN images LONGTEXT NULL'
    )
  } catch (e) {
    if (e?.code !== 'ER_DUP_FIELDNAME' && e?.errno !== 1060) {
      console.warn('[point_cloud_data] add images column:', e.message)
    }
  }

  schemaReady = true
}

async function resolveInspectionId(pool, bridgeId, requestedId) {
  const req = Number(requestedId || 0)
  if (req) {
    const [rows] = await pool.query(
      `SELECT bridge_inspection_id FROM bridge_inspection
       WHERE bridge_inspection_id = ? AND bridge_id = ?
       LIMIT 1`,
      [req, bridgeId]
    )
    if (rows[0]?.bridge_inspection_id) return Number(rows[0].bridge_inspection_id)
  }
  const [latest] = await pool.query(
    `SELECT bridge_inspection_id FROM bridge_inspection
     WHERE bridge_id = ?
     ORDER BY bridge_inspection_id DESC
     LIMIT 1`,
    [bridgeId]
  )
  return latest[0]?.bridge_inspection_id != null ? Number(latest[0].bridge_inspection_id) : null
}

const INSERT_SQL = `
  INSERT INTO point_cloud_data (
    bridge_id, id, point_cloud_id, created_at, bridge_inspection_id,
    project_type, project_version,
    measurement_name, point_1_x, point_1_y, point_1_z, point_2_x, point_2_y, point_2_z,
    annotation_uuid, annotation_title, annotation_description,
    annotation_position_x, annotation_position_y, annotation_position_z,
    annotation_offset_x, annotation_offset_y, annotation_offset_z,
    volumes_count, profiles_count, camera_animations_count, oriented_images_count, annotation_children_count,
    images
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`

/**
 * Replace all rows for a bridge + potree folder with the latest project snapshot.
 */
export async function replacePointCloudData(pool, {
  bridgeId,
  bridgeInspectionId = null,
  pointCloudId,
  project,
  imageAnnotations = [],
} = {}) {
  await ensurePointCloudDataSchema(pool)

  const bid = Number(bridgeId)
  const cloudId = String(pointCloudId || '').trim()
  if (!bid) {
    const err = new Error('Invalid bridgeId')
    err.status = 400
    throw err
  }
  if (!cloudId) {
    const err = new Error('pointCloudId is required')
    err.status = 400
    throw err
  }

  const [bridgeRows] = await pool.query('SELECT bridge_id FROM bridge WHERE bridge_id = ? LIMIT 1', [bid])
  if (!bridgeRows.length) {
    const err = new Error('Bridge not found')
    err.status = 404
    throw err
  }

  const inspectionId = await resolveInspectionId(pool, bid, bridgeInspectionId)
  const now = new Date()
  const rows = projectToPointCloudRows({
    bridgeId: bid,
    bridgeInspectionId: inspectionId,
    pointCloudId: cloudId,
    project,
    imageAnnotations,
    createdAt: now,
  })

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    await conn.query(
      'DELETE FROM point_cloud_data WHERE bridge_id = ? AND point_cloud_id = ?',
      [bid, cloudId]
    )
    for (const row of rows) {
      await conn.query(INSERT_SQL, [
        row.bridge_id,
        row.id,
        row.point_cloud_id,
        row.created_at,
        row.bridge_inspection_id,
        row.project_type,
        row.project_version,
        row.measurement_name,
        row.point_1_x,
        row.point_1_y,
        row.point_1_z,
        row.point_2_x,
        row.point_2_y,
        row.point_2_z,
        row.annotation_uuid,
        row.annotation_title,
        row.annotation_description,
        row.annotation_position_x,
        row.annotation_position_y,
        row.annotation_position_z,
        row.annotation_offset_x,
        row.annotation_offset_y,
        row.annotation_offset_z,
        row.volumes_count,
        row.profiles_count,
        row.camera_animations_count,
        row.oriented_images_count,
        row.annotation_children_count,
        row.images,
      ])
    }
    await conn.commit()
  } catch (e) {
    await conn.rollback()
    throw e
  } finally {
    conn.release()
  }

  return { bridgeId: bid, pointCloudId: cloudId, bridgeInspectionId: inspectionId, rowCount: rows.length, rows }
}

export async function listPointCloudData(pool, { bridgeId, pointCloudId = null } = {}) {
  await ensurePointCloudDataSchema(pool)
  const bid = Number(bridgeId)
  if (!bid) {
    const err = new Error('Invalid bridgeId')
    err.status = 400
    throw err
  }
  const cloudId = String(pointCloudId || '').trim()
  if (cloudId) {
    const [rows] = await pool.query(
      `SELECT * FROM point_cloud_data
       WHERE bridge_id = ? AND point_cloud_id = ?
       ORDER BY created_at DESC, id ASC`,
      [bid, cloudId]
    )
    return rows
  }
  const [rows] = await pool.query(
    `SELECT * FROM point_cloud_data
     WHERE bridge_id = ?
     ORDER BY created_at DESC, point_cloud_id ASC, id ASC`,
    [bid]
  )
  return rows
}
