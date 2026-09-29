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
    // Potree Measure markers are often { position: Vector3|[x,y,z] }
    if (point.position != null) return asVec3(point.position)
    if (typeof point.toArray === 'function') {
      try {
        return asVec3(point.toArray())
      } catch {
        /* ignore */
      }
    }
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

/** Global PK is on `id` alone — must include bridge + cloud or saves collide across bridges. */
function entityRowId(bridgeId, pointCloudId, kind, uuid, idx) {
  const bid = Number(bridgeId) || 0
  const cloud = String(pointCloudId || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .slice(0, 24)
  const ent = String(uuid || `${kind}${idx}`)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .slice(0, 18)
  return makeRowId('', null, `${bid}_${cloud}_${kind}_${ent}`)
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

  const projectSnapshot = compactProjectForStorage(proj)

  const base = {
    bridge_id: bid,
    point_cloud_id: cloudId.slice(0, 255),
    created_at: createdAt,
    bridge_inspection_id: bridgeInspectionId == null || bridgeInspectionId === '' ? null : Number(bridgeInspectionId) || null,
    project_type: strOrNull(proj.type || 'Potree', 100),
    project_version: numOrNull(proj.version ?? 1.7),
    project_json: projectSnapshot,
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
      id: entityRowId(bid, cloudId, 'm', m?.uuid, idx),
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
      id: entityRowId(bid, cloudId, 'a', a?.uuid, idx),
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
    const note = item?.text || item?.note || item?.description || ''
    rows.push({
      ...base,
      ...emptyMarkingFields,
      id: entityRowId(bid, cloudId, 'i', item?.id, idx),
      annotation_uuid: strOrNull(item?.id, 100),
      annotation_title: strOrNull(name, 255),
      annotation_description: note != null && String(note).trim() !== '' ? String(note) : null,
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
      id: entityRowId(bid, cloudId, 's', 'summary', 0),
    })
  }

  return rows
}

/** Pull a data-URL / base64 string from an image-annotation payload. */
function coerceTextField(v) {
  if (v == null) return null
  if (typeof v === 'string') return v
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(v)) return v.toString('utf8')
  if (v instanceof Uint8Array) {
    return Buffer.from(v).toString('utf8')
  }
  // mysql2 sometimes returns { type: 'Buffer', data: number[] } after JSON round-trips
  if (typeof v === 'object' && v.type === 'Buffer' && Array.isArray(v.data)) {
    return Buffer.from(v.data).toString('utf8')
  }
  return null
}

function extractImageDataUrl(item) {
  if (!item || typeof item !== 'object') return null
  const raw =
    coerceTextField(item.image?.data) ||
    coerceTextField(item.data) ||
    coerceTextField(item.images) ||
    null
  if (!raw) return null
  const s = raw.trim()
  if (!s) return null
  if (s.startsWith('data:')) return s
  // bare base64 → assume jpeg
  if (/^[A-Za-z0-9+/=\s]+$/.test(s.slice(0, 80))) {
    return `data:image/jpeg;base64,${s.replace(/\s+/g, '')}`
  }
  return s
}

function isPointCloudImageRow(r) {
  if (!r || typeof r !== 'object') return false
  if (r.images) return true
  const id = String(r.id || '')
  if (/_i_/i.test(id)) return true
  const uuid = String(r.annotation_uuid || '')
  if (/^img_/i.test(uuid)) return true
  const title = String(r.annotation_title || '')
  if (/\.(png|jpe?g|gif|webp)$/i.test(title)) return true
  return false
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
        mimeType: mimeMatch?.[1] || 'image/jpeg',
        name: r.annotation_title || 'Image',
      },
      text: r.annotation_description || '',
      note: r.annotation_description || '',
      createdAt: r.created_at || null,
      updatedAt: r.created_at || null,
    })
  }
  return out
}

/** API list payload without duplicating multi-MB base64 blobs in `data`. */
export function rowsForApiList(rows) {
  return (Array.isArray(rows) ? rows : []).map((r) => {
    const imagesText = coerceTextField(r?.images)
    const hasImage = Boolean(imagesText && imagesText.trim())
    return {
      ...r,
      images: null,
      has_image: hasImage,
      images_bytes: hasImage ? imagesText.length : 0,
    }
  })
}

/** Compact Potree project for MySQL (no pointclouds / heavy blobs). */
export function compactProjectForStorage(project) {
  if (!project || typeof project !== 'object') return null
  try {
    const distress = project.highlightDistress
    return JSON.stringify({
      type: project.type || 'Potree',
      version: project.version ?? 1.7,
      view: project.view || null,
      settings: project.settings || null,
      classification: project.classification || null,
      measurements: Array.isArray(project.measurements) ? project.measurements : [],
      volumes: Array.isArray(project.volumes) ? project.volumes : [],
      profiles: Array.isArray(project.profiles) ? project.profiles : [],
      annotations: Array.isArray(project.annotations) ? project.annotations : [],
      cameraAnimations: Array.isArray(project.cameraAnimations) ? project.cameraAnimations : [],
      orientedImages: Array.isArray(project.orientedImages) ? project.orientedImages : [],
      geopackages: Array.isArray(project.geopackages) ? project.geopackages : [],
      highlightDistress:
        distress && Array.isArray(distress.polygons) && distress.polygons.length ? distress : null,
    })
  } catch {
    return null
  }
}

function parseStoredProjectJson(raw) {
  if (raw == null || raw === '') return null
  // mysql2 may return LONGTEXT as Buffer
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(raw)) {
    raw = raw.toString('utf8')
  }
  let obj = null
  if (typeof raw === 'object') {
    if (Array.isArray(raw)) return null
    obj = raw
  } else if (typeof raw === 'string') {
    const s = raw.trim()
    if (!s) return null
    try {
      const parsed = JSON.parse(s)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
      obj = parsed
    } catch {
      return null
    }
  } else {
    return null
  }
  // Reject non-project objects (e.g. accidental row wrappers)
  const looksLikeProject =
    obj.type != null ||
    Array.isArray(obj.measurements) ||
    Array.isArray(obj.annotations) ||
    Array.isArray(obj.volumes) ||
    Array.isArray(obj.profiles) ||
    Array.isArray(obj.cameraAnimations) ||
    Array.isArray(obj.orientedImages) ||
    Array.isArray(obj.geopackages) ||
    Array.isArray(obj.highlightDistress?.polygons)
  return looksLikeProject ? obj : null
}

/** Potree.loadMeasurement expects points as [x,y,z] arrays, not {position:[...]}. */
function normalizeMeasurePoint(point) {
  const v = asVec3(point)
  if (!v) return null
  if (v[0] == null && v[1] == null && v[2] == null) return null
  return [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0]
}

function isOriginPoint(p) {
  return Array.isArray(p) && p.every((n) => Number(n) === 0)
}

function normalizeProjectMeasurements(list) {
  return (Array.isArray(list) ? list : []).map((m, idx) => {
    const points = (Array.isArray(m?.points) ? m.points : [])
      .map(normalizeMeasurePoint)
      .filter((p) => Array.isArray(p) && p.length >= 3)
    return {
      ...m,
      uuid: m?.uuid || `m-${idx}`,
      name: m?.name || `Measurement ${idx + 1}`,
      points,
      showDistances: m?.showDistances !== false,
      showEdges: m?.showEdges !== false,
      closed: Boolean(m?.closed),
      showCoordinates: Boolean(m?.showCoordinates),
      showArea: Boolean(m?.showArea),
      showAngles: Boolean(m?.showAngles),
      showHeight: Boolean(m?.showHeight),
      showCircle: Boolean(m?.showCircle),
      showAzimuth: Boolean(m?.showAzimuth),
    }
  }).filter((m) => m.points.length >= 2 && !m.points.every(isOriginPoint))
}

function normalizeProjectAnnotations(list) {
  const walk = (items) =>
    (Array.isArray(items) ? items : []).map((a, idx) => {
      const pos = asVec3(a?.position) || [0, 0, 0]
      const off = asVec3(a?.offset) || [0, 10, 0]
      return {
        ...a,
        uuid: a?.uuid || `a-${idx}`,
        title: a?.title || '',
        description: a?.description || '',
        position: [pos[0] ?? 0, pos[1] ?? 0, pos[2] ?? 0],
        offset: [off[0] ?? 0, off[1] ?? 10, off[2] ?? 0],
        children: walk(a?.children),
      }
    })
  return walk(list)
}

function countProjectMarkings(project) {
  if (!project || typeof project !== 'object') return 0
  const distressCount = Array.isArray(project.highlightDistress?.polygons)
    ? project.highlightDistress.polygons.length
    : 0
  return (
    (Array.isArray(project.measurements) ? project.measurements.length : 0) +
    (Array.isArray(project.annotations) ? project.annotations.length : 0) +
    (Array.isArray(project.volumes) ? project.volumes.length : 0) +
    (Array.isArray(project.profiles) ? project.profiles.length : 0) +
    (Array.isArray(project.cameraAnimations) ? project.cameraAnimations.length : 0) +
    (Array.isArray(project.orientedImages) ? project.orientedImages.length : 0) +
    (Array.isArray(project.geopackages) ? project.geopackages.length : 0) +
    distressCount
  )
}

function finishProject(project) {
  if (!project) return null
  const measurements = normalizeProjectMeasurements(project.measurements)
  const annotations = normalizeProjectAnnotations(project.annotations)
  const volumes = Array.isArray(project.volumes) ? project.volumes : []
  const profiles = Array.isArray(project.profiles) ? project.profiles : []
  const cameraAnimations = Array.isArray(project.cameraAnimations) ? project.cameraAnimations : []
  const orientedImages = Array.isArray(project.orientedImages) ? project.orientedImages : []
  const geopackages = Array.isArray(project.geopackages) ? project.geopackages : []
  const highlightDistress =
    project.highlightDistress && Array.isArray(project.highlightDistress.polygons)
      ? project.highlightDistress
      : null
  const distressCount = Array.isArray(highlightDistress?.polygons)
    ? highlightDistress.polygons.length
    : 0
  if (
    !measurements.length &&
    !annotations.length &&
    !volumes.length &&
    !profiles.length &&
    !cameraAnimations.length &&
    !orientedImages.length &&
    !geopackages.length &&
    !distressCount
  ) {
    return null
  }
  return {
    type: project.type || 'Potree',
    version: project.version ?? 1.7,
    view: project.view || null,
    settings: project.settings || null,
    classification: project.classification || null,
    pointclouds: [],
    measurements,
    volumes,
    profiles,
    annotations,
    cameraAnimations,
    orientedImages,
    geopackages,
    highlightDistress: distressCount ? highlightDistress : null,
  }
}

function rebuildProjectFromFlatColumns(list) {
  const measurements = []
  const annotations = []
  let projectType = 'Potree'
  let projectVersion = 1.7

  for (const r of list) {
    if (r?.project_type) projectType = String(r.project_type)
    if (r?.project_version != null && Number.isFinite(Number(r.project_version))) {
      projectVersion = Number(r.project_version)
    }

    const hasMeas =
      r?.measurement_name ||
      r?.point_1_x != null ||
      r?.point_2_x != null
    if (hasMeas) {
      const points = []
      if (r.point_1_x != null || r.point_1_y != null || r.point_1_z != null) {
        points.push([
          numOrNull(r.point_1_x) ?? 0,
          numOrNull(r.point_1_y) ?? 0,
          numOrNull(r.point_1_z) ?? 0,
        ])
      }
      if (r.point_2_x != null || r.point_2_y != null || r.point_2_z != null) {
        points.push([
          numOrNull(r.point_2_x) ?? 0,
          numOrNull(r.point_2_y) ?? 0,
          numOrNull(r.point_2_z) ?? 0,
        ])
      }
      if (points.length) {
        measurements.push({
          uuid: String(r.id || `m-${measurements.length}`),
          name: r.measurement_name || `Measurement ${measurements.length + 1}`,
          points,
          showDistances: true,
          showCoordinates: false,
          showArea: false,
          closed: false,
          showAngles: false,
          showHeight: false,
          showCircle: false,
          showAzimuth: false,
          showEdges: true,
        })
      }
    }

    // Image rows also use annotation_* — skip those (photos have images or an `_i_` row id).
    const isImageRow = isPointCloudImageRow(r)
    const hasAnno =
      !isImageRow &&
      (r?.annotation_uuid || r?.annotation_title || r?.annotation_position_x != null)
    if (hasAnno) {
      annotations.push({
        uuid: r.annotation_uuid || String(r.id || `a-${annotations.length}`),
        title: r.annotation_title || '',
        description: r.annotation_description || '',
        position: [
          numOrNull(r.annotation_position_x) ?? 0,
          numOrNull(r.annotation_position_y) ?? 0,
          numOrNull(r.annotation_position_z) ?? 0,
        ],
        offset: [
          numOrNull(r.annotation_offset_x) ?? 0,
          numOrNull(r.annotation_offset_y) ?? 10,
          numOrNull(r.annotation_offset_z) ?? 0,
        ],
        children: [],
      })
    }
  }

  return finishProject({
    type: projectType || 'Potree',
    version: projectVersion,
    measurements,
    annotations,
  })
}

/**
 * Rebuild a Potree project from DB rows.
 * Prefer the richest non-empty project_json; fall back to flat columns.
 * Never treat an empty project_json as authoritative when flat rows have data.
 */
export function rowsToPotreeProject(rows) {
  const list = Array.isArray(rows) ? rows : []
  let bestFromJson = null
  let bestScore = -1

  for (const r of list) {
    const fromJson = parseStoredProjectJson(r?.project_json)
    if (!fromJson) continue
    const candidate = {
      type: fromJson.type || 'Potree',
      version: fromJson.version ?? 1.7,
      view: fromJson.view || null,
      settings: fromJson.settings || null,
      classification: fromJson.classification || null,
      measurements: Array.isArray(fromJson.measurements) ? fromJson.measurements : [],
      volumes: Array.isArray(fromJson.volumes) ? fromJson.volumes : [],
      profiles: Array.isArray(fromJson.profiles) ? fromJson.profiles : [],
      annotations: Array.isArray(fromJson.annotations) ? fromJson.annotations : [],
      cameraAnimations: Array.isArray(fromJson.cameraAnimations) ? fromJson.cameraAnimations : [],
      orientedImages: Array.isArray(fromJson.orientedImages) ? fromJson.orientedImages : [],
      geopackages: Array.isArray(fromJson.geopackages) ? fromJson.geopackages : [],
      highlightDistress: fromJson.highlightDistress || null,
    }
    const score = countProjectMarkings(candidate)
    if (score > bestScore) {
      bestScore = score
      bestFromJson = candidate
    }
  }

  const fromFlat = rebuildProjectFromFlatColumns(list)
  if (bestScore > 0) {
    const fromJson = finishProject(bestFromJson)
    // If JSON is sparse but flat columns have more measures/annotations, prefer the richer set.
    if (fromFlat && countProjectMarkings(fromFlat) > countProjectMarkings(fromJson)) {
      return {
        ...fromJson,
        measurements:
          (fromFlat.measurements?.length || 0) > (fromJson?.measurements?.length || 0)
            ? fromFlat.measurements
            : fromJson.measurements,
        annotations:
          (fromFlat.annotations?.length || 0) > (fromJson?.annotations?.length || 0)
            ? fromFlat.annotations
            : fromJson.annotations,
      }
    }
    return fromJson
  }

  return fromFlat
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

  // Full Potree project snapshot so multi-point measurements restore correctly.
  try {
    await pool.query(
      'ALTER TABLE point_cloud_data ADD COLUMN project_json LONGTEXT NULL'
    )
  } catch (e) {
    if (e?.code !== 'ER_DUP_FIELDNAME' && e?.errno !== 1060) {
      console.warn('[point_cloud_data] add project_json column:', e.message)
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
    project_type, project_version, project_json,
    measurement_name, point_1_x, point_1_y, point_1_z, point_2_x, point_2_y, point_2_z,
    annotation_uuid, annotation_title, annotation_description,
    annotation_position_x, annotation_position_y, annotation_position_z,
    annotation_offset_x, annotation_offset_y, annotation_offset_z,
    volumes_count, profiles_count, camera_animations_count, oriented_images_count, annotation_children_count,
    images
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON DUPLICATE KEY UPDATE
    bridge_id = VALUES(bridge_id),
    point_cloud_id = VALUES(point_cloud_id),
    created_at = VALUES(created_at),
    bridge_inspection_id = VALUES(bridge_inspection_id),
    project_type = VALUES(project_type),
    project_version = VALUES(project_version),
    project_json = VALUES(project_json),
    measurement_name = VALUES(measurement_name),
    point_1_x = VALUES(point_1_x),
    point_1_y = VALUES(point_1_y),
    point_1_z = VALUES(point_1_z),
    point_2_x = VALUES(point_2_x),
    point_2_y = VALUES(point_2_y),
    point_2_z = VALUES(point_2_z),
    annotation_uuid = VALUES(annotation_uuid),
    annotation_title = VALUES(annotation_title),
    annotation_description = VALUES(annotation_description),
    annotation_position_x = VALUES(annotation_position_x),
    annotation_position_y = VALUES(annotation_position_y),
    annotation_position_z = VALUES(annotation_position_z),
    annotation_offset_x = VALUES(annotation_offset_x),
    annotation_offset_y = VALUES(annotation_offset_y),
    annotation_offset_z = VALUES(annotation_offset_z),
    volumes_count = VALUES(volumes_count),
    profiles_count = VALUES(profiles_count),
    camera_animations_count = VALUES(camera_animations_count),
    oriented_images_count = VALUES(oriented_images_count),
    annotation_children_count = VALUES(annotation_children_count),
    images = VALUES(images)
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
  preserveExistingImages = false,
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

  let images = Array.isArray(imageAnnotations) ? imageAnnotations : []
  const shouldPreserve = Boolean(preserveExistingImages) || images.length === 0
  /** When preserving photos, avoid loading huge base64 blobs — keep image rows untouched in SQL. */
  const preserveImagesInPlace = shouldPreserve && images.length === 0
  if (shouldPreserve && !preserveImagesInPlace) {
    const existingRows = await listPointCloudData(pool, {
      bridgeId: bid,
      pointCloudId: cloudId,
      includeImages: true,
    })
    const existingImages = rowsToImageAnnotations(existingRows)
    if (existingImages.length) {
      if (!images.length) {
        images = existingImages
      } else {
        const map = new Map()
        for (const img of existingImages) {
          map.set(String(img.id || img.annotation_uuid || `keep-${map.size}`), img)
        }
        for (const img of images) {
          const key = String(img.id || img.annotation_uuid || `new-${map.size}`)
          map.set(key, img)
        }
        images = Array.from(map.values())
      }
    }
  }

  const inspectionId = await resolveInspectionId(pool, bid, bridgeInspectionId)
  const now = new Date()
  const rows = projectToPointCloudRows({
    bridgeId: bid,
    bridgeInspectionId: inspectionId,
    pointCloudId: cloudId,
    project,
    imageAnnotations: preserveImagesInPlace ? [] : images,
    createdAt: now,
  })

  // Refuse accidental wipe: empty incoming must not DELETE existing markings.
  const incomingHasContent = rows.some(
    (r) =>
      r.measurement_name ||
      r.point_1_x != null ||
      r.annotation_uuid ||
      r.annotation_title ||
      r.images
  )
  if (!incomingHasContent) {
    const [existing] = await pool.query(
      `SELECT id, measurement_name, point_1_x, annotation_uuid, images
       FROM point_cloud_data
       WHERE bridge_id = ? AND point_cloud_id = ?
       LIMIT 50`,
      [bid, cloudId]
    )
    const existingHasContent = (existing || []).some(
      (r) =>
        r.measurement_name ||
        r.point_1_x != null ||
        r.annotation_uuid ||
        r.images
    )
    if (existingHasContent) {
      const err = new Error(
        'Refusing to overwrite existing point_cloud_data with an empty save. Re-open the cloud, wait for markings to restore, then save again.'
      )
      err.status = 409
      err.code = 'REFUSE_EMPTY_OVERWRITE'
      throw err
    }
  }

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    if (preserveImagesInPlace) {
      // Keep photo rows; replace measurements / annotations / project snapshot rows only.
      await conn.query(
        `DELETE FROM point_cloud_data
         WHERE bridge_id = ? AND point_cloud_id = ?
           AND (images IS NULL OR images = '')`,
        [bid, cloudId]
      )
    } else {
      await conn.query(
        'DELETE FROM point_cloud_data WHERE bridge_id = ? AND point_cloud_id = ?',
        [bid, cloudId]
      )
    }
    for (const row of rows) {
      await conn.query(INSERT_SQL, [
        row.bridge_id,
        row.id,
        row.point_cloud_id,
        row.created_at,
        row.bridge_inspection_id,
        row.project_type,
        row.project_version,
        row.project_json,
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

  return {
    bridgeId: bid,
    pointCloudId: cloudId,
    bridgeInspectionId: inspectionId,
    rowCount: rows.length,
    imageCount: preserveImagesInPlace
      ? undefined
      : rows.filter((r) => r.images).length,
    rows,
  }
}

const POINT_CLOUD_DATA_COLUMNS = `
  bridge_id, id, point_cloud_id, created_at, bridge_inspection_id,
  project_type, project_version, project_json,
  measurement_name, point_1_x, point_1_y, point_1_z, point_2_x, point_2_y, point_2_z,
  annotation_uuid, annotation_title, annotation_description,
  annotation_position_x, annotation_position_y, annotation_position_z,
  annotation_offset_x, annotation_offset_y, annotation_offset_z,
  volumes_count, profiles_count, camera_animations_count, oriented_images_count, annotation_children_count
`

function pointCloudSelectSql(includeImages) {
  const imagesCol = includeImages ? ', images' : ', NULL AS images'
  return `SELECT ${POINT_CLOUD_DATA_COLUMNS}${imagesCol} FROM point_cloud_data`
}

function normalizeCloudId(id) {
  return String(id || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

async function resolveStoredCloudId(pool, requested, { bridgeId = null } = {}) {
  const raw = String(requested || '').trim()
  if (!raw) return raw
  if (bridgeId) {
    const [exact] = await pool.query(
      `SELECT point_cloud_id FROM point_cloud_data
       WHERE bridge_id = ? AND point_cloud_id = ?
       LIMIT 1`,
      [bridgeId, raw]
    )
    if (exact[0]?.point_cloud_id) return exact[0].point_cloud_id
    const [ids] = await pool.query(
      `SELECT DISTINCT point_cloud_id FROM point_cloud_data WHERE bridge_id = ?`,
      [bridgeId]
    )
    const want = normalizeCloudId(raw)
    const hit = (ids || []).find((r) => normalizeCloudId(r.point_cloud_id) === want)
    return hit?.point_cloud_id || raw
  }
  const [exact] = await pool.query(
    `SELECT point_cloud_id FROM point_cloud_data WHERE point_cloud_id = ? LIMIT 1`,
    [raw]
  )
  if (exact[0]?.point_cloud_id) return exact[0].point_cloud_id
  const [ids] = await pool.query(`SELECT DISTINCT point_cloud_id FROM point_cloud_data`)
  const want = normalizeCloudId(raw)
  const hit = (ids || []).find((r) => normalizeCloudId(r.point_cloud_id) === want)
  return hit?.point_cloud_id || raw
}

export async function listPointCloudData(pool, { bridgeId, pointCloudId = null, includeImages = true } = {}) {
  await ensurePointCloudDataSchema(pool)
  const bid = Number(bridgeId)
  if (!bid) {
    const err = new Error('Invalid bridgeId')
    err.status = 400
    throw err
  }
  const select = pointCloudSelectSql(includeImages)
  const cloudId = String(pointCloudId || '').trim()
  if (cloudId) {
    const storedId = await resolveStoredCloudId(pool, cloudId, { bridgeId: bid })
    const [rows] = await pool.query(
      `${select}
       WHERE bridge_id = ? AND point_cloud_id = ?
       ORDER BY created_at DESC, id ASC`,
      [bid, storedId]
    )
    return rows
  }
  const [rows] = await pool.query(
    `${select}
     WHERE bridge_id = ?
     ORDER BY created_at DESC, point_cloud_id ASC, id ASC`,
    [bid]
  )
  return rows
}

/** Load markings by point cloud id only (any bridge) — for standalone / dual-store restore. */
export async function listPointCloudDataByCloudId(pool, pointCloudId, { includeImages = true } = {}) {
  await ensurePointCloudDataSchema(pool)
  const cloudId = String(pointCloudId || '').trim()
  if (!cloudId) {
    const err = new Error('pointCloudId is required')
    err.status = 400
    throw err
  }
  const storedId = await resolveStoredCloudId(pool, cloudId)
  const [rows] = await pool.query(
    `${pointCloudSelectSql(includeImages)}
     WHERE point_cloud_id = ?
     ORDER BY created_at DESC, id ASC`,
    [storedId]
  )
  return rows
}

/** Prefer the most recently used bridge_id for a cloud (if any rows exist). */
export async function resolveBridgeIdForPointCloud(pool, pointCloudId) {
  await ensurePointCloudDataSchema(pool)
  const cloudId = String(pointCloudId || '').trim()
  if (!cloudId) return null
  const [rows] = await pool.query(
    `SELECT bridge_id FROM point_cloud_data
     WHERE point_cloud_id = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [cloudId]
  )
  const bid = Number(rows?.[0]?.bridge_id || 0)
  return bid || null
}

function imageWhereSql(cloudId, bridgeId) {
  const where = ['point_cloud_id = ?', 'images IS NOT NULL', 'CHAR_LENGTH(images) > 20']
  const params = [cloudId]
  if (bridgeId) {
    where.push('bridge_id = ?')
    params.push(Number(bridgeId))
  }
  return { where: where.join(' AND '), params }
}

/** Count photo rows without pulling LONGTEXT blobs. */
export async function countPointCloudImages(pool, { bridgeId = null, pointCloudId } = {}) {
  await ensurePointCloudDataSchema(pool)
  const cloudId = await resolveStoredCloudId(pool, pointCloudId, bridgeId ? { bridgeId } : {})
  const { where, params } = imageWhereSql(cloudId, bridgeId)
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM point_cloud_data WHERE ${where}`,
    params
  )
  return Number(rows?.[0]?.n || 0)
}

/** Photo pin metadata only — no base64. */
export async function listPointCloudImageMeta(pool, { bridgeId = null, pointCloudId } = {}) {
  await ensurePointCloudDataSchema(pool)
  const cloudId = String(pointCloudId || '').trim()
  if (!cloudId) {
    const err = new Error('pointCloudId is required')
    err.status = 400
    throw err
  }
  const storedId = await resolveStoredCloudId(pool, cloudId, bridgeId ? { bridgeId } : {})
  const { where, params } = imageWhereSql(storedId, bridgeId)
  const [rows] = await pool.query(
    `SELECT id, annotation_uuid, annotation_title, annotation_description,
            annotation_position_x, annotation_position_y, annotation_position_z,
            CHAR_LENGTH(images) AS images_bytes, created_at
     FROM point_cloud_data
     WHERE ${where}
     ORDER BY created_at DESC, id ASC`,
    params
  )
  return (rows || []).map((r) => ({
    id: r.annotation_uuid || r.id,
    rowId: r.id,
    title: r.annotation_title || 'Image',
    text: r.annotation_description || '',
    position: {
      x: numOrNull(r.annotation_position_x) ?? 0,
      y: numOrNull(r.annotation_position_y) ?? 0,
      z: numOrNull(r.annotation_position_z) ?? 0,
    },
    bytes: Number(r.images_bytes) || 0,
    createdAt: r.created_at || null,
  })).filter((item, idx, arr) => arr.findIndex((x) => String(x.id) === String(item.id)) === idx)
}

/** One photo blob as a viewer imageAnnotation. */
export async function getPointCloudImage(pool, { bridgeId = null, pointCloudId, imageId } = {}) {
  await ensurePointCloudDataSchema(pool)
  const cloudId = String(pointCloudId || '').trim()
  const key = String(imageId || '').trim()
  if (!cloudId || !key) {
    const err = new Error('pointCloudId and imageId are required')
    err.status = 400
    throw err
  }
  const storedId = await resolveStoredCloudId(pool, cloudId, bridgeId ? { bridgeId } : {})
  const params = [storedId, key, key]
  let sql = `SELECT id, annotation_uuid, annotation_title, annotation_description,
                    annotation_position_x, annotation_position_y, annotation_position_z,
                    images, created_at
             FROM point_cloud_data
             WHERE point_cloud_id = ? AND (annotation_uuid = ? OR id = ?)`
  if (bridgeId) {
    sql += ' AND bridge_id = ?'
    params.push(Number(bridgeId))
  }
  sql += ' LIMIT 1'
  const [rows] = await pool.query(sql, params)
  const anns = rowsToImageAnnotations(rows)
  return anns[0] || null
}

function entityKey(item) {
  return String(item?.uuid || item?.id || '').trim()
}

function mergeEntityList(list, upsert, deleteIds) {
  const next = (Array.isArray(list) ? list : []).filter((item) => {
    const id = entityKey(item)
    return id && !deleteIds.has(id)
  })
  const byId = new Map(next.map((item) => [entityKey(item), item]))
  if (upsert?.data) {
    const id = String(upsert.id || entityKey(upsert.data) || '').trim()
    if (id) byId.set(id, { ...upsert.data, uuid: upsert.data.uuid || id, id: upsert.data.id || id })
  }
  return Array.from(byId.values())
}

/**
 * Apply Potree viewer incremental PATCH (upserts / deletes / projectPatch) onto MySQL rows.
 */
export async function applyPointCloudDataPatch(pool, {
  bridgeId,
  bridgeInspectionId = null,
  pointCloudId,
  upserts = [],
  deletes = [],
  projectPatch = null,
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

  const needsImages =
    (Array.isArray(upserts) ? upserts : []).some((u) => u?.type === 'photo') ||
    (Array.isArray(deletes) ? deletes : []).some((d) => d?.type === 'photo')

  const rows = await listPointCloudData(pool, {
    bridgeId: bid,
    pointCloudId: cloudId,
    includeImages: needsImages,
  })
  const project = rowsToPotreeProject(rows) || {
    type: 'Potree',
    version: 1.7,
    measurements: [],
    annotations: [],
    volumes: [],
    profiles: [],
    cameraAnimations: [],
    orientedImages: [],
    geopackages: [],
  }
  let images = needsImages ? rowsToImageAnnotations(rows) : []

  const deleteMeasureIds = new Set(
    (Array.isArray(deletes) ? deletes : [])
      .filter((d) => d?.type === 'measurement')
      .map((d) => String(d.id || '').trim())
      .filter(Boolean)
  )
  const deletePhotoIds = new Set(
    (Array.isArray(deletes) ? deletes : [])
      .filter((d) => d?.type === 'photo')
      .map((d) => String(d.id || '').trim())
      .filter(Boolean)
  )

  if (deletePhotoIds.size) {
    images = images.filter((img) => !deletePhotoIds.has(String(img.id || img.annotation_uuid || '').trim()))
  }

  project.measurements = mergeEntityList(project.measurements, null, deleteMeasureIds)

  for (const upsert of Array.isArray(upserts) ? upserts : []) {
    const type = String(upsert?.type || '').trim()
    if (type === 'measurement') {
      project.measurements = mergeEntityList(project.measurements, upsert, new Set())
    } else if (type === 'photo' && upsert?.data) {
      const id = String(upsert.id || upsert.data.id || upsert.data.annotation_uuid || '').trim()
      if (!id) continue
      const idx = images.findIndex((img) => String(img.id || img.annotation_uuid || '').trim() === id)
      const next = { ...upsert.data, id }
      if (idx >= 0) images[idx] = { ...images[idx], ...next }
      else images.push(next)
    }
  }

  if (projectPatch && typeof projectPatch === 'object') {
    for (const key of [
      'annotations',
      'volumes',
      'profiles',
      'cameraAnimations',
      'orientedImages',
      'geopackages',
      'classification',
      'highlightDistress',
      'settings',
      'view',
    ]) {
      if (Object.prototype.hasOwnProperty.call(projectPatch, key)) {
        project[key] = projectPatch[key]
      }
    }
  }

  return replacePointCloudData(pool, {
    bridgeId: bid,
    bridgeInspectionId,
    pointCloudId: cloudId,
    project,
    imageAnnotations: needsImages ? images : [],
    preserveExistingImages: !needsImages,
  })
}
