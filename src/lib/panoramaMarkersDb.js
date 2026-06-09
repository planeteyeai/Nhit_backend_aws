import path from 'path'

let tablesReady = false

export async function ensurePanoramaMarkerTables(pool) {
  if (tablesReady) return
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bridge_panorama_stations (
      id VARCHAR(32) NOT NULL PRIMARY KEY,
      bridge_id INT NOT NULL,
      uploaded_name VARCHAR(512) NULL,
      display_name VARCHAR(255) NULL,
      panorama_type ENUM('sphere','cube') NOT NULL DEFAULT 'sphere',
      lat DECIMAL(10,7) NULL,
      lng DECIMAL(10,7) NULL,
      plan_x DECIMAL(6,2) NULL,
      plan_y DECIMAL(6,2) NULL,
      uploaded_at DATETIME NULL,
      created_on DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_on DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_bridge_panorama_stations_bridge (bridge_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bridge_panorama_markers (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      station_id VARCHAR(32) NOT NULL,
      bridge_id INT NOT NULL,
      title VARCHAR(255) NULL,
      note TEXT NULL,
      yaw DOUBLE NULL,
      pitch DOUBLE NULL,
      dir_x DOUBLE NULL,
      dir_y DOUBLE NULL,
      dir_z DOUBLE NULL,
      world_pos_x DOUBLE NULL,
      world_pos_y DOUBLE NULL,
      world_pos_z DOUBLE NULL,
      placement_v TINYINT NULL,
      created_by INT NULL,
      created_on DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_on DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_panorama_markers_station (station_id),
      INDEX idx_panorama_markers_bridge (bridge_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bridge_panorama_marker_images (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      marker_id BIGINT UNSIGNED NOT NULL,
      file_path VARCHAR(1024) NOT NULL,
      original_name VARCHAR(512) NULL,
      created_on DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_panorama_marker_images_marker (marker_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
  tablesReady = true
}

function markerImageUrl(filePath) {
  const rel = String(filePath || '').trim().replace(/\\/g, '/')
  if (!rel) return ''
  if (rel.startsWith('/upload/')) return rel
  if (rel.startsWith('upload/')) return `/${rel}`
  return `/upload/${rel.replace(/^\/+/, '')}`
}

function rowToMarker(row, images = []) {
  const marker = {
    id: row.id,
    title: row.title || '',
    note: row.note || '',
    yaw: row.yaw,
    pitch: row.pitch,
    placementV: row.placement_v,
  }
  if (row.dir_x != null && row.dir_y != null && row.dir_z != null) {
    marker.dir = [Number(row.dir_x), Number(row.dir_y), Number(row.dir_z)]
  }
  if (row.world_pos_x != null && row.world_pos_y != null && row.world_pos_z != null) {
    marker.worldPos = [Number(row.world_pos_x), Number(row.world_pos_y), Number(row.world_pos_z)]
  }
  marker.images = images.map((img) => markerImageUrl(img.file_path))
  return marker
}

export async function upsertPanoramaStation(pool, bridgeId, station) {
  if (!pool || !bridgeId || !station?.id) return
  await ensurePanoramaMarkerTables(pool)
  const id = String(station.id).trim()
  await pool.query(
    `INSERT INTO bridge_panorama_stations
      (id, bridge_id, uploaded_name, display_name, panorama_type, lat, lng, plan_x, plan_y, uploaded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      uploaded_name = VALUES(uploaded_name),
      display_name = VALUES(display_name),
      panorama_type = VALUES(panorama_type),
      lat = VALUES(lat),
      lng = VALUES(lng),
      plan_x = VALUES(plan_x),
      plan_y = VALUES(plan_y),
      uploaded_at = VALUES(uploaded_at),
      updated_on = CURRENT_TIMESTAMP`,
    [
      id,
      Number(bridgeId),
      station.uploadedName || station.uploaded_name || null,
      station.displayName || station.label || null,
      station.panorama_type === 'cube' ? 'cube' : 'sphere',
      station.lat ?? station.latitude ?? null,
      station.lng ?? station.longitude ?? null,
      station.planX ?? station.plan_x ?? null,
      station.planY ?? station.plan_y ?? null,
      station.uploadedAt ? new Date(station.uploadedAt) : null,
    ]
  )
}

export async function syncPanoramaStations(pool, bridgeId, stations) {
  if (!pool || !bridgeId || !Array.isArray(stations)) return
  for (const station of stations) {
    if (station?.id) await upsertPanoramaStation(pool, bridgeId, station)
  }
}

async function loadMarkerImages(pool, markerIds) {
  if (!markerIds.length) return new Map()
  const placeholders = markerIds.map(() => '?').join(',')
  const [rows] = await pool.query(
    `SELECT id, marker_id, file_path, original_name FROM bridge_panorama_marker_images
     WHERE marker_id IN (${placeholders}) ORDER BY id ASC`,
    markerIds
  )
  const byMarker = new Map()
  for (const row of rows) {
    const key = String(row.marker_id)
    if (!byMarker.has(key)) byMarker.set(key, [])
    byMarker.get(key).push(row)
  }
  return byMarker
}

export async function loadMarkersGroupedByStation(pool, bridgeId) {
  await ensurePanoramaMarkerTables(pool)
  const [rows] = await pool.query(
    `SELECT * FROM bridge_panorama_markers WHERE bridge_id = ? ORDER BY id ASC`,
    [Number(bridgeId)]
  )
  if (!rows.length) return new Map()
  const imageMap = await loadMarkerImages(
    pool,
    rows.map((r) => r.id)
  )
  const byStation = new Map()
  for (const row of rows) {
    const stationId = String(row.station_id)
    if (!byStation.has(stationId)) byStation.set(stationId, [])
    byStation.get(stationId).push(rowToMarker(row, imageMap.get(String(row.id)) || []))
  }
  return byStation
}

export async function attachMarkersToStations(pool, bridgeId, stations) {
  if (!Array.isArray(stations) || stations.length === 0) return stations
  const grouped = await loadMarkersGroupedByStation(pool, bridgeId)
  return stations.map((station) => {
    const dbMarkers = grouped.get(String(station.id))
    if (!dbMarkers?.length) return station
    return { ...station, markers: dbMarkers }
  })
}

function placementFields(marker) {
  const dir = Array.isArray(marker?.dir) ? marker.dir : null
  const worldPos = Array.isArray(marker?.worldPos) ? marker.worldPos : null
  return {
    yaw: marker?.yaw ?? null,
    pitch: marker?.pitch ?? null,
    dir_x: dir?.[0] ?? null,
    dir_y: dir?.[1] ?? null,
    dir_z: dir?.[2] ?? null,
    world_pos_x: worldPos?.[0] ?? null,
    world_pos_y: worldPos?.[1] ?? null,
    world_pos_z: worldPos?.[2] ?? null,
    placement_v: marker?.placementV ?? marker?.placement_v ?? null,
  }
}

export async function createPanoramaMarker(pool, bridgeId, stationId, marker, createdBy = 0) {
  await ensurePanoramaMarkerTables(pool)
  const placement = placementFields(marker)
  const [result] = await pool.query(
    `INSERT INTO bridge_panorama_markers
      (station_id, bridge_id, title, note, yaw, pitch, dir_x, dir_y, dir_z,
       world_pos_x, world_pos_y, world_pos_z, placement_v, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      String(stationId),
      Number(bridgeId),
      String(marker?.title || '').trim() || null,
      String(marker?.note || '').trim() || null,
      placement.yaw,
      placement.pitch,
      placement.dir_x,
      placement.dir_y,
      placement.dir_z,
      placement.world_pos_x,
      placement.world_pos_y,
      placement.world_pos_z,
      placement.placement_v,
      createdBy || null,
    ]
  )
  const id = result.insertId
  const [rows] = await pool.query(`SELECT * FROM bridge_panorama_markers WHERE id = ? LIMIT 1`, [id])
  return rowToMarker(rows[0], [])
}

export async function updatePanoramaMarker(pool, bridgeId, stationId, markerId, marker) {
  await ensurePanoramaMarkerTables(pool)
  const placement = placementFields(marker)
  const [result] = await pool.query(
    `UPDATE bridge_panorama_markers SET
      title = ?, note = ?, yaw = ?, pitch = ?,
      dir_x = ?, dir_y = ?, dir_z = ?,
      world_pos_x = ?, world_pos_y = ?, world_pos_z = ?,
      placement_v = ?
     WHERE id = ? AND bridge_id = ? AND station_id = ?`,
    [
      String(marker?.title || '').trim() || null,
      String(marker?.note || '').trim() || null,
      placement.yaw,
      placement.pitch,
      placement.dir_x,
      placement.dir_y,
      placement.dir_z,
      placement.world_pos_x,
      placement.world_pos_y,
      placement.world_pos_z,
      placement.placement_v,
      Number(markerId),
      Number(bridgeId),
      String(stationId),
    ]
  )
  if (!result.affectedRows) {
    const err = new Error('Marker not found')
    err.status = 404
    throw err
  }
  const [rows] = await pool.query(
    `SELECT * FROM bridge_panorama_markers WHERE id = ? AND bridge_id = ? AND station_id = ? LIMIT 1`,
    [Number(markerId), Number(bridgeId), String(stationId)]
  )
  const imageMap = await loadMarkerImages(pool, [Number(markerId)])
  return rowToMarker(rows[0], imageMap.get(String(markerId)) || [])
}

export async function deletePanoramaMarker(pool, bridgeId, stationId, markerId) {
  await ensurePanoramaMarkerTables(pool)
  await pool.query(`DELETE FROM bridge_panorama_marker_images WHERE marker_id = ?`, [Number(markerId)])
  const [result] = await pool.query(
    `DELETE FROM bridge_panorama_markers WHERE id = ? AND bridge_id = ? AND station_id = ?`,
    [Number(markerId), Number(bridgeId), String(stationId)]
  )
  if (!result.affectedRows) {
    const err = new Error('Marker not found')
    err.status = 404
    throw err
  }
  return { deleted: Number(markerId) }
}

export async function addPanoramaMarkerImage(pool, markerId, relPath, originalName = '') {
  await ensurePanoramaMarkerTables(pool)
  const normalized = String(relPath || '').replace(/\\/g, '/').replace(/^\/+/, '')
  await pool.query(
    `INSERT INTO bridge_panorama_marker_images (marker_id, file_path, original_name) VALUES (?, ?, ?)`,
    [Number(markerId), normalized, originalName || null]
  )
  const [rows] = await pool.query(
    `SELECT file_path FROM bridge_panorama_marker_images WHERE marker_id = ? ORDER BY id ASC`,
    [Number(markerId)]
  )
  return rows.map((r) => markerImageUrl(r.file_path))
}

export async function deletePanoramaStationRecords(pool, bridgeId, stationId) {
  await ensurePanoramaMarkerTables(pool)
  const [markers] = await pool.query(
    `SELECT id FROM bridge_panorama_markers WHERE bridge_id = ? AND station_id = ?`,
    [Number(bridgeId), String(stationId)]
  )
  for (const row of markers) {
    await pool.query(`DELETE FROM bridge_panorama_marker_images WHERE marker_id = ?`, [row.id])
  }
  await pool.query(`DELETE FROM bridge_panorama_markers WHERE bridge_id = ? AND station_id = ?`, [
    Number(bridgeId),
    String(stationId),
  ])
  await pool.query(`DELETE FROM bridge_panorama_stations WHERE bridge_id = ? AND id = ?`, [
    Number(bridgeId),
    String(stationId),
  ])
}

export function panoramaMarkerImageRelPath(stationId, markerId, filename) {
  return path.posix.join('panaroma_3d', String(stationId), 'markers', String(markerId), filename)
}
