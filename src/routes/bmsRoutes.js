import { Router } from 'express'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import PDFDocument from 'pdfkit'
import ExcelJS from 'exceljs'
import { pool } from '../config/db.js'
import { normalizeAppRole } from '../lib/roles.js'
import { verifyPassword, md5Hex } from '../lib/password.js'
import { signToken, requireAuth, optionalAuth } from '../middleware/auth.js'
import { INSPECTION_DROPDOWNS } from '../config/inspectionDropdowns.js'
import { createWriteStream } from 'fs'
import { createGzip } from 'zlib'
import { STRUCTURAL_RM_OPTIONS, NON_STRUCTURAL_RM_OPTIONS } from '../config/constants/repairOptions.js'
import { RM_MEASUREMENT_MAP } from '../config/constants/measurementMap.js'
import { BOQ_Items } from '../config/constants/boqItemsMeta.js'
import { bearingRatingDesc, componentRatingDesc } from '../config/constants/ratings.js'
import { processPanoramaUpload, listBridgePanoramas, deleteBridgePanorama } from '../lib/panaroma_3d.js'
import { assertValid3dUploadFiles, isValidGlbFile } from '../lib/glbValidate.js'
import {
  glbEnsureStatus,
  runEnsureGlbAssets,
  countValidGlbs,
  ensureSingleModelFile,
} from '../lib/glbEnsure.js'
import {
  computeBridgeLifecycleStage,
  bridgeTrackingStatusHint,
} from '../lib/bridgeLifecycle.js'
import {
  enrichRowsWithUrls,
  getPresignedUrl,
  isStorageEnabled,
  mirrorUploadRelPath,
  mirrorUploadRelPaths,
  mirrorPanoramaUploadResult,
  objectExists,
  pipeBucketObjectToResponse,
  redirectToBucketObject,
  storageStatus,
  toObjectKey,
} from '../lib/storage.js'

const router = Router()
const uploadNone = multer().none()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const uploadRoot = path.resolve(__dirname, '../../upload')

const NON_STRUCTURAL_TABLE_TYPES = new Map([
  ['approaches', 'approaches'],
  ['wearing coat', 'WEARING COAT'],
  ['drainage spouts and vest holes', 'DRAINAGE SPOUTS AND VEST HOLES'],
  ['handrails, parapets, crash barriers', 'HANDRAILS, PARAPETS, CRASH BARRIERS'],
  ['footpaths', 'FOOTPATHS'],
  ['utilities', 'UTILITIES'],
  ['non-structural elements', 'NON-STRUCTURAL ELEMENTS'],
])

function canonicalNonStructuralTableType(value) {
  const key = String(value || '').trim().toLowerCase()
  if (!key) return null
  return NON_STRUCTURAL_TABLE_TYPES.get(key) || null
}

function resolveActorUserId(req) {
  const n = Number(req.user?.uid)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
}

function isFoundationTableType(value) {
  return String(value || '').trim().toLowerCase() === 'foundation'
}

function nonStructuralTableTypeMatches(value) {
  const canonical = canonicalNonStructuralTableType(value)
  if (!canonical) return []
  const key = String(value || '').trim().toLowerCase()
  const legacyByKey = {
    approaches: ['approaches', 'Approaches'],
    'wearing coat': ['WEARING COAT', 'Wearing Coat'],
    'drainage spouts and vest holes': ['DRAINAGE SPOUTS AND VEST HOLES', 'Drainage Spouts And Vest Holes'],
    'handrails, parapets, crash barriers': ['HANDRAILS, PARAPETS, CRASH BARRIERS', 'Handrails Parapets Crash Barriers'],
    footpaths: ['FOOTPATHS', 'Footpaths'],
    utilities: ['UTILITIES', 'Utilities'],
    'non-structural elements': ['NON-STRUCTURAL ELEMENTS'],
  }
  return [...new Set([canonical, ...(legacyByKey[key] || [])])]
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}
function normalizeUploadSubfolder(value, fallback = 'non_structural_elements') {
  const raw = String(value || '').trim().replace(/\\/g, '/')
  const safe = raw
    .split('/')
    .map((x) => x.trim())
    .filter(Boolean)
    .join('/')
  if (!safe) return fallback
  if (!/^[a-zA-Z0-9_/-]+$/.test(safe)) return fallback
  return safe
}
function safeInspectionFolderSegment(value, fallback = 'common') {
  const s = String(value || '').trim()
  if (!s) return fallback
  if (!/^[a-zA-Z0-9_-]+$/.test(s)) return fallback
  return s
}
async function ensureInspection3DAssetsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bridge_inspection_3d_assets (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      bridge_inspection_id INT DEFAULT NULL,
      bridge_id INT NOT NULL,
      asset_type ENUM('glb','panorama','distress_icon') NOT NULL,
      pano_face ENUM('right','left','top','bottom','front','back') DEFAULT NULL,
      title VARCHAR(255) DEFAULT NULL,
      distress_type VARCHAR(255) DEFAULT NULL,
      distress_note TEXT DEFAULT NULL,
      distress_x DECIMAL(12,4) DEFAULT NULL,
      distress_y DECIMAL(12,4) DEFAULT NULL,
      distress_z DECIMAL(12,4) DEFAULT NULL,
      file_name VARCHAR(255) NOT NULL,
      file_path VARCHAR(512) NOT NULL,
      original_name VARCHAR(255) DEFAULT NULL,
      mime_type VARCHAR(128) DEFAULT NULL,
      size_bytes BIGINT UNSIGNED DEFAULT NULL,
      uploaded_by INT DEFAULT NULL,
      created_on DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_bi3da_inspection (bridge_inspection_id),
      KEY idx_bi3da_bridge (bridge_id),
      KEY idx_bi3da_asset_type (asset_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
}
async function getBridgeIdByInspection(inspectionId) {
  const safeId = Number(inspectionId || 0)
  if (!safeId) return null
  try {
    const [rows] = await pool.query('SELECT bridge_id FROM bridge_inspection WHERE id = ? LIMIT 1', [safeId])
    const bridgeId = Number(rows?.[0]?.bridge_id || 0) || null
    if (bridgeId) return bridgeId
  } catch {
    // fallback below
  }
  try {
    const [rows] = await pool.query('SELECT bridge_id FROM bridge_inspection WHERE bridge_inspection_id = ? LIMIT 1', [safeId])
    return Number(rows?.[0]?.bridge_id || 0) || null
  } catch {
    return null
  }
}
ensureDir(uploadRoot)
ensureDir(path.join(uploadRoot, 'download'))

const uploadStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    if (req.path.includes('/signature')) {
      const dir = path.join(uploadRoot, 'sign')
      ensureDir(dir)
      return cb(null, dir)
    }
    if (req.path.includes('/bridge/update_images/')) {
      const dir = path.join(uploadRoot, 'bridge_images', String(req.params.bridgeId || 'common'))
      ensureDir(dir)
      return cb(null, dir)
    }
    if (req.path.includes('/inspection/non_structural/upload_images')) {
      const subfolder = normalizeUploadSubfolder(req.query?.folder, 'non_structural_elements')
      const dir = path.join(uploadRoot, subfolder)
      ensureDir(dir)
      return cb(null, dir)
    }
    if (req.path.includes('/inspection/3d-assets/upload/')) {
      const dir = path.join(uploadRoot, 'inspection_3d_assets', safeInspectionFolderSegment(req.params?.inspectionId))
      ensureDir(dir)
      return cb(null, dir)
    }
    if (req.path.includes('/bridges/') && req.path.includes('/3d-assets/upload')) {
      const baseSegment = safeInspectionFolderSegment(req.body?.inspectionId || req.params?.bridgeId)
      const dir = path.join(uploadRoot, 'inspection_3d_assets', baseSegment)
      ensureDir(dir)
      return cb(null, dir)
    }
    if (req.path.includes('/inspection/draft_report/upload_structure_layout')) {
      const dir = path.join(uploadRoot, 'structure_layout')
      ensureDir(dir)
      return cb(null, dir)
    }
    if (req.path.includes('/inspection/upload_lidar_pdf') || req.path.includes('/inspection/upload_sar_pdf')) {
      const dir = path.join(uploadRoot, 'download')
      ensureDir(dir)
      return cb(null, dir)
    }
    return cb(null, uploadRoot)
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase()
    const safe = String(file.originalname || 'file')
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_.-]/g, '')
    cb(null, `${Date.now()}-${Math.floor(Math.random() * 1e6)}-${safe || `upload${ext}`}`)
  },
})
const upload = multer({ storage: uploadStorage, limits: { fileSize: 10 * 1024 * 1024 } })
/** GLB / large 3D assets (default upload limit is too small for many bridge models). */
const upload3d = multer({ storage: uploadStorage, limits: { fileSize: 150 * 1024 * 1024 } })
const uploadPanoramaMem = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
})

const BRIDGE_COLUMNS = new Set([
  'project_name', 'state_id', 'zone', 'road_type', 'highway_no', 'chainage', 'bridge_no',
  'direction_of_inventory_start', 'direction_of_inventory_end', 'latitude', 'longitude', 'date',
  'consultant_name', 'popular_name_of_bridge', 'custodian', 'engineer_designation', 'contact_details',
  'email_id', 'departmental_chainage', 'departmental_bridge_number', 'bridge_side', 'width_of_bridge',
  'length_of_bridge', 'height_of_bridge', 'total_no_of_span', 'traffic_lane_on_bridge', 'type_of_bridge',
  'age_of_bridge', 'structural_form', 'material_of_construction', 'loading_as_per_irc',
  'hydraluic_tone_weightage', 'pay_load', 'bridge_crossing_feature', 'rating_of_deck_geometry',
  'rating_for_vertical_clearance', 'rating_of_waterway_adequacy', 'rating_of_average_daily_traffic',
  'rating_for_social_importance', 'rating_for_economic_growth_potential', 'rating_alternate_route',
  'rating_environmental_impact', 'structure_data_bridge', 'general_bridge', 'approaches_bridge',
  'protection_works_bridge', 'foundation_bridge', 'substructure_bridge', 'bearing_and_pedistal_bridge',
  'superstructure_bridge', 'expansion_joint_bridge', 'wearing_coat_bridge',
  'handrails_parapets_crash_barriers_bridge', 'bridge_images', 'status', 'bmc_status', 'bmc_user',
  'bmc_status_updated_on', 'is_inspecion_schedule', 'bridge_identity_no', 'design_discharge_in_cumecs',
  'form_filled',
])

const USER_WRITABLE = new Set([
  'username', 'first_name', 'last_name', 'email', 'phone_number', 'address', 'state_id', 'user_role',
  'user_status', 'sign', 'pass',
])

const STEP_TABLE_MAP = {
  structure_data: { table: 'structure_data_bridge', pk: 'structure_data_bridge_id' },
  general_data: { table: 'general_bridge', pk: 'general_id' },
  approaches_data: { table: 'approaches_bridge', pk: 'approaches_bridge_id' },
  protection_works: { table: 'protection_works_bridge', pk: 'protection_works_bridge_id' },
  foundation: { table: 'foundation_bridge', pk: 'foundation_bridge_id' },
  substructure: { table: 'substructure_bridge', pk: 'substructure_bridge_id' },
  bearing_pedestal: { table: 'bearing_and_pedistal_bridge', pk: 'bearing_and_pedistal_bridge_id' },
  superstructure: { table: 'superstructure_bridge', pk: 'superstructure_bridge_id' },
  expansion_joint: { table: 'expansion_joint_bridge', pk: 'expansion_joint_bridge_id' },
  wearing_coat: { table: 'wearing_coat_bridge', pk: 'wearing_coat_bridge_id' },
  handrails: {
    table: 'handrails_parapets_crash_barriers_bridge',
    pk: 'handrails_parapets_crash_barriers_bridge_id',
  },
}

const RATING_DESCRIPTION_DEFAULT = {
  1: { condition: 'Very Good', description: 'No significant distress observed' },
  2: { condition: 'Good', description: 'Minor distress; maintenance may be required' },
  3: { condition: 'Fair', description: 'Moderate distress; planned repair recommended' },
  4: { condition: 'Poor', description: 'Major distress; urgent repair required' },
  5: { condition: 'Critical', description: 'Severe distress; immediate intervention required' },
}

const OVERALL_BRIDGE_RATING_DESCRIPTIONS = {
  1: {
    condition: 'Excellent condition',
    description:
      'No visible distress/deterioration observed. Only constructional deficiencies may be present. Extent of deficiencies is nil or insignificant. Severity of deficiencies is very low.',
  },
  2: {
    condition: 'Good Condition',
    description:
      'Extent of deficiencies is minor. Severity of deficiencies is low. 0 to 5 % of area affected by any of the following: Honeycombing, Delamination, Spalling, minor/medium cracks, exposed reinforcement, 0 to 1 mm visible cracks, 1 to 5% unevenness on concrete superstructure, no section loss of superstructure, unevenness due to wear and tear, no potholes on concrete surface, drainage spouts are functional.',
  },
  3: {
    condition: 'Fair condition',
    description:
      'Extent of deficiencies is major. Severity of deficiencies is medium. 5 to 25 % of area affected by any some of the following: Honeycombing, Delamination, Spalling, medium cracks, exposed reinforcement, 1 to 4 mm visible cracks, 0 to 3 % of section loss of superstructure, unevenness due to wear and tear, potholes on concrete surface, drainage spouts are non-functional.',
  },
  4: {
    condition: 'Poor condition',
    description:
      'Extent of deficiencies is large. Severity of deficiencies is high. 25 to 40 % of area affected by any of the following: Honeycombing, Delamination, Spalling, major cracks, exposed reinforcement, 4 to 6 mm visible cracks and 3 to 5 % of section loss of superstructure, unevenness due to wear and tear, potholes on concrete surface, drainage spouts are non-functional.',
  },
  5: {
    condition: 'Critical condition',
    description:
      'Extent of deficiencies is very large/extensive. Severity of deficiencies is very high. >40% of area affected by some of the following: Honeycombing, Delamination, Spalling, major cracks, exposed reinforcement, >6 mm visible cracks and >5 % of section loss of superstructure, unevenness due to wear and tear, potholes on concrete surface, drainage spouts are non-functional. Bridge closed.',
  },
}

const APPROACHES_RATING_DESCRIPTIONS = {
  1: {
    condition: 'Excellent condition',
    description:
      'No visible distress/ deterioration observed. Only constructional deficiencies may be present. Extent of deficiencies is nil or insignificant. Severity of deficiencies is very low.',
  },
  2: {
    condition: 'Good condition',
    description:
      '0 to 5% of area effect of Honeycombing, Delamination, Spalling, Scaling, corrosion, Efflorescence and Leaching of the total Superstructure. 0 to 1mm visible cracks and 0 to 5% of exposed reinforcement of concrete superstructure. 1 to 5% of unevenness on concrete Superstructure. No Section loss of superstructure',
  },
  3: {
    condition: 'Fair condition',
    description:
      '5 to 25 % of area effect of Honeycombing, Delamination, Spalling, Scaling, corrosion, Efflorescence and Leaching of the total Superstructure. 1 to 4mm visible cracks and 5 to 25 % of exposed reinforcement of concrete superstructure. 5 to 25% of unevenness on concrete Superstructure. 0 to 3 % of Section loss of superstructure.',
  },
  4: {
    condition: 'Poor condition',
    description:
      '25 to 40% of area effect of Honeycombing, Delamination, Spalling, Scaling, corrosion, Efflorescence and Leaching of the total Superstructure. 4 to 6mm visible cracks and 25 to 40 % of exposed reinforcement of concrete superstructure. 25 to 40% of unevenness on concrete Superstructure. 3 to 5 % of Section loss of superstructure.',
  },
  5: {
    condition: 'Critical condition',
    description:
      '> 40% of area effect of Honeycombing, Delamination, Spalling, Scaling, corrosion, Efflorescence and Leaching of the total Superstructure. > 6mm visible cracks and >40 % of exposed reinforcement of concrete superstructure. >40% of unevenness on concrete Superstructure. >5 % of Section loss of superstructure.',
  },
}

const FOUNDATION_RATING_DESCRIPTIONS = {
  1: {
    condition: 'Excellent condition',
    description:
      'Foundation not visible and surrounded by dense soil, and no visibility of soil erosion',
  },
  2: {
    condition: 'Good Condition',
    description:
      'Footing not visible and surrounded by soil, soil erosion is evident.',
  },
  3: {
    condition: 'Fair condition',
    description:
      'Foundation top is visible and erosion is noticeable',
  },
  4: {
    condition: 'Poor condition',
    description:
      'Foundation top and partial Foundation depth is visible due to erosion; Footing bottom/ piles stems are visible',
  },
  5: {
    condition: 'Critical condition',
    description:
      'Complete footing is exposed and piles stems are exposed for a certain length; Bridge Closing is required for immediate R&R of foundation',
  },
}

function toSnakeCase(key) {
  return String(key || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/\s+/g, '_')
    .replace(/-+/g, '_')
    .toLowerCase()
}

function normalizeStepBody(body = {}) {
  // Frontend sends objects like { structureData, bridgeUpdateData }.
  const preferred =
    body.structureData ||
    body.generalData ||
    body.approachData ||
    body.protectionData ||
    body.foundationData ||
    body.substructureData ||
    body.bearingData ||
    body.superstructureData ||
    body.expansionData ||
    body.wearingCoatData ||
    body.handrailsData ||
    body
  const out = {}
  for (const [k, v] of Object.entries(preferred || {})) {
    out[toSnakeCase(k)] = v
  }
  return out
}

/** ENUM('No','Yes') rejects '' — avoids MySQL "Data truncated" on structure_data_bridge. */
function coerceYesNoEnum(v) {
  const s = String(v ?? '')
    .trim()
    .toLowerCase()
  if (s === 'yes') return 'Yes'
  if (s === 'no') return 'No'
  return 'No'
}

const STRUCTURE_HIGH_LEVEL = new Set(['High-Level', 'Submersible', 'Causeway'])

function coerceStructureHighLevelEnum(v) {
  let s = String(v ?? '').trim()
  if (s === 'High Level') s = 'High-Level'
  if (STRUCTURE_HIGH_LEVEL.has(s)) return s
  return 'High-Level'
}

/** Mutates patch in place for known ENUM columns on structure_data_bridge. */
function coerceStructureDataBridgePatch(patch, allowed) {
  if (!patch || typeof patch !== 'object') return
  if (allowed.has('average_skew') && Object.prototype.hasOwnProperty.call(patch, 'average_skew')) {
    patch.average_skew = coerceYesNoEnum(patch.average_skew)
  }
  if (allowed.has('whether_navigable') && Object.prototype.hasOwnProperty.call(patch, 'whether_navigable')) {
    patch.whether_navigable = coerceYesNoEnum(patch.whether_navigable)
  }
  if (
    allowed.has('hign_level_submersible_causeway') &&
    Object.prototype.hasOwnProperty.call(patch, 'hign_level_submersible_causeway')
  ) {
    patch.hign_level_submersible_causeway = coerceStructureHighLevelEnum(patch.hign_level_submersible_causeway)
  }
}

function fallbackValueForDataType(dataType) {
  const t = String(dataType || '').toLowerCase()
  if (['int', 'bigint', 'smallint', 'tinyint', 'mediumint', 'decimal', 'float', 'double'].includes(t)) {
    return 0
  }
  if (['date', 'datetime', 'timestamp'].includes(t)) {
    return new Date()
  }
  return ''
}

function enumValuesFromColumnType(columnType) {
  if (typeof columnType !== 'string') return []
  const m = columnType.match(/enum\((.*)\)/i)
  if (!m) return []
  return m[1].split(',').map((part) => part.trim().replace(/^'+|'+$/g, ''))
}

function ensureEnumValue(metaRow, value, fallback = '') {
  if (!metaRow || String(metaRow.DATA_TYPE || '').toLowerCase() !== 'enum') {
    return value ?? fallback
  }
  const allowed = enumValuesFromColumnType(metaRow.COLUMN_TYPE)
  if (!allowed.length) return value ?? fallback
  const v = String(value ?? '').trim()
  if (v && allowed.includes(v)) return v
  return allowed[0] || fallback
}

function stripPassword(row) {
  if (!row) return row
  const { pass, password, ...rest } = row
  return rest
}

function normalizeBridgePayload(body = {}) {
  const b = body || {}
  const out = {
    project_name: b.project_name ?? b.projectName ?? '',
    state_id: b.state_id ?? b.state ?? null,
    zone: b.zone ?? '',
    road_type: b.road_type ?? b.roadType ?? '',
    highway_no: b.highway_no ?? b.roadHighwayNo ?? '',
    chainage: b.chainage ?? '',
    bridge_no: b.bridge_no ?? b.bridgeNo ?? '',
    bridge_identity_no: b.bridge_identity_no ?? b.bridgeIdentityNo ?? '',
    status: b.status ?? 'Pending',
    bmc_status: b.bmc_status ?? b.bmcStatus ?? null,
  }

  // PHP parity (C:\xampp\htdocs\bms\application\controllers\Bridge.php):
  // bridge_identity_no = state_id + '-' + zone + '-' + road_type + '-' + highway_no + '-' + chainage
  if (!out.bridge_identity_no) {
    const stateId = out.state_id != null ? String(out.state_id).trim() : ''
    const zone = String(out.zone || '').trim()
    const roadType = String(out.road_type || '').trim()
    const highwayNo = String(out.highway_no || '').trim()
    const chainage = String(out.chainage || '').trim()
    if (stateId && zone && roadType && highwayNo && chainage) {
      out.bridge_identity_no = `${stateId}-${zone}-${roadType}-${highwayNo}-${chainage}`
    }
  }

  return out
}

function inspectionWhereClause(mode) {
  switch (mode) {
    case 'scheduled':
      return `i.status = 'Pending'`
    case 'ongoing':
      return `i.status = 'Confirmed'`
    case 'approved':
      return `i.status = 'Approved' AND i.bmc_inspection_status = 'Approved'`
    case 'rejected':
      return `i.bmc_inspection_status = 'Rejected'`
    case 'pending_approval':
      return `(i.status IN ('Pending','Confirmed')) AND (i.bmc_inspection_status IS NULL OR TRIM(i.bmc_inspection_status) = '' OR i.bmc_inspection_status = 'No')`
    default:
      return '1=1'
  }
}

async function handleLogin(req, res) {
  const username = (req.body?.username || '').trim()
  const password = (req.body?.password || '').trim()
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' })
  }
  const [rows] = await pool.query(
    `SELECT uid, username, pass, first_name, last_name, user_role, user_status FROM users
     WHERE LOWER(TRIM(username)) = LOWER(?) AND user_status = 'Active' LIMIT 1`,
    [username]
  )
  const user = rows[0]
  if (!user || !verifyPassword(user.pass, password)) {
    return res.status(401).json({ message: 'Username or Password is incorrect!' })
  }
  const role = normalizeAppRole(user.user_role)
  const token = signToken({ uid: user.uid, username: user.username, role })
  return res.json({
    token,
    userid: user.uid,
    uid: user.uid,
    username: user.username,
    userrole: role,
    user_role: role,
    first_name: user.first_name || '',
    last_name: user.last_name || '',
  })
}

router.post('/login', optionalAuth, async (req, res) => {
  try {
    await handleLogin(req, res)
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Login failed' })
  }
})

router.post('/login_con/check_login', uploadNone, optionalAuth, async (req, res) => {
  try {
    req.body = { ...req.body, username: req.body.username, password: req.body.password }
    await handleLogin(req, res)
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Login failed' })
  }
})

router.post('/logout', (_req, res) => {
  res.json({ success: true })
})

router.post('/login_con/change_password', requireAuth, async (req, res) => {
  try {
    const { old_pwd: oldPwd, new_pwd: newPwd, confirm_pwd: confirmPwd } = req.body || {}
    if (!oldPwd || !newPwd || newPwd !== confirmPwd) {
      return res.status(400).json({ message: 'Invalid password fields' })
    }
    const uid = req.user.uid
    const [rows] = await pool.query('SELECT pass FROM users WHERE uid = ? LIMIT 1', [uid])
    const u = rows[0]
    if (!u || !verifyPassword(u.pass, oldPwd)) {
      return res.status(400).json({ message: 'Old password is incorrect!' })
    }
    await pool.query('UPDATE users SET pass = ? WHERE uid = ?', [md5Hex(newPwd), uid])
    res.json({ success: true, message: 'Password changed successfully' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Could not change password' })
  }
})

router.get('/states', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT state_id, state_name, state_code FROM state ORDER BY state_name')
    res.json(rows)
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: e.message })
  }
})

router.get('/users', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10))
    const offset = (page - 1) * limit
    const search = (req.query.search || '').trim()
    const status = (req.query.status || '').trim()
    const params = []
    let where = '1=1'
    if (status) {
      where += ' AND user_status = ?'
      params.push(status)
    }
    if (search) {
      where +=
        ' AND (username LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR phone_number LIKE ?)'
      const q = `%${search}%`
      params.push(q, q, q, q, q)
    }
    const [countRows] = await pool.query(`SELECT COUNT(*) AS c FROM users WHERE ${where}`, params)
    const total = countRows[0].c
    const [rows] = await pool.query(
      `SELECT uid, username, first_name, last_name, email, phone_number, address, state_id, user_role, user_status, sign
       FROM users WHERE ${where} ORDER BY uid ASC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    )
    res.json({
      data: rows.map(stripPassword),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: e.message })
  }
})

router.get('/users/:userId', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT uid, username, first_name, last_name, email, phone_number, address, state_id, user_role, user_status, sign
       FROM users WHERE uid = ? LIMIT 1`,
      [req.params.userId]
    )
    if (!rows[0]) return res.status(404).json({ message: 'User not found' })
    res.json(stripPassword(rows[0]))
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: e.message })
  }
})

router.post('/users', requireAuth, async (req, res) => {
  try {
    const b = req.body || {}
    if (!b.username || !b.pass && !b.password) {
      return res.status(400).json({ message: 'username and password required' })
    }
    const plain = b.pass || b.password
    const [r] = await pool.query(
      `INSERT INTO users (username, pass, first_name, last_name, email, phone_number, address, state_id, user_role, user_status)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        b.username.trim(),
        md5Hex(plain),
        b.first_name || b.firstName || '',
        b.last_name || b.lastName || '',
        b.email || '',
        b.phone_number || b.phoneNumber || '',
        b.address || '',
        b.state_id || null,
        b.user_role || 'Admin',
        b.user_status || b.status || 'Active',
      ]
    )
    res.status(201).json({ uid: r.insertId, id: r.insertId })
  } catch (e) {
    console.error(e)
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Username already exists' })
    res.status(500).json({ message: e.message })
  }
})

router.put('/users/:userId', requireAuth, async (req, res) => {
  try {
    const id = req.params.userId
    const b = req.body || {}
    const fields = []
    const vals = []
    const map = {
      username: b.username,
      first_name: b.first_name ?? b.firstName,
      last_name: b.last_name ?? b.lastName,
      email: b.email,
      phone_number: b.phone_number ?? b.phoneNumber,
      address: b.address,
      state_id: b.state_id,
      user_role: b.user_role,
      user_status: b.user_status ?? b.status,
      sign: b.sign,
    }
    for (const [k, v] of Object.entries(map)) {
      if (v !== undefined && USER_WRITABLE.has(k)) {
        fields.push(`${k} = ?`)
        vals.push(v)
      }
    }
    if (b.pass || b.password) {
      fields.push('pass = ?')
      vals.push(md5Hex(b.pass || b.password))
    }
    if (!fields.length) return res.json({ success: true })
    vals.push(id)
    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE uid = ?`, vals)
    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: e.message })
  }
})

router.delete('/users/:userId', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE uid = ?', [req.params.userId])
    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: e.message })
  }
})

router.post('/users/:userId/signature', requireAuth, upload.single('sign'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No signature file uploaded' })
    await pool.query('UPDATE users SET sign = ? WHERE uid = ?', [req.file.filename, req.params.userId])
    res.json({ success: true, filename: req.file.filename })
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

router.get('/users/:userId/signature/download', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT sign FROM users WHERE uid = ? LIMIT 1', [req.params.userId])
    const file = rows[0]?.sign
    if (!file) return res.status(404).json({ message: 'No signature file' })
    const filePath = path.join(uploadRoot, 'sign', file)
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'File not found' })
    res.download(filePath)
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

let _inspectionIdColCache = null
async function getInspectionIdColumn() {
  if (_inspectionIdColCache) return _inspectionIdColCache
  const [iIdRows] = await pool.query(`SHOW COLUMNS FROM bridge_inspection LIKE 'bridge_inspection_id'`)
  _inspectionIdColCache = iIdRows.length ? 'bridge_inspection_id' : 'inspection_id'
  return _inspectionIdColCache
}

function bridgeTrackingJoinsSql(inspectionIdCol) {
  const idCol = inspectionIdCol
  return `
    LEFT JOIN (
      SELECT i1.*
      FROM bridge_inspection i1
      INNER JOIN (
        SELECT
          bridge_id,
          CAST(
            SUBSTRING_INDEX(
              GROUP_CONCAT(
                CAST(\`${idCol}\` AS CHAR)
                ORDER BY
                  CASE
                    WHEN status = 'Approved' THEN 4
                    WHEN status = 'Confirmed' THEN 3
                    WHEN status = 'Pending' THEN 2
                    WHEN status = 'Closed' THEN 1
                    ELSE 0
                  END DESC,
                  \`${idCol}\` DESC
              ),
              ',',
              1
            ) AS UNSIGNED
          ) AS pick_id
        FROM bridge_inspection
        GROUP BY bridge_id
      ) pick ON pick.bridge_id = i1.bridge_id AND pick.pick_id = i1.\`${idCol}\`
    ) li ON li.bridge_id = b.bridge_id
    LEFT JOIN (
      SELECT si1.*
      FROM schedule_inspecion si1
      INNER JOIN (
        SELECT bridge_id, MAX(si_id) AS mx_si
        FROM schedule_inspecion
        GROUP BY bridge_id
      ) zr ON zr.bridge_id = si1.bridge_id AND zr.mx_si = si1.si_id
    ) sreg ON sreg.bridge_id = b.bridge_id
    LEFT JOIN (
      SELECT a1.*
      FROM schedule_adhoc_inspecion a1
      INNER JOIN (
        SELECT bridge_id, MAX(adhoc_inspecion_id) AS mx_ad
        FROM schedule_adhoc_inspecion
        GROUP BY bridge_id
      ) za ON za.bridge_id = a1.bridge_id AND za.mx_ad = a1.adhoc_inspecion_id
    ) sadh ON sadh.bridge_id = b.bridge_id`
}

function latestBridgeRejectionJoinSql() {
  return `
    LEFT JOIN (
      SELECT rc1.*
      FROM bridge_rejection_comment rc1
      INNER JOIN (
        SELECT bridge_id, MAX(rejection_id) AS mx_rejection_id
        FROM bridge_rejection_comment
        GROUP BY bridge_id
      ) rmx ON rmx.bridge_id = rc1.bridge_id AND rmx.mx_rejection_id = rc1.rejection_id
    ) brc ON brc.bridge_id = b.bridge_id`
}

function bridgeTrackingSelectSql(inspectionIdCol) {
  const idCol = inspectionIdCol
  return `
    li.\`${idCol}\` AS latest_bridge_inspection_id,
    li.status AS latest_inspection_status,
    li.bmc_inspection_status AS latest_bmc_inspection_status,
    sreg.si_id AS schedule_regular_si_id,
    sreg.status AS schedule_regular_status,
    sreg.updated_on AS schedule_regular_at,
    sadh.adhoc_inspecion_id AS schedule_adhoc_id,
    sadh.status AS schedule_adhoc_status,
    sadh.updated_on AS schedule_adhoc_at,
    li.boq_conclusion_report AS latest_boq_conclusion_report,
    li.boq_structure_layout_images AS latest_boq_structure_layout_images`
}

function enrichBridgeTrackingRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const lifecycle_stage = computeBridgeLifecycleStage(row)
    return {
      ...row,
      lifecycle_stage,
      tracking_status_hint: bridgeTrackingStatusHint(row),
    }
  })
}

router.get('/bridge-list', async (req, res) => {
  try {
    const inspectionIdCol = await getInspectionIdColumn()
    const page = Math.max(1, parseInt(req.query.page, 10) || 1)
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 10))
    const offset = (page - 1) * limit
    const params = []
    let where = '1=1'
    if (req.query.status) {
      where += ' AND b.status = ?'
      params.push(req.query.status)
    }
    if (req.query.bmc_status) {
      where += ' AND b.bmc_status = ?'
      params.push(req.query.bmc_status)
    }
    if (req.query.project_name) {
      where += ' AND b.project_name = ?'
      params.push(req.query.project_name)
    }
    if (req.query.structure_type) {
      where += ' AND b.type_of_bridge = ?'
      params.push(req.query.structure_type)
    }
    if (req.query.highway_no) {
      where += ' AND b.highway_no = ?'
      params.push(req.query.highway_no)
    }
    if (req.query.search) {
      const q = `%${req.query.search.trim()}%`
      where +=
        ' AND (b.bridge_identity_no LIKE ? OR b.project_name LIKE ? OR b.bridge_no LIKE ? OR b.chainage LIKE ? OR b.highway_no LIKE ?)'
      params.push(q, q, q, q, q)
    }
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS c FROM bridge b WHERE ${where}`,
      params
    )
    const total = countRows[0].c
    const [rows] = await pool.query(
      `SELECT b.*, s.state_name, s.state_code,
              brc.comment AS rejection_comment, brc.comment_on AS rejection_date,
              ${bridgeTrackingSelectSql(inspectionIdCol)}
       FROM bridge b
       LEFT JOIN state s ON s.state_id = b.state_id
       ${latestBridgeRejectionJoinSql()}
       ${bridgeTrackingJoinsSql(inspectionIdCol)}
       WHERE ${where}
       ORDER BY b.bridge_id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    )
    res.json({
      data: enrichBridgeTrackingRows(rows),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: e.message })
  }
})

router.get('/bridges/:bridgeId', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT b.*, s.state_name, s.state_code,
              COALESCE(zc.zone_name, zi.zone_name, NULLIF(TRIM(b.zone), '')) AS zone_name
       FROM bridge b
       LEFT JOIN state s ON s.state_id = b.state_id
       LEFT JOIN zone zc ON zc.zone_code = TRIM(b.zone)
       LEFT JOIN zone zi ON zi.zone_id = b.zone
       WHERE b.bridge_id = ? LIMIT 1`,
      [req.params.bridgeId]
    )
    if (!rows[0]) return res.status(404).json({ message: 'Bridge not found' })
    res.json(rows[0])
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: e.message })
  }
})

async function ensureSpanArrangementSchema() {
  try {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS sapn_arrangment (
        sp_id INT NOT NULL AUTO_INCREMENT,
        bridge_id INT NOT NULL,
        span_material VARCHAR(250) NOT NULL,
        span_type VARCHAR(256) NOT NULL,
        span_length FLOAT(10,4) NOT NULL,
        created_by INT NOT NULL DEFAULT 0,
        created_on DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_by INT NULL,
        updated_on DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (sp_id),
        KEY idx_sapn_arrangment_bridge_id (bridge_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`
    )
  } catch (_) {
    // If CREATE TABLE has compatibility issues on legacy DB, proceed with ALTER attempts below.
  }

  try { await pool.query('ALTER TABLE sapn_arrangment MODIFY sp_id INT NOT NULL AUTO_INCREMENT') } catch (_) {}
  try { await pool.query('ALTER TABLE sapn_arrangment ADD PRIMARY KEY (sp_id)') } catch (_) {}
  try { await pool.query('ALTER TABLE sapn_arrangment ADD INDEX idx_sapn_arrangment_bridge_id (bridge_id)') } catch (_) {}
  try { await pool.query('ALTER TABLE sapn_arrangment ADD COLUMN updated_by INT NULL') } catch (_) {}
  try { await pool.query('ALTER TABLE sapn_arrangment ADD COLUMN updated_on DATETIME NULL ON UPDATE CURRENT_TIMESTAMP') } catch (_) {}
}

router.get('/bridges/:bridgeId/span-arrangement', async (req, res) => {
  try {
    await ensureSpanArrangementSchema()
    const bridgeId = Number(req.params.bridgeId)
    if (!Number.isInteger(bridgeId) || bridgeId <= 0) {
      return res.status(400).json({ message: 'Invalid bridgeId' })
    }

    const [rows] = await pool.query(
      `SELECT sp_id, bridge_id, span_material, span_type, span_length
       FROM sapn_arrangment
       WHERE bridge_id = ?
       ORDER BY sp_id ASC`,
      [bridgeId]
    )
    res.json(rows)
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: e.message })
  }
})

router.put('/bridges/:bridgeId/span-arrangement', optionalAuth, async (req, res) => {
  try {
    await ensureSpanArrangementSchema()
    const bridgeId = Number(req.params.bridgeId)
    if (!Number.isInteger(bridgeId) || bridgeId <= 0) {
      return res.status(400).json({ message: 'Invalid bridgeId' })
    }

    const spans = Array.isArray(req.body?.spans) ? req.body.spans : []
    const userId = Number(req.user?.uid || 0)

    await pool.query('DELETE FROM sapn_arrangment WHERE bridge_id = ?', [bridgeId])

    for (const s of spans) {
      const material = String(s?.material || '').trim()
      const type = String(s?.type || '').trim()
      const lengthNum = Number(s?.length)
      if (!material || !type || !Number.isFinite(lengthNum) || lengthNum <= 0) continue

      await pool.query(
        `INSERT INTO sapn_arrangment
         (bridge_id, span_material, span_type, span_length, created_by, created_on, updated_by)
         VALUES (?, ?, ?, ?, ?, NOW(), ?)`,
        [bridgeId, material, type, lengthNum, userId, userId]
      )
    }

    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: e.message })
  }
})

// Legacy compatibility endpoints
router.get('/bridge/span_arrangment/:bridgeId', async (req, res) => {
  try {
    await ensureSpanArrangementSchema()
    const bridgeId = Number(req.params.bridgeId)
    if (!Number.isInteger(bridgeId) || bridgeId <= 0) {
      return res.status(400).json({ message: 'Invalid bridgeId' })
    }
    const [rows] = await pool.query(
      `SELECT sp_id, bridge_id, span_material, span_type, span_length
       FROM sapn_arrangment
       WHERE bridge_id = ?
       ORDER BY sp_id ASC`,
      [bridgeId]
    )
    res.json(rows)
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: e.message })
  }
})

router.post('/bridge/span_arrangment/:bridgeId', optionalAuth, async (req, res) => {
  try {
    await ensureSpanArrangementSchema()
    const bridgeId = Number(req.params.bridgeId)
    if (!Number.isInteger(bridgeId) || bridgeId <= 0) {
      return res.status(400).json({ message: 'Invalid bridgeId' })
    }

    const spans = Array.isArray(req.body?.spans) ? req.body.spans : []
    const userId = Number(req.user?.uid || 0)

    await pool.query('DELETE FROM sapn_arrangment WHERE bridge_id = ?', [bridgeId])
    for (const s of spans) {
      const material = String(s?.material || '').trim()
      const type = String(s?.type || '').trim()
      const lengthNum = Number(s?.length)
      if (!material || !type || !Number.isFinite(lengthNum) || lengthNum <= 0) continue
      await pool.query(
        `INSERT INTO sapn_arrangment
         (bridge_id, span_material, span_type, span_length, created_by, created_on, updated_by)
         VALUES (?, ?, ?, ?, ?, NOW(), ?)`,
        [bridgeId, material, type, lengthNum, userId, userId]
      )
    }
    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: e.message })
  }
})

router.post('/bridges', optionalAuth, async (req, res) => {
  try {
    const b = normalizeBridgePayload(req.body || {})
    const [tplRows] = await pool.query('SELECT * FROM bridge ORDER BY bridge_id ASC LIMIT 1')
    const tpl = tplRows[0] || {}
    delete tpl.bridge_id
    const normalized = {
      ...tpl,
      ...b,
      bridge_images: tpl.bridge_images ?? '',
      status: b.status || 'Pending',
      bmc_status: b.bmc_status || 'No',
      bmc_user: Number(tpl.bmc_user || req.user?.uid || 0),
      is_inspecion_schedule: tpl.is_inspecion_schedule || 'No',
      created_by: Number(req.user?.uid || tpl.created_by || 0),
      updated_by: Number(req.user?.uid || tpl.updated_by || 0),
      created_on: new Date(),
      updated_on: new Date(),
    }
    const [metaRows] = await pool.query(
      `SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT, DATA_TYPE
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bridge'`
    )
    for (const c of metaRows) {
      const key = c.COLUMN_NAME
      if (key === 'bridge_id') continue
      if (normalized[key] !== undefined && normalized[key] !== null) continue
      const nullable = c.IS_NULLABLE === 'YES'
      const hasDefault = c.COLUMN_DEFAULT !== null
      if (!nullable && !hasDefault) {
        normalized[key] = fallbackValueForDataType(c.DATA_TYPE)
      }
    }
    // Extra guards for strict legacy schema columns.
    normalized.date = new Date().toISOString().slice(0, 19).replace('T', ' ')
    if (!normalized.direction_of_inventory_start) normalized.direction_of_inventory_start = ''
    if (!normalized.direction_of_inventory_end) normalized.direction_of_inventory_end = ''
    if (!normalized.latitude) normalized.latitude = ''
    if (!normalized.longitude) normalized.longitude = ''
    if (!normalized.consultant_name) normalized.consultant_name = ''
    if (!normalized.popular_name_of_bridge) normalized.popular_name_of_bridge = ''
    if (!normalized.custodian) normalized.custodian = ''
    if (!normalized.engineer_designation) normalized.engineer_designation = ''
    if (!normalized.contact_details) normalized.contact_details = ''
    if (!normalized.email_id) normalized.email_id = ''
    const use = Object.keys(normalized).filter((k) => normalized[k] !== undefined)
    const placeholders = use.map(() => '?').join(', ')
    const [r] = await pool.query(
      `INSERT INTO bridge (${use.join(', ')}) VALUES (${placeholders})`,
      use.map((c) => normalized[c])
    )
    res.status(201).json({ bridge_id: r.insertId })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: e.message })
  }
})

router.put('/bridges/:bridgeId', optionalAuth, async (req, res) => {
  try {
    const raw = req.body || {}
    const b = { ...raw }
    // Map known camelCase aliases only when explicitly present in request.
    if (raw.projectName !== undefined) b.project_name = raw.projectName
    if (raw.state !== undefined) b.state_id = raw.state
    if (raw.roadType !== undefined) b.road_type = raw.roadType
    if (raw.roadHighwayNo !== undefined) b.highway_no = raw.roadHighwayNo
    if (raw.bridgeNo !== undefined) b.bridge_no = raw.bridgeNo
    if (raw.bridgeIdentityNo !== undefined) b.bridge_identity_no = raw.bridgeIdentityNo
    // Legacy schema: `bmc_status` is NOT NULL in DB. Some frontend updates send it as null.
    // Only coerce when it is explicitly present in request.
    if (Object.prototype.hasOwnProperty.call(b, 'bmc_status') && (b.bmc_status === null || b.bmc_status === '')) {
      b.bmc_status = 'No'
    }
    if (Object.prototype.hasOwnProperty.call(b, 'bmcStatus') && (b.bmcStatus === null || b.bmcStatus === '')) {
      b.bmc_status = 'No'
      delete b.bmcStatus
    }
    const fields = []
    const vals = []
    for (const k of Object.keys(b)) {
      if (BRIDGE_COLUMNS.has(k)) {
        fields.push(`${k} = ?`)
        vals.push(b[k])
      }
    }
    if (!fields.length) return res.json({ success: true })
    vals.push(req.params.bridgeId)
    await pool.query(`UPDATE bridge SET ${fields.join(', ')}, updated_on = NOW() WHERE bridge_id = ?`, vals)
    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: e.message })
  }
})

router.delete('/bridges/:bridgeId', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM bridge WHERE bridge_id = ?', [req.params.bridgeId])
    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: e.message })
  }
})

router.post('/bridges/:bridgeId/approve', requireAuth, async (req, res) => {
  try {
    await pool.query(
      `UPDATE bridge SET bmc_status = 'Approved', bmc_status_updated_on = NOW() WHERE bridge_id = ?`,
      [req.params.bridgeId]
    )
    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: e.message })
  }
})

router.post('/bridges/:bridgeId/reject', requireAuth, async (req, res) => {
  try {
    const bridgeId = req.params.bridgeId
    const comment = String(req.body?.comment || '').trim()
    await pool.query(
      `UPDATE bridge
       SET status = 'Pending', bmc_status = 'Rejected', bmc_status_updated_on = NOW()
       WHERE bridge_id = ?`,
      [bridgeId]
    )
    if (comment) {
      try {
        // Ensure table has AUTO_INCREMENT on rejection_id before INSERT
        await pool.query(
          `ALTER TABLE bridge_rejection_comment MODIFY rejection_id INT NOT NULL AUTO_INCREMENT`
        )
      } catch (_) { /* ignore if already set */ }
      try {
        await pool.query(
          `INSERT INTO bridge_rejection_comment (bridge_id, comment, comment_by, comment_on) VALUES (?, ?, ?, CURDATE())`,
          [bridgeId, comment, req.user?.uid || 0]
        )
      } catch (insertErr) {
        console.error('Could not save rejection comment:', insertErr.message)
      }
    }
    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: e.message })
  }
})

for (const path of ['location', 'administration', 'geometric', 'classification', 'functional-rating', 'socio-economic-rating', 'structure-data', 'general-data', 'approaches-data']) {
  router.put(`/bridges/:bridgeId/${path}`, optionalAuth, async (req, res) => {
    try {
      await pool.query('UPDATE bridge SET updated_on = NOW() WHERE bridge_id = ?', [req.params.bridgeId])
      res.json({ success: true, note: 'Partial update; map fields in bridge table via full PUT /bridges/:id if needed.' })
    } catch (e) {
      res.status(500).json({ message: e.message })
    }
  })
}

router.get('/bridge/get_states', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT state_id, state_name, state_code FROM state ORDER BY state_name')
    res.json(rows)
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

// Same pattern as get_states: return actual table columns (no aliases).
router.get('/bridge/get_material_of_construction', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT moc_id, material_of_construction_code, material_of_construction_description
       FROM material_of_construction
       ORDER BY moc_id`
    )
    res.json(rows)
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

router.get('/bridge/get_projects', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT DISTINCT project_name FROM bridge WHERE project_name IS NOT NULL AND TRIM(project_name) <> "" ORDER BY project_name'
    )
    res.json(rows.map((r) => r.project_name))
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

router.get('/bridge/get_zones', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT zone_id, zone_code, zone_name FROM zone ORDER BY zone_code')
    res.json(rows)
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

router.get('/bridge/get_bridge_sides', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT bridge_sides FROM bridge_side ORDER BY bridge_sides')
    res.json(rows.map((r) => r.bridge_sides).filter(Boolean))
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

router.get('/bridge/get_traffic_lanes', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT traffic_lane_code, traffic_lane_desc FROM traffic_lane_on_bridge ORDER BY traffic_lane_code'
    )
    res.json(rows)
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

router.get('/bridge/options/:key', async (req, res) => {
  try {
    const key = String(req.params.key || '').trim()
    // Same rows as GET /bridge/get_material_of_construction (real column names, like state table).
    if (key === 'material_of_construction') {
      const [rows] = await pool.query(
        `SELECT moc_id, material_of_construction_code, material_of_construction_description
         FROM material_of_construction
         ORDER BY moc_id`
      )
      return res.json(rows)
    }
    const map = {
      type_of_bridge: { table: 'type_of_bridge', code: 'type_of_bridge_code', label: 'type_of_bridge' },
      age_of_bridge: { table: 'age_of_bridge', code: 'age_code', label: 'age_when_inspection_done_first' },
      structural_form: { table: 'structural_form', code: 'structural_form_code', label: 'structural_form_description' },
      loading_icr: { table: 'loading_icr', code: 'loading_code', label: 'allowed_loading' },
      hydraluic_tone_weightage: { table: 'hydraluic_tone_weightage', code: 'hydraluic_tone_code', label: 'hydraluic_tone_rating' },
      structural_crossing_feature: {
        table: 'structural_crossing_feature',
        code: 'structural_crossing_feature_code',
        label: 'structural_crossing_feature_description',
      },
      rating_of_deck_geometry: {
        table: 'rating_of_deck_geometry',
        code: 'geometry_rating_code',
        label: 'geometry_rating',
      },
      rating_for_vertical_clearance: {
        table: 'rating_for_vertical_clearance',
        // Store rating code (not row id) in bridge.rating_for_vertical_clearance
        code: 'vertical_clearance_rating_code',
        label: 'vertical_clearance_rating',
      },
      rating_of_waterway_adequacy: {
        table: 'rating_of_waterway_adequacy',
        code: 'waterway_rating_code',
        label: 'waterway_rating',
      },
      rating_of_average_daily_traffic: {
        table: 'rating_of_average_daily_traffic',
        code: 'traffic_rating_code',
        label: 'traffic_rating',
      },
      rating_for_social_importance: {
        table: 'rating_for_social_importance',
        code: 'social_importance_code',
        label: 'social_importance_rating',
      },
      rating_for_economic_growth_potential: {
        table: 'rating_for_economic_growth_potential',
        code: 'economic_growth_potential_code',
        label: 'economic_growth_potential_rating',
      },
      rating_alternate_route: {
        table: 'rating_alternate_route',
        code: 'route_rating_code',
        label: 'route_rating',
      },
      rating_environmental_impact: {
        table: 'rating_environmental_impact',
        code: 'environmental_impact_rating_code',
        label: 'environmental_impact_rating',
      },
    }
    const cfg = map[key]
    if (!cfg) return res.status(400).json({ message: 'Invalid options key' })
    const orderBy = cfg.orderBy || cfg.code
    const sql = cfg.idColumn
      ? `SELECT \`${cfg.idColumn}\` AS id, \`${cfg.code}\` AS code, \`${cfg.label}\` AS label FROM \`${cfg.table}\` ORDER BY \`${orderBy}\``
      : `SELECT \`${cfg.code}\` AS code, \`${cfg.label}\` AS label FROM \`${cfg.table}\` ORDER BY \`${orderBy}\``
    const [rows] = await pool.query(sql)
    res.json(rows)
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

router.post('/bridge/get_zones_by_state', async (req, res) => {
  try {
    const code = (req.body?.state_code || '').toString().trim()
    if (!code) return res.status(400).json({ message: 'state_code required' })
    const [rows] = await pool.query(
      'SELECT zone_id, zone_code, zone_name FROM zone WHERE zone_code LIKE ? ORDER BY zone_code',
      [`${code}%`]
    )
    res.json(rows)
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

router.get('/bridge/get_zones_by_state', async (req, res) => {
  try {
    const code = (req.query.state_code || '').toString().trim()
    if (!code) return res.status(400).json({ message: 'state_code required' })
    const [rows] = await pool.query(
      'SELECT zone_id, zone_code, zone_name FROM zone WHERE zone_code LIKE ? ORDER BY zone_code',
      [`${code}%`]
    )
    res.json(rows)
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

router.get('/bmc/bridge/index/:status', async (req, res) => {
  try {
    const s = (req.params.status || '').toLowerCase()
    let where = '1=1'
    if (s === 'pending') {
      // Pending approval should include only submitted entries awaiting BMC action.
      where = `b.status = 'Completed' AND (b.bmc_status IS NULL OR TRIM(b.bmc_status) = '' OR b.bmc_status = 'No')`
    } else if (s === 'approved') {
      where = `b.bmc_status = 'Approved'`
    } else if (s === 'rejected') {
      where = `b.bmc_status = 'Rejected'`
    }
    const [rows] = await pool.query(
      `SELECT b.*, s.state_name, s.state_code,
              brc.comment AS rejection_comment, brc.comment_on AS rejection_date,
              sreg.si_id AS schedule_regular_si_id,
              sreg.status AS schedule_regular_status,
              sreg.updated_on AS schedule_regular_at,
              sadh.adhoc_inspecion_id AS schedule_adhoc_id,
              sadh.status AS schedule_adhoc_status,
              sadh.updated_on AS schedule_adhoc_at
       FROM bridge b
       LEFT JOIN state s ON s.state_id = b.state_id
       ${latestBridgeRejectionJoinSql()}
       LEFT JOIN (
         SELECT si1.*
         FROM schedule_inspecion si1
         INNER JOIN (
           SELECT bridge_id, MAX(si_id) AS mx_si
           FROM schedule_inspecion
           GROUP BY bridge_id
         ) zr ON zr.bridge_id = si1.bridge_id AND zr.mx_si = si1.si_id
       ) sreg ON sreg.bridge_id = b.bridge_id
       LEFT JOIN (
         SELECT a1.*
         FROM schedule_adhoc_inspecion a1
         INNER JOIN (
           SELECT bridge_id, MAX(adhoc_inspecion_id) AS mx_ad
           FROM schedule_adhoc_inspecion
           GROUP BY bridge_id
         ) za ON za.bridge_id = a1.bridge_id AND za.mx_ad = a1.adhoc_inspecion_id
       ) sadh ON sadh.bridge_id = b.bridge_id
       WHERE ${where}
       ORDER BY b.bridge_id DESC LIMIT 500`
    )
    res.json(rows)
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

async function inspectionList(req, res, mode) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1)
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 10))
    const offset = (page - 1) * limit
    const w = inspectionWhereClause(mode)
    const params = []
    let where = w
    // Live DBs differ: some use bridge_inspection_id, older ones use inspection_id.
    // Resolve join columns at runtime so ongoing/approved/rejected lists do not fail.
    const [iIdRows] = await pool.query(`SHOW COLUMNS FROM bridge_inspection LIKE 'bridge_inspection_id'`)
    const inspectionIdCol = iIdRows.length ? 'bridge_inspection_id' : 'inspection_id'
    const [ircFkRows] = await pool.query(`SHOW COLUMNS FROM bridge_inspection_rejection_comment LIKE 'bridge_inspection_id'`)
    const rejectionCommentFkCol = ircFkRows.length ? 'bridge_inspection_id' : 'inspection_id'

    if (req.query.search) {
      where += ' AND CAST(i.bridge_id AS CHAR) LIKE ?'
      params.push(`%${req.query.search.trim()}%`)
    }
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS c FROM bridge_inspection i WHERE ${where}`,
      params
    )
    const total = countRows[0].c
    const [rows] = await pool.query(
      `SELECT i.*, i.\`${inspectionIdCol}\` AS bridge_inspection_id, b.bridge_identity_no, b.chainage, b.popular_name_of_bridge, b.bridge_side, b.zone AS bridge_zone_text, b.project_name, b.highway_no, b.type_of_bridge,
              COALESCE(s_i.state_name, s_b.state_name) AS state_name,
              COALESCE(z_i.zone_name, z_b.zone_name, NULLIF(TRIM(b.zone), '')) AS zone_name,
              irc.comment AS rejection_comment, irc.comment_on AS rejection_date
       FROM bridge_inspection i
       LEFT JOIN bridge b ON b.bridge_id = i.bridge_id
       LEFT JOIN state s_i ON s_i.state_id = i.state_id
       LEFT JOIN state s_b ON s_b.state_code = TRIM(CAST(b.state_id AS CHAR)) AND TRIM(CAST(b.state_id AS CHAR)) <> ''
       LEFT JOIN zone z_i ON z_i.zone_id = i.zone_id
       LEFT JOIN zone z_b ON z_b.zone_code = TRIM(b.zone) AND TRIM(b.zone) <> ''
       LEFT JOIN bridge_inspection_rejection_comment irc ON irc.\`${rejectionCommentFkCol}\` = i.\`${inspectionIdCol}\`
       WHERE ${where}
       ORDER BY i.created_on DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    )
    res.json({ data: rows, total, page, limit, totalPages: Math.ceil(total / limit) || 1 })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: e.message })
  }
}

// Scheduled inspection list comes from `schedule_inspecion` table (not `bridge_inspection`).
router.get('/schedule-inspection-list', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1)
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 10))
    const offset = (page - 1) * limit
    const params = []
    let where = `1=1`

    const search = String(req.query.search || '').trim()
    if (search) {
      where += ` AND (b.bridge_identity_no LIKE ? OR b.project_name LIKE ? OR b.highway_no LIKE ? OR b.chainage LIKE ?)`
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`)
    }
    const projectName = String(req.query.projectName || req.query.project_name || '').trim()
    if (projectName) {
      where += ` AND b.project_name LIKE ?`
      params.push(`%${projectName}%`)
    }
    const highwayNo = String(req.query.highwayNo || req.query.highway_no || '').trim()
    if (highwayNo) {
      where += ` AND b.highway_no LIKE ?`
      params.push(`%${highwayNo}%`)
    }

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS c
       FROM (
         SELECT s1.*
         FROM schedule_inspecion s1
         INNER JOIN (
           SELECT bridge_id, MAX(si_id) AS max_si_id
           FROM schedule_inspecion
           WHERE status = 'Active'
           GROUP BY bridge_id
         ) latest ON latest.max_si_id = s1.si_id
       ) si
       LEFT JOIN bridge b ON b.bridge_id = si.bridge_id
       WHERE ${where}`,
      params
    )
    const total = countRows[0]?.c || 0

    const [rows] = await pool.query(
      `SELECT
         si.si_id,
         si.bridge_id,
         si.pre_month,
         si.post_month,
         si.routine_inspecion_month,
         si.routine_inspecion_frequency,
         si.status,
         si.updated_by,
         si.updated_on,
         b.bridge_identity_no,
         b.chainage,
         b.popular_name_of_bridge,
         b.project_name,
         b.highway_no,
         b.bridge_no,
         b.bridge_side,
         b.consultant_name,
         b.custodian
       FROM (
         SELECT s1.*
         FROM schedule_inspecion s1
         INNER JOIN (
           SELECT bridge_id, MAX(si_id) AS max_si_id
           FROM schedule_inspecion
           WHERE status = 'Active'
           GROUP BY bridge_id
         ) latest ON latest.max_si_id = s1.si_id
       ) si
       LEFT JOIN bridge b ON b.bridge_id = si.bridge_id
       WHERE ${where}
       ORDER BY si.updated_on DESC, si.si_id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    )

    // Frontend expects reminder_date / inspection_type style fields.
    const data = rows.map((r) => ({
      ...r,
      reminder_date: r.updated_on,
      inspection_type: 'Scheduled',
    }))

    res.json({ data, total, page, limit, totalPages: Math.ceil(total / limit) || 1 })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: e.message })
  }
})
router.get('/ongoing-inspection-list', (req, res) => inspectionList(req, res, 'ongoing'))
router.get('/approved-inspection-list', (req, res) => inspectionList(req, res, 'approved'))
router.get('/rejected-inspection-list', (req, res) => inspectionList(req, res, 'rejected'))
router.get('/pending-approval-inspection-list', (req, res) => inspectionList(req, res, 'pending_approval'))

router.get('/inspection/foundation/:inspectionId', async (req, res) => {
  try {
    const inspectionId = Number(req.params.inspectionId || 0)
    if (!inspectionId) return res.status(400).json({ success: false, message: 'Invalid inspection id' })
    const [rows] = await pool.query(
      `SELECT foundation_id, bridge_inspection_id, foundation_name, foundation_type, material,
              floating_bodies_boulders, floating_bodies_boulders_image,
              condition_of_foundation, condition_of_foundation_image,
              seepage_vehicle_impact, seepage_vehicle_impact_image,
              status, created_on, updated_on
       FROM foundation
       WHERE bridge_inspection_id = ? AND (status IS NULL OR status <> 'In-Active')
       ORDER BY foundation_id ASC`,
      [inspectionId]
    )
    if (Array.isArray(rows) && rows.length) {
      return res.json({ success: true, data: rows })
    }

    // Legacy fallback: pre-filled bridge master data may exist only in foundation_bridge.
    const [inspectionRows] = await pool.query(
      'SELECT bridge_id FROM bridge_inspection WHERE bridge_inspection_id = ? LIMIT 1',
      [inspectionId]
    )
    const bridgeId = Number(inspectionRows?.[0]?.bridge_id || 0)
    if (!bridgeId) {
      return res.json({ success: true, data: [] })
    }

    const [legacyRows] = await pool.query(
      `SELECT foundation_type, material, status, updated_on
       FROM foundation_bridge
       WHERE bridge_id = ? AND (status IS NULL OR status <> 'In-Active')
       ORDER BY foundation_bridge_id DESC
       LIMIT 1`,
      [bridgeId]
    )

    if (!Array.isArray(legacyRows) || !legacyRows.length) {
      return res.json({ success: true, data: [] })
    }

    const legacy = legacyRows[0] || {}
    return res.json({
      success: true,
      data: [
        {
          foundation_id: null,
          bridge_inspection_id: inspectionId,
          foundation_name: '',
          foundation_type: legacy.foundation_type || '',
          material: legacy.material || '',
          floating_bodies_boulders: '',
          condition_of_foundation: '',
          seepage_vehicle_impact: '',
          status: legacy.status || 'Active',
          created_on: null,
          updated_on: legacy.updated_on || null,
        },
      ],
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, message: e.message })
  }
})

router.post('/inspection/foundation/:inspectionId', requireAuth, async (req, res) => {
  try {
    const inspectionId = Number(req.params.inspectionId || 0)
    if (!inspectionId) return res.status(400).json({ success: false, message: 'Invalid inspection id' })
    const body = req.body || {}
    const payload = {
      foundation_name: String(body.foundation_name || '').trim(),
      foundation_type: String(body.foundation_type || '').trim(),
      material: String(body.material || '').trim(),
      floating_bodies_boulders: String(body.floating_bodies_boulders || '').trim(),
      condition_of_foundation: String(body.condition_of_foundation || '').trim(),
      seepage_vehicle_impact: String(body.seepage_vehicle_impact || '').trim(),
    }
    if (!payload.foundation_name) {
      return res.status(400).json({ success: false, message: 'Foundation name is required' })
    }
    const [result] = await pool.query(
      `INSERT INTO foundation
       (bridge_inspection_id, foundation_name, foundation_type, material, floating_bodies_boulders,
        condition_of_foundation, seepage_vehicle_impact, status, created_by, created_on, updated_by, updated_on)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Active', ?, NOW(), ?, NOW())`,
      [
        inspectionId,
        payload.foundation_name,
        payload.foundation_type,
        payload.material,
        payload.floating_bodies_boulders,
        payload.condition_of_foundation,
        payload.seepage_vehicle_impact,
        Number(req.user?.uid || 0),
        Number(req.user?.uid || 0),
      ]
    )
    const [rows] = await pool.query('SELECT * FROM foundation WHERE foundation_id = ? LIMIT 1', [result.insertId])
    res.json({ success: true, data: rows[0] || null })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, message: e.message })
  }
})

router.put('/inspection/foundation/:inspectionId/:foundationId', requireAuth, async (req, res) => {
  try {
    const inspectionId = Number(req.params.inspectionId || 0)
    const foundationId = Number(req.params.foundationId || 0)
    if (!inspectionId || !foundationId) {
      return res.status(400).json({ success: false, message: 'Invalid inspection/foundation id' })
    }
    const body = req.body || {}
    const payload = {
      foundation_name: String(body.foundation_name || '').trim(),
      foundation_type: String(body.foundation_type || '').trim(),
      material: String(body.material || '').trim(),
      floating_bodies_boulders: String(body.floating_bodies_boulders || '').trim(),
      condition_of_foundation: String(body.condition_of_foundation || '').trim(),
      seepage_vehicle_impact: String(body.seepage_vehicle_impact || '').trim(),
    }
    if (!payload.foundation_name) {
      return res.status(400).json({ success: false, message: 'Foundation name is required' })
    }
    await pool.query(
      `UPDATE foundation
       SET foundation_name = ?, foundation_type = ?, material = ?, floating_bodies_boulders = ?,
           condition_of_foundation = ?, seepage_vehicle_impact = ?, updated_by = ?, updated_on = NOW()
       WHERE foundation_id = ? AND bridge_inspection_id = ?`,
      [
        payload.foundation_name,
        payload.foundation_type,
        payload.material,
        payload.floating_bodies_boulders,
        payload.condition_of_foundation,
        payload.seepage_vehicle_impact,
        Number(req.user?.uid || 0),
        foundationId,
        inspectionId,
      ]
    )
    const [rows] = await pool.query('SELECT * FROM foundation WHERE foundation_id = ? LIMIT 1', [foundationId])
    res.json({ success: true, data: rows[0] || null })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, message: e.message })
  }
})

router.delete('/inspection/foundation/:inspectionId/:foundationId', requireAuth, async (req, res) => {
  try {
    const inspectionId = Number(req.params.inspectionId || 0)
    const foundationId = Number(req.params.foundationId || 0)
    if (!inspectionId || !foundationId) {
      return res.status(400).json({ success: false, message: 'Invalid inspection/foundation id' })
    }
    await pool.query(
      `UPDATE foundation
       SET status = 'In-Active', updated_by = ?, updated_on = NOW()
       WHERE foundation_id = ? AND bridge_inspection_id = ?`,
      [Number(req.user?.uid || 0), foundationId, inspectionId]
    )
    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, message: e.message })
  }
})

router.get('/inspections/:inspectionId', async (req, res) => {
  try {
    const inspectionId = Number(req.params.inspectionId || 0)
    if (!inspectionId) return res.status(400).json({ message: 'Invalid inspection id' })

    const [iIdRows] = await pool.query(`SHOW COLUMNS FROM bridge_inspection LIKE 'bridge_inspection_id'`)
    const inspectionIdCol = iIdRows.length ? 'bridge_inspection_id' : 'inspection_id'

    const [rows] = await pool.query(
      `SELECT i.*, i.\`${inspectionIdCol}\` AS bridge_inspection_id,
              b.bridge_identity_no, b.bridge_no, b.chainage, b.highway_no, b.popular_name_of_bridge, b.bridge_side, b.project_name,
              COALESCE(s_i.state_name, s_b.state_name) AS state_name,
              COALESCE(z_i.zone_name, z_b.zone_name, NULLIF(TRIM(b.zone), '')) AS zone_name
       FROM bridge_inspection i
       LEFT JOIN bridge b ON b.bridge_id = i.bridge_id
       LEFT JOIN state s_i ON s_i.state_id = i.state_id
       LEFT JOIN state s_b ON s_b.state_code = TRIM(CAST(b.state_id AS CHAR)) AND TRIM(CAST(b.state_id AS CHAR)) <> ''
       LEFT JOIN zone z_i ON z_i.zone_id = i.zone_id
       LEFT JOIN zone z_b ON z_b.zone_code = TRIM(b.zone) AND TRIM(b.zone) <> ''
       WHERE i.\`${inspectionIdCol}\` = ? LIMIT 1`,
      [inspectionId]
    )
    if (!rows[0]) return res.status(404).json({ message: 'Not found' })
    res.json(rows[0])
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

router.get('/inspection/distress/:inspectionId', async (req, res) => {
  try {
    const inspectionId = Number(req.params.inspectionId || 0)
    if (!inspectionId) return res.status(400).json({ message: 'Invalid inspection id' })
    const tableType = String(req.query?.table_type || '').trim()
    const componentName = String(req.query?.component_name || '').trim()
    const where = ['bridge_inspection_id = ?']
    const params = [inspectionId]
    const nonStructuralTableType = canonicalNonStructuralTableType(tableType)
    if (tableType) {
      const variants = nonStructuralTableTypeMatches(tableType)
      if (variants.length) {
        where.push(`table_type IN (${variants.map(() => '?').join(',')})`)
        params.push(...variants)
      } else if (isFoundationTableType(tableType)) {
        where.push('LOWER(table_type) = ?')
        params.push('foundation')
      } else {
        where.push('table_type = ?')
        params.push(tableType)
      }
    }
    if (componentName) {
      const compLower = componentName.toLowerCase()
      if (compLower === 'foundation') {
        where.push(
          `id IN (SELECT inspection_distress_id FROM inspection_cause_rating WHERE bridge_inspection_id = ? AND LOWER(component_name) = 'foundation')`
        )
        params.push(inspectionId)
      } else {
        where.push(
          'id IN (SELECT inspection_distress_id FROM inspection_cause_rating WHERE bridge_inspection_id = ? AND component_name = ?)'
        )
        params.push(inspectionId, componentName)
      }
    }
    const sourceTable = nonStructuralTableTypeMatches(tableType).length ? 'non_structural_distress' : 'bridge_inspection_distress'
    const [rows] = await pool.query(
      `SELECT * FROM ${sourceTable} WHERE ${where.join(' AND ')} ORDER BY id`,
      params
    )
    res.json(rows)
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

router.get('/inspection/cause_rating/:inspectionId', async (req, res) => {
  try {
    const inspectionId = Number(req.params.inspectionId || 0)
    if (!inspectionId) return res.status(400).json({ message: 'Invalid inspection id' })
    const componentName = String(req.query?.component_name || '').trim()
    const where = ['bridge_inspection_id = ?']
    const params = [inspectionId]
    if (componentName) {
      where.push('component_name = ?')
      params.push(componentName)
    }
    const [rows] = await pool.query(
      `SELECT * FROM inspection_cause_rating WHERE ${where.join(' AND ')} ORDER BY id`,
      params
    )
    res.json(rows || [])
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

router.post('/inspection/distress/upsert', requireAuth, async (req, res) => {
  const conn = await pool.getConnection()
  try {
    const inspectionId = Number(req.body?.inspectionId || 0)
    if (!inspectionId) return res.status(400).json({ success: false, message: 'Invalid inspection id' })

    const tableType = String(req.body?.tableType || '').trim() || 'approaches'
    const componentName = String(req.body?.componentName || '').trim() || 'approaches'
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : []
    const expansionScopeId = Number(req.body?.expansionId || req.body?.expansion_id || 0)
    const foundationScopeId = Number(req.body?.foundationId || req.body?.foundation_id || 0)
    const spansScopeId = Number(req.body?.spansId || req.body?.spans_id || 0)
    const userId = resolveActorUserId(req)
    const isFoundationScope = isFoundationTableType(tableType)
    const persistTableType = isFoundationScope ? 'Foundation' : tableType

    const nextId = async (table, idColumn = 'id') => {
      const [mx] = await conn.query(`SELECT COALESCE(MAX(\`${idColumn}\`), 0) AS mx FROM \`${table}\``)
      return Number(mx?.[0]?.mx || 0) + 1
    }

    await conn.beginTransaction()

    const nonStructuralTableType = canonicalNonStructuralTableType(tableType)
    if (nonStructuralTableType) {
      const tableTypeVariants = nonStructuralTableTypeMatches(tableType)
      const incomingIds = rows.map((r) => Number(r?.id || 0)).filter((n) => n > 0)
      const spansClause = spansScopeId > 0 ? ' AND spans = ?' : ''
      const spansParams = spansScopeId > 0 ? [spansScopeId] : []
      const tableTypeClause = `table_type IN (${tableTypeVariants.map(() => '?').join(',')})`
      if (incomingIds.length) {
        await conn.query(
          `DELETE FROM non_structural_distress
           WHERE bridge_inspection_id = ? AND ${tableTypeClause}${spansClause} AND id NOT IN (${incomingIds.map(() => '?').join(',')})`,
          [inspectionId, ...tableTypeVariants, ...spansParams, ...incomingIds]
        )
      } else {
        await conn.query(
          `DELETE FROM non_structural_distress WHERE bridge_inspection_id = ? AND ${tableTypeClause}${spansClause}`,
          [inspectionId, ...tableTypeVariants, ...spansParams]
        )
      }

      const numeric = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
      const distressNosOrNull = (v) => {
        if (v === '' || v == null || v === undefined) return null
        const n = Number(v)
        if (!Number.isFinite(n) || n < 0) return null
        return Math.floor(n)
      }

      for (const row of rows) {
        const distressType = String(row?.distress_type || '').trim()
        if (!distressType) continue

        const id = Number(row?.id || 0)
        const distressImagesValue = Array.isArray(row?.images)
          ? row.images.filter(Boolean).map((x) => String(x).trim()).filter(Boolean).join(',')
          : String(row?.images || row?.distress_images || '').trim()

        let distressId = id
        if (distressId > 0) {
          await conn.query(
            `UPDATE non_structural_distress
             SET table_type = ?, element_type = ?, element_description = ?, distress_type = ?, field_type = ?, name_of_span = ?,
                 distress_length = ?, distress_width = ?, distress_depth = ?, distress_nos = ?,
                 distance_of_distress_x = ?, distance_of_distress_y = ?,
                 abutment_A1 = ?, abutment_A2 = ?, piers = ?, spans = ?, foundation = ?, expansion = ?, lhs_distress = ?, rhs_distress = ?,
                 condition_rating = ?, material = ?, maintenance_required = ?, priority_level = ?, inspection_notes = ?, images = ?,
                 repair_methodology = ?, status = 'Active', updated_by = ?, updated_on = NOW()
             WHERE id = ? AND bridge_inspection_id = ?`,
            [
              nonStructuralTableType,
              String(row?.element_type || row?.element || '').trim() || null,
              String(row?.element_description || '').trim() || null,
              distressType,
              String(row?.field_type || '').trim() || null,
              String(row?.name_of_span || '').trim() || null,
              numeric(row?.distress_length),
              numeric(row?.distress_width),
              numeric(row?.distress_depth),
              distressNosOrNull(row?.distress_nos),
              numeric(row?.distance_of_distress_x),
              numeric(row?.distance_of_distress_y),
              numeric(row?.abutment_A1),
              numeric(row?.abutment_A2),
              numeric(row?.piers),
              numeric(row?.spans),
              numeric(row?.foundation),
              numeric(row?.expansion),
              numeric(row?.lhs_distress),
              numeric(row?.rhs_distress),
              String(row?.condition_rating || '').trim() || null,
              String(row?.material || '').trim() || null,
              String(row?.maintenance_required || '').trim() || null,
              String(row?.priority_level || '').trim() || null,
              String(row?.inspection_notes || '').trim() || null,
              distressImagesValue || null,
              String(row?.repair_methodology || '').trim() || null,
              userId,
              distressId,
              inspectionId,
            ]
          )
        } else {
          const [ins] = await conn.query(
            `INSERT INTO non_structural_distress
             (bridge_inspection_id, table_type, element_type, element_description, distress_type, field_type, name_of_span,
              distress_length, distress_width, distress_depth, distress_nos, distance_of_distress_x, distance_of_distress_y,
              abutment_A1, abutment_A2, piers, spans, foundation, expansion, lhs_distress, rhs_distress,
              condition_rating, material, maintenance_required, priority_level, inspection_notes, images, status,
              created_by, created_on, repair_methodology)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'Active',?,NOW(),?)`,
            [
              inspectionId,
              nonStructuralTableType,
              String(row?.element_type || row?.element || '').trim() || null,
              String(row?.element_description || '').trim() || null,
              distressType,
              String(row?.field_type || '').trim() || null,
              String(row?.name_of_span || '').trim() || null,
              numeric(row?.distress_length),
              numeric(row?.distress_width),
              numeric(row?.distress_depth),
              distressNosOrNull(row?.distress_nos),
              numeric(row?.distance_of_distress_x),
              numeric(row?.distance_of_distress_y),
              numeric(row?.abutment_A1),
              numeric(row?.abutment_A2),
              numeric(row?.piers),
              numeric(row?.spans),
              numeric(row?.foundation),
              numeric(row?.expansion),
              numeric(row?.lhs_distress),
              numeric(row?.rhs_distress),
              String(row?.condition_rating || '').trim() || null,
              String(row?.material || '').trim() || null,
              String(row?.maintenance_required || '').trim() || null,
              String(row?.priority_level || '').trim() || null,
              String(row?.inspection_notes || '').trim() || null,
              distressImagesValue || null,
              userId,
              String(row?.repair_methodology || '').trim() || null,
            ]
          )
          distressId = Number(ins?.insertId || 0)
        }

        const ratings = row?.ratings && typeof row.ratings === 'object' ? row.ratings : {}
        const [existingCR] = await conn.query(
          'SELECT id FROM inspection_cause_rating WHERE inspection_distress_id = ? LIMIT 1',
          [distressId]
        )
        const causeData = [
          inspectionId,
          componentName,
          numeric(ratings.foundation),
          numeric(ratings.wearing_coat),
          numeric(ratings.expansion_joint),
          numeric(ratings.superstructure),
          distressType,
          numeric(ratings.impact),
          numeric(ratings.abrasion),
          numeric(ratings.erosion),
          numeric(ratings.overload),
          numeric(ratings.fatigue),
          numeric(ratings.temprature),
          numeric(ratings.shrinkage),
          numeric(ratings.settlement),
          numeric(ratings.carbon_dioxide),
          numeric(ratings.sulphates),
          numeric(ratings.carbonation),
          numeric(ratings.alkali),
        ]
        if (existingCR[0]?.id) {
          await conn.query(
            `UPDATE inspection_cause_rating
             SET bridge_inspection_id = ?, component_name = ?, foundation = ?, wearing_coat = ?, expansion_joint = ?, superstructure = ?,
                 distress_type = ?, impact = ?, abrasion = ?, erosion = ?, overload = ?, fatigue = ?, temprature = ?, shrinkage = ?,
                 settlement = ?, carbon_dioxide = ?, sulphates = ?, carbonation = ?, alkali = ?, updated_by = ?, updated_on = CURDATE()
             WHERE id = ?`,
            [...causeData, userId, existingCR[0].id]
          )
        } else {
          const causeId = await nextId('inspection_cause_rating', 'id')
          await conn.query(
            `INSERT INTO inspection_cause_rating
             (id, inspection_distress_id, bridge_inspection_id, component_name, foundation, wearing_coat, expansion_joint, superstructure,
              distress_type, impact, abrasion, erosion, overload, fatigue, temprature, shrinkage, settlement, carbon_dioxide, sulphates,
              carbonation, alkali, updated_by, updated_on)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE())`,
            [causeId, distressId, ...causeData, userId]
          )
        }
      }

      await conn.commit()
      return res.json({ success: true })
    }

    const [distressCols] = await conn.query(
      `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bridge_inspection_distress'`
    )
    const distressColSet = new Set((distressCols || []).map((r) => String(r.COLUMN_NAME || '').toLowerCase()))
    const distressImagesCol =
      (['images', 'distress_images', 'distress_image', 'image'].find((c) => distressColSet.has(c)) || null)
    const hasDistressNosCol = distressColSet.has('distress_nos')
    const distressNosOrNull = (v) => {
      if (v === '' || v == null || v === undefined) return null
      const n = Number(v)
      if (!Number.isFinite(n) || n < 0) return null
      return Math.min(4294967295, Math.floor(n))
    }

    // keep only ids submitted for this table_type (optionally scoped to one expansion joint)
    const incomingIds = rows.map((r) => Number(r?.id || 0)).filter((n) => n > 0)
    const tableTypeLower = String(tableType || '').trim().toLowerCase()

    if (isFoundationScope) {
      const foundationWhere = ['bridge_inspection_id = ?', "LOWER(table_type) = 'foundation'"]
      const foundationParams = [inspectionId]
      if (foundationScopeId > 0) {
        foundationWhere.push('foundation = ?')
        foundationParams.push(foundationScopeId)
      }
      if (incomingIds.length) {
        await conn.query(
          `DELETE FROM bridge_inspection_distress
           WHERE ${foundationWhere.join(' AND ')} AND id NOT IN (${incomingIds.map(() => '?').join(',')})`,
          [...foundationParams, ...incomingIds]
        )
      } else {
        await conn.query(
          `DELETE FROM bridge_inspection_distress WHERE ${foundationWhere.join(' AND ')}`,
          foundationParams
        )
      }
    } else {
      const expansionClause = expansionScopeId > 0 ? ' AND expansion = ?' : ''
      const scopeClause = expansionClause
      const scopeParams = expansionScopeId > 0 ? [expansionScopeId] : []
      if (incomingIds.length) {
        await conn.query(
          `DELETE FROM bridge_inspection_distress
           WHERE bridge_inspection_id = ? AND table_type = ?${scopeClause} AND id NOT IN (${incomingIds.map(() => '?').join(',')})`,
          [inspectionId, tableType, ...scopeParams, ...incomingIds]
        )
      } else {
        await conn.query(
          `DELETE FROM bridge_inspection_distress WHERE bridge_inspection_id = ? AND table_type = ?${scopeClause}`,
          [inspectionId, tableType, ...scopeParams]
        )
      }
    }

    for (const row of rows) {
      const distressType = String(row?.distress_type || '').trim()
      if (!distressType) continue
      const numeric = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
      const id = Number(row?.id || 0)
      const distressNosVal = hasDistressNosCol ? distressNosOrNull(row?.distress_nos) : null
      const baseData = [
        distressType,
        String(row?.name_of_span || '').trim() || null,
        String(row?.field_type || '').trim() || null,
        numeric(row?.distress_length),
        numeric(row?.distress_width),
        numeric(row?.distress_depth),
        ...(hasDistressNosCol ? [distressNosVal] : []),
        numeric(row?.distance_of_distress_x),
        numeric(row?.distance_of_distress_y),
        numeric(row?.abutment_A1),
        numeric(row?.abutment_A2),
        numeric(row?.piers),
        numeric(row?.spans),
        numeric(row?.foundation),
        numeric(row?.expansion),
        numeric(row?.lhs_distress),
        numeric(row?.rhs_distress),
      ]
      const distressImagesValue = Array.isArray(row?.images)
        ? row.images.filter(Boolean).map((x) => String(x).trim()).filter(Boolean).join(',')
        : String(row?.images || row?.distress_images || '').trim()

      let distressId = id
      if (distressId <= 0) {
        // Prevent duplicate inserts during edit flows when frontend misses id:
        // reuse an existing row for same component/field/span/distress signature.
        const lookupWhere = [
          'bridge_inspection_id = ?',
          isFoundationScope ? "LOWER(table_type) = 'foundation'" : 'table_type = ?',
          'IFNULL(field_type, \'\') = ?',
          'IFNULL(distress_type, \'\') = ?',
          'IFNULL(name_of_span, \'\') = ?',
        ]
        const lookupParams = [
          inspectionId,
          ...(isFoundationScope ? [] : [persistTableType]),
          String(row?.field_type || '').trim(),
          distressType,
          String(row?.name_of_span || '').trim(),
        ]
        const spansValue = numeric(row?.spans)
        if (tableType === 'superstructure' && spansValue > 0) {
          lookupWhere.push('spans = ?')
          lookupParams.push(spansValue)
        }
        const foundationValue = numeric(row?.foundation)
        if (isFoundationScope && foundationValue > 0) {
          lookupWhere.push('foundation = ?')
          lookupParams.push(foundationValue)
        }
        const [matchedRows] = await conn.query(
          `SELECT id FROM bridge_inspection_distress
           WHERE ${lookupWhere.join(' AND ')}
           ORDER BY id DESC LIMIT 1`,
          lookupParams
        )
        if (matchedRows[0]?.id) distressId = Number(matchedRows[0].id)
      }
      if (distressId > 0) {
        const updateSetImages = distressImagesCol ? `, \`${distressImagesCol}\` = ?` : ''
        const updateParams = [...baseData]
        if (distressImagesCol) updateParams.push(distressImagesValue || null)
        await conn.query(
          `UPDATE bridge_inspection_distress
           SET distress_type = ?, name_of_span = ?, field_type = ?,
               distress_length = ?, distress_width = ?, distress_depth = ?,
               ${hasDistressNosCol ? 'distress_nos = ?, ' : ''}
               distance_of_distress_x = ?, distance_of_distress_y = ?,
               abutment_A1 = ?, abutment_A2 = ?, piers = ?, spans = ?,
               foundation = ?, expansion = ?, lhs_distress = ?, rhs_distress = ?${updateSetImages}
           WHERE id = ? AND bridge_inspection_id = ?${
             isFoundationScope ? " AND LOWER(table_type) = 'foundation'" : ' AND table_type = ?'
           }`,
          [
            ...updateParams,
            distressId,
            inspectionId,
            ...(isFoundationScope ? [] : [persistTableType]),
          ]
        )
      } else {
        distressId = await nextId('bridge_inspection_distress', 'id')
        const measureCols = hasDistressNosCol
          ? [
              'distress_length',
              'distress_width',
              'distress_depth',
              'distress_nos',
              'distance_of_distress_x',
              'distance_of_distress_y',
            ]
          : ['distress_length', 'distress_width', 'distress_depth', 'distance_of_distress_x', 'distance_of_distress_y']
        const insertCols = [
          'id',
          'bridge_inspection_id',
          'table_type',
          'distress_type',
          'name_of_span',
          'field_type',
          ...measureCols,
          'abutment_A1',
          'abutment_A2',
          'piers',
          'spans',
          'foundation',
          'expansion',
          'lhs_distress',
          'rhs_distress',
        ]
        const insertVals = [distressId, inspectionId, persistTableType, ...baseData]
        if (distressImagesCol) {
          insertCols.push(distressImagesCol)
          insertVals.push(distressImagesValue || null)
        }
        insertCols.push('created_by', 'created_on')
        insertVals.push(userId)
        await conn.query(
          `INSERT INTO bridge_inspection_distress
           (${insertCols.map((c) => `\`${c}\``).join(', ')})
           VALUES (${insertCols.map((c) => (c === 'created_on' ? 'CURDATE()' : '?')).join(', ')})`,
          insertVals
        )
      }

      const ratings = row?.ratings && typeof row.ratings === 'object' ? row.ratings : {}
      const [existingCR] = await conn.query(
        'SELECT id FROM inspection_cause_rating WHERE inspection_distress_id = ? LIMIT 1',
        [distressId]
      )
      const causeData = [
        inspectionId,
        componentName,
        numeric(ratings.foundation),
        numeric(ratings.wearing_coat),
        numeric(ratings.expansion_joint),
        numeric(ratings.superstructure),
        distressType,
        numeric(ratings.impact),
        numeric(ratings.abrasion),
        numeric(ratings.erosion),
        numeric(ratings.overload),
        numeric(ratings.fatigue),
        numeric(ratings.temprature),
        numeric(ratings.shrinkage),
        numeric(ratings.settlement),
        numeric(ratings.carbon_dioxide),
        numeric(ratings.sulphates),
        numeric(ratings.carbonation),
        numeric(ratings.alkali),
      ]
      if (existingCR[0]?.id) {
        await conn.query(
          `UPDATE inspection_cause_rating
           SET bridge_inspection_id = ?, component_name = ?, foundation = ?, wearing_coat = ?, expansion_joint = ?, superstructure = ?,
               distress_type = ?, impact = ?, abrasion = ?, erosion = ?, overload = ?, fatigue = ?, temprature = ?, shrinkage = ?,
               settlement = ?, carbon_dioxide = ?, sulphates = ?, carbonation = ?, alkali = ?, updated_by = ?, updated_on = CURDATE()
           WHERE id = ?`,
          [...causeData, userId, existingCR[0].id]
        )
      } else {
        const causeId = await nextId('inspection_cause_rating', 'id')
        await conn.query(
          `INSERT INTO inspection_cause_rating
           (id, inspection_distress_id, bridge_inspection_id, component_name, foundation, wearing_coat, expansion_joint, superstructure,
            distress_type, impact, abrasion, erosion, overload, fatigue, temprature, shrinkage, settlement, carbon_dioxide, sulphates,
            carbonation, alkali, updated_by, updated_on)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE())`,
          [causeId, distressId, ...causeData, userId]
        )
      }
    }

    await conn.commit()
    return res.json({ success: true })
  } catch (e) {
    await conn.rollback().catch(() => {})
    return res.status(500).json({ success: false, message: e.message })
  } finally {
    conn.release()
  }
})

router.get('/inspection/last_approved/:bridgeId', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM bridge_inspection
       WHERE bridge_id = ?
         AND status = 'Approved'
         AND bmc_inspection_status = 'Approved'
       ORDER BY created_on DESC LIMIT 1`,
      [req.params.bridgeId]
    )
    res.json(rows[0] || null)
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

router.get('/boq/last_approved/:bridgeId', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM bridge_inspection
       WHERE bridge_id = ?
         AND status = 'Approved'
         AND bmc_inspection_status = 'Approved'
       ORDER BY created_on DESC LIMIT 1`,
      [req.params.bridgeId]
    )
    res.json(rows[0] || null)
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

router.get('/boq/distress/:inspectionId', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM bridge_inspection_distress WHERE bridge_inspection_id = ?',
      [req.params.inspectionId]
    )
    res.json(rows)
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

router.get('/boq/distress-data/:inspectionId', async (req, res) => {
  try {
    const inspectionId = Number(req.params.inspectionId || 0)
    if (!inspectionId) return res.status(400).json({ message: 'Invalid inspection id' })

    const [structural] = await pool.query(
      `SELECT * FROM bridge_inspection_distress
       WHERE bridge_inspection_id = ?
       ORDER BY id ASC`,
      [inspectionId]
    )

    let nonStructural = []
    try {
      const [ns] = await pool.query(
        `SELECT * FROM non_structural_distress
         WHERE bridge_inspection_id = ?
         ORDER BY id ASC`,
        [inspectionId]
      )
      nonStructural = ns || []
    } catch {
      nonStructural = []
    }

    let manual = []
    try {
      const [m] = await pool.query(
        `SELECT * FROM manual_distress
         WHERE bridge_inspection_id = ?
         ORDER BY id ASC`,
        [inspectionId]
      )
      manual = m || []
    } catch {
      manual = []
    }

    let bearings = []
    try {
      const [b] = await pool.query(
        `SELECT *
         FROM inspection_component_rating
         WHERE bridge_inspection_id = ? AND status = 'Active'
         ORDER BY id ASC`,
        [inspectionId]
      )
      bearings = (b || []).map((row) => ({
        ...row,
        table_type: 'Bearing Name',
        distress_type: row.component_name || row.component_type || 'Bearing',
        distress_length: 0,
        distress_width: 0,
        distress_depth: 0,
      }))
    } catch {
      bearings = []
    }

    let pedestals = []
    try {
      const [p] = await pool.query(
        `SELECT bpc_id, bridge_inspection_id, pedestal_condition, repair_methodology
         FROM bearing_and_pedistal_condition
         WHERE bridge_inspection_id = ?
         ORDER BY bpc_id ASC`,
        [inspectionId]
      )
      pedestals = (p || []).map((row) => ({
        ...row,
        id: row.bpc_id,
        table_type: 'Pedestal Name',
        distress_type: row.pedestal_condition || 'Pedestal',
        distress_length: 0,
        distress_width: 0,
        distress_depth: 0,
      }))
    } catch {
      pedestals = []
    }

    let nseTable = []
    try {
      const [nse] = await pool.query(
        `SELECT * FROM non_structural_elements
         WHERE bridge_inspection_id = ?
         ORDER BY non_structural_element_id ASC`,
        [inspectionId]
      )
      nseTable = nse || []
    } catch {
      nseTable = []
    }

    res.json({
      structural: [...(structural || []), ...bearings, ...pedestals],
      nonStructural,
      manual,
      nseTable,
    })
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

router.get('/inspection/draft_report/:inspectionId', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.inspectionId || 0)
    if (!id) return res.status(400).json({ success: false, message: 'Invalid inspection id' })
    const [rows] = await pool.query(
      `SELECT bridge_inspection_id, bridge_id,
              boq_structure_layout_images, boq_conclusion_report, boq_causes_of_distress,
              boq_remedial_measures, boq_repair_methodology
       FROM bridge_inspection WHERE bridge_inspection_id = ? LIMIT 1`,
      [id]
    )
    const row = rows[0]
    if (!row) return res.status(404).json({ success: false, message: 'Not found' })
    let imgs = []
    try {
      imgs = row.boq_structure_layout_images ? JSON.parse(row.boq_structure_layout_images) : []
    } catch {
      imgs = []
    }
    res.json({
      success: true,
      data: {
        bridge_inspection_id: row.bridge_inspection_id,
        bridge_id: row.bridge_id,
        boq_structure_layout_images: imgs,
        boq_conclusion_report: row.boq_conclusion_report || '',
        boq_causes_of_distress: row.boq_causes_of_distress || '',
        boq_remedial_measures: row.boq_remedial_measures || '',
        boq_repair_methodology: row.boq_repair_methodology || '',
      },
    })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
})

router.post(
  '/inspection/draft_report/save',
  requireAuth,
  upload.array('structure_layout_image', 10),
  async (req, res) => {
    try {
      const id = Number(req.body?.bridge_inspection_id || 0)
      if (!id) return res.status(400).json({ success: false, message: 'bridge_inspection_id required' })

      const conclusion = req.body?.conclusion_report ?? ''
      const causes = req.body?.causes_of_distress ?? ''
      const remedial = req.body?.remedial_measures ?? ''
      const repair = req.body?.repair_methodology ?? ''

      let removed = []
      try {
        removed = req.body?.removed_images ? JSON.parse(req.body.removed_images) : []
      } catch {
        removed = []
      }

      const [rows] = await pool.query(
        `SELECT boq_structure_layout_images FROM bridge_inspection WHERE bridge_inspection_id = ? LIMIT 1`,
        [id]
      )
      let existing = []
      try {
        existing = rows[0]?.boq_structure_layout_images ? JSON.parse(rows[0].boq_structure_layout_images) : []
      } catch {
        existing = []
      }

      const kept = (existing || []).filter((p) => !removed.includes(p))
      const uploaded = (req.files || []).map((f) => `upload/structure_layout/${f.filename}`)
      const merged = [...kept, ...uploaded]
      await mirrorUploadRelPaths(uploaded, uploadRoot)

      await pool.query(
        `UPDATE bridge_inspection
         SET boq_structure_layout_images = ?,
             boq_conclusion_report = ?,
             boq_causes_of_distress = ?,
             boq_remedial_measures = ?,
             boq_repair_methodology = ?,
             updated_by = ?,
             upadted_on = NOW()
         WHERE bridge_inspection_id = ?`,
        [JSON.stringify(merged), conclusion, causes, remedial, repair, req.user?.uid || 0, id]
      )

      // delete removed files (best effort)
      for (const rel of removed || []) {
        if (!String(rel).includes('upload/structure_layout/')) continue
        const name = String(rel).split('/').pop()
        const p = path.join(uploadRoot, 'structure_layout', name)
        try {
          if (fs.existsSync(p)) fs.unlinkSync(p)
        } catch {
          // ignore
        }
      }

      res.json({ success: true, data: { boq_structure_layout_images: merged } })
    } catch (e) {
      res.status(500).json({ success: false, message: e.message })
    }
  }
)

router.get('/inspection/download_pdf/:inspectionId', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.inspectionId || 0)
    if (!id) return res.status(400).json({ message: 'Invalid inspection id' })

    const [iRows] = await pool.query(
      `SELECT i.*, b.bridge_identity_no, b.chainage, b.popular_name_of_bridge, b.project_name
       FROM bridge_inspection i
       LEFT JOIN bridge b ON b.bridge_id = i.bridge_id
       WHERE i.bridge_inspection_id = ? LIMIT 1`,
      [id]
    )
    const i = iRows[0]
    if (!i) return res.status(404).json({ message: 'Not found' })

    // load component tables we migrated
    const keys = [
      'general',
      'approaches',
      'protection_works',
      'waterway',
      'foundation',
      'substructure',
      'bearing_and_pedestal',
      'superstructure',
      'expansion_joint',
      'wearing_coat',
      'drainage_spouts_and_vest_holes',
      'handrails',
      'footpaths',
      'utilities',
    ]
    const components = {}
    for (const k of keys) {
      try {
        const cfg = INSPECTION_COMPONENTS[k]
        if (!cfg) continue
        const resolvedPk = await resolveInspectionComponentPk(cfg)
        const [rows] = await pool.query(
          `SELECT * FROM \`${cfg.table}\` WHERE bridge_inspection_id = ? ORDER BY \`${resolvedPk}\` DESC LIMIT 1`,
          [id]
        )
        components[k] = rows[0] || null
      } catch {
        components[k] = null
      }
    }

    const [dRows] = await pool.query(
      `SELECT * FROM bridge_inspection_distress WHERE bridge_inspection_id = ? ORDER BY id`,
      [id]
    )

    let layoutImgs = []
    try {
      layoutImgs = i.boq_structure_layout_images ? JSON.parse(i.boq_structure_layout_images) : []
    } catch {
      layoutImgs = []
    }

    return pipePdf(res, `inspection-${id}.pdf`, (doc) => {
      doc.fontSize(16).text('Inspection Report', { align: 'center' })
      doc.moveDown()
      doc.fontSize(10)
      doc.text(`Inspection ID: ${id}`)
      doc.text(`Bridge Identity No: ${i.bridge_identity_no || ''}`)
      doc.text(`Project: ${i.project_name || ''}`)
      doc.text(`Chainage: ${i.chainage || ''}`)
      doc.text(`Bridge Name: ${i.popular_name_of_bridge || ''}`)
      doc.moveDown()

      doc.fontSize(12).text('Draft Report', { underline: true })
      doc.moveDown(0.25)
      doc.fontSize(9).text('Conclusion Report:')
      doc.fontSize(8).text(i.boq_conclusion_report || '')
      doc.moveDown(0.5)
      doc.fontSize(9).text('Causes of Distress:')
      doc.fontSize(8).text(i.boq_causes_of_distress || '')
      doc.moveDown(0.5)
      doc.fontSize(9).text('Remedial Measures:')
      doc.fontSize(8).text(i.boq_remedial_measures || '')
      doc.moveDown()

      doc.fontSize(12).text('Components (latest)', { underline: true })
      doc.moveDown(0.25)
      doc.fontSize(8)
      for (const [k, v] of Object.entries(components)) {
        doc.fontSize(10).text(k.replace(/_/g, ' ').toUpperCase())
        doc.fontSize(8)
        if (!v) {
          doc.text('No data.')
          doc.moveDown(0.25)
          continue
        }
        const keys2 = Object.keys(v).filter((x) => !String(x).endsWith('_images'))
        for (const kk of keys2) {
          const val = v[kk]
          if (val === null || val === undefined || val === '') continue
          doc.text(`${kk}: ${String(val)}`)
        }
        doc.moveDown(0.5)
      }

      doc.addPage()
      doc.fontSize(12).text('Distress List', { underline: true })
      doc.moveDown(0.5)
      doc.fontSize(8)
      for (const r of dRows || []) {
        doc.text(
          `${r.table_type || ''} | ${r.distress_type || ''} | L:${r.distress_length ?? ''} W:${r.distress_width ?? ''} D:${r.distress_depth ?? ''} | RM:${r.repair_methodology || ''}`
        )
      }

      if (layoutImgs.length) {
        doc.addPage()
        doc.fontSize(12).text('Structure Layout Images (paths)', { underline: true })
        doc.moveDown(0.5)
        doc.fontSize(8)
        layoutImgs.forEach((p) => doc.text(p))
      }
    })
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

// PHP parity: bmc/Boq::save_repair_methodology (supports bridge_inspection_distress + non_structural_distress +
// inspection_component_rating (bearing) + bearing_and_pedistal_condition (pedestal))
router.post('/index.php/bmc/boq/save_repair_methodology', requireAuth, async (req, res) => {
  try {
    const bridgeInspectionId = Number(req.body?.bridge_inspection_id || req.body?.bridgeInspectionId || 0)
    const repairMethodologies = Array.isArray(req.body?.repair_methodologies)
      ? req.body.repair_methodologies
      : Array.isArray(req.body?.repairMethodologies)
        ? req.body.repairMethodologies
        : []

    if (!bridgeInspectionId) {
      return res.status(400).json({ status: 'error', message: 'Bridge Inspection ID is required' })
    }

    const normalizeRm = (rm) => {
      if (Array.isArray(rm)) return rm.join(', ')
      return String(rm ?? '').trim()
    }

    let savedCount = 0
    const errors = []

    // Detect bridge_inspection_distress id column
    const [distCols] = await pool.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bridge_inspection_distress'`
    )
    const distColNames = new Set(distCols.map((r) => r.COLUMN_NAME))
    const distressIdCol = distColNames.has('bridge_inspection_distress_id')
      ? 'bridge_inspection_distress_id'
      : distColNames.has('distress_id')
        ? 'distress_id'
        : distColNames.has('id')
          ? 'id'
          : 'id'

    for (const item of repairMethodologies) {
      const rawId = item?.id ?? item?.distress_id ?? ''
      const id = Number(String(rawId).trim())
      if (!id) continue

      const tableType = String(item?.table_type || item?.tableType || '')
      const newRm = normalizeRm(item?.repair_methodology ?? item?.repairMethodology ?? '')

      // 1) non_structural_distress
      try {
        const [nsRows] = await pool.query(
          `SELECT repair_methodology FROM non_structural_distress
           WHERE id = ? AND bridge_inspection_id = ? LIMIT 1`,
          [id, bridgeInspectionId]
        )
        if (nsRows[0]) {
          const existing = String(nsRows[0].repair_methodology ?? '').trim()
          if (existing !== newRm) {
            await pool.query(
              `UPDATE non_structural_distress SET repair_methodology = ?, updated_by = ?, updated_on = NOW()
               WHERE id = ? AND bridge_inspection_id = ?`,
              [newRm, req.user?.uid || 0, id, bridgeInspectionId]
            )
            savedCount++
          }
          continue
        }
      } catch (e) {
        // ignore and fall through
      }

      // 2) bridge_inspection_distress
      try {
        const [dRows] = await pool.query(
          `SELECT repair_methodology FROM bridge_inspection_distress
           WHERE \`${distressIdCol}\` = ? AND bridge_inspection_id = ? LIMIT 1`,
          [id, bridgeInspectionId]
        )
        if (dRows[0]) {
          const existing = String(dRows[0].repair_methodology ?? '').trim()
          if (existing !== newRm) {
            await pool.query(
              `UPDATE bridge_inspection_distress SET repair_methodology = ?
               WHERE \`${distressIdCol}\` = ? AND bridge_inspection_id = ?`,
              [newRm, id, bridgeInspectionId]
            )
            savedCount++
          }
          continue
        }
      } catch (e) {
        // ignore and fall through
      }

      // 3) Bearing (inspection_component_rating)
      // PHP checks table_type indicates Bearing; we also attempt update by id anyway
      try {
        const [bRows] = await pool.query(
          `SELECT repair_methodology FROM inspection_component_rating
           WHERE id = ? AND bridge_inspection_id = ? LIMIT 1`,
          [id, bridgeInspectionId]
        )
        if (bRows[0] || /bearing/i.test(tableType)) {
          const existing = String(bRows[0]?.repair_methodology ?? '').trim()
          if (existing !== newRm) {
            await pool.query(
              `UPDATE inspection_component_rating SET repair_methodology = ?, updated_by = ?, updated_on = NOW()
               WHERE id = ? AND bridge_inspection_id = ?`,
              [newRm, req.user?.uid || 0, id, bridgeInspectionId]
            )
            savedCount++
          }
          continue
        }
      } catch (e) {
        // ignore and fall through
      }

      // 4) Pedestal (bearing_and_pedistal_condition)
      try {
        const [pRows] = await pool.query(
          `SELECT repair_methodology FROM bearing_and_pedistal_condition
           WHERE bpc_id = ? AND bridge_inspection_id = ? LIMIT 1`,
          [id, bridgeInspectionId]
        )
        if (pRows[0] || /pedestal/i.test(tableType)) {
          const existing = String(pRows[0]?.repair_methodology ?? '').trim()
          if (existing !== newRm) {
            await pool.query(
              `UPDATE bearing_and_pedistal_condition SET repair_methodology = ?, updated_by = ?, updated_on = NOW()
               WHERE bpc_id = ? AND bridge_inspection_id = ?`,
              [newRm, req.user?.uid || 0, id, bridgeInspectionId]
            )
            savedCount++
          }
          continue
        }
      } catch (e) {
        // ignore and fall through
      }

      // 5) manual_distress
      try {
        const [mRows] = await pool.query(
          `SELECT repair_methodology FROM manual_distress
           WHERE id = ? AND bridge_inspection_id = ? LIMIT 1`,
          [id, bridgeInspectionId]
        )
        if (mRows[0]) {
          const existing = String(mRows[0].repair_methodology ?? '').trim()
          if (existing !== newRm) {
            await pool.query(
              `UPDATE manual_distress SET repair_methodology = ?, updated_on = NOW()
               WHERE id = ? AND bridge_inspection_id = ?`,
              [newRm, id, bridgeInspectionId]
            )
            savedCount++
          }
          continue
        }
      } catch {
        // ignore and fall through
      }

      errors.push(`No matching record found for id=${id}`)
    }

    return res.json({
      status: 'success',
      saved_count: savedCount,
      message: 'Repair methodology saved',
      errors,
    })
  } catch (e) {
    return res.status(500).json({ status: 'error', message: e.message })
  }
})

router.post('/inspections/:inspectionId/approve', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.inspectionId || 0)
    if (!id) return res.status(400).json({ success: false, message: 'Invalid inspection id' })

    // PHP parity: bmc/Inspection::confirm_by_bmc() (Approved path)
    // - status = Approved
    // - bmc_inspection_status = Approved
    // - bmc_user = session userid
    // - bmc_inspection_status_date = Y-m-d
    await pool.query(
      `UPDATE bridge_inspection
       SET status = 'Approved',
           bmc_inspection_status = 'Approved',
           bmc_user = ?,
           bmc_inspection_status_date = CURDATE(),
           upadted_on = NOW()
       WHERE bridge_inspection_id = ?`,
      [req.user?.uid || 0, id]
    )
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

// Site Engineer confirms inspection and sends it to BMC pending-approval queue
router.post('/inspections/:inspectionId/send_for_approval', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.inspectionId || 0)
    if (!id) return res.status(400).json({ success: false, message: 'Invalid inspection id' })

    await pool.query(
      `UPDATE bridge_inspection
       SET status = 'Confirmed',
           bmc_inspection_status = 'No',
           bmc_user = ?,
           bmc_inspection_status_date = NULL,
           upadted_on = NOW()
       WHERE bridge_inspection_id = ?`,
      [req.user?.uid || 0, id]
    )

    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
})

router.post('/bmc/inspection/reject/:inspectionId', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.inspectionId || 0)
    if (!id) return res.status(400).json({ success: false, message: 'Invalid inspection id' })
    const comment = String(req.body?.comment || '').trim()

    // PHP parity: bmc/Inspection::confirm_by_bmc() (Rejected path)
    await pool.query(
      `UPDATE bridge_inspection
       SET status = 'Pending',
           bmc_inspection_status = 'Rejected',
           bmc_user = ?,
           bmc_inspection_status_date = CURDATE(),
           upadted_on = NOW()
       WHERE bridge_inspection_id = ?`,
      [req.user?.uid || 0, id]
    )

    // Save rejection comment (if table exists)
    try {
      await pool.query(
        `INSERT INTO bridge_inspection_rejection_comment (bridge_inspection_id, comment, comment_by, comment_on)
         VALUES (?,?,?,CURDATE())`,
        [id, comment, req.user?.uid || 0]
      )
    } catch {
      // ignore if table/columns missing
    }

    // Mark overall bridge rating as rejected (if table exists)
    try {
      await pool.query(
        `UPDATE overall_bridge_rating
         SET bmc_rejected = 'Yes', updated_by = ?, updated_on = CURDATE()
         WHERE bridge_inspection_id = ?`,
        [req.user?.uid || 0, id]
      )
    } catch {
      // ignore if table/columns missing
    }
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

// Legacy PHP route compatibility: bmc/Inspection::confirm_by_bmc
router.post('/bmc/inspection/confirm_by_bmc', requireAuth, async (req, res) => {
  try {
    const id = Number(req.body?.bridge_inspection_id || 0)
    const status = String(req.body?.bmc_inspection_status || '').trim()
    const comment = String(req.body?.comment || '').trim()
    if (!id || !status) return res.status(400).json({ success: false, message: 'Invalid parameters' })
    if (status === 'Approved') {
      await pool.query(
        `UPDATE bridge_inspection
         SET status = 'Approved',
             bmc_inspection_status = 'Approved',
             bmc_user = ?,
             bmc_inspection_status_date = CURDATE(),
             upadted_on = NOW()
         WHERE bridge_inspection_id = ?`,
        [req.user?.uid || 0, id]
      )
      return res.json({ success: true })
    }
    // treat anything else as rejected
    await pool.query(
      `UPDATE bridge_inspection
       SET status = 'Pending',
           bmc_inspection_status = 'Rejected',
           bmc_user = ?,
           bmc_inspection_status_date = CURDATE(),
           upadted_on = NOW()
       WHERE bridge_inspection_id = ?`,
      [req.user?.uid || 0, id]
    )
    try {
      await pool.query(
        `INSERT INTO bridge_inspection_rejection_comment (bridge_inspection_id, comment, comment_by, comment_on)
         VALUES (?,?,?,CURDATE())`,
        [id, comment, req.user?.uid || 0]
      )
    } catch {
      // ignore
    }
    try {
      await pool.query(
        `UPDATE overall_bridge_rating
         SET bmc_rejected = 'Yes', updated_by = ?, updated_on = CURDATE()
         WHERE bridge_inspection_id = ?`,
        [req.user?.uid || 0, id]
      )
    } catch {
      // ignore
    }
    return res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
})

// PHP parity: Inspection::deleteDistress (also deletes inspection_cause_rating rows)
router.post('/inspection/deleteDistress', requireAuth, async (req, res) => {
  try {
    const id = Number(req.body?.id || 0)
    if (!id) return res.status(400).json({ status: 'error', message: 'Invalid id' })
    await pool.query('DELETE FROM inspection_cause_rating WHERE inspection_distress_id = ?', [id]).catch(() => {})
    let [r] = await pool.query('DELETE FROM bridge_inspection_distress WHERE id = ? LIMIT 1', [id])
    if (!(r.affectedRows || 0)) {
      ;[r] = await pool.query('DELETE FROM non_structural_distress WHERE id = ? LIMIT 1', [id])
    }
    const ok = (r.affectedRows || 0) > 0
    return res.json({ status: ok ? 'success' : 'error' })
  } catch (e) {
    return res.status(500).json({ status: 'error', message: e.message })
  }
})

// PHP parity: Inspection::deletePedestalList (deletes bearing_and_pedistal_condition row)
router.post('/inspection/deletePedestalList', requireAuth, async (req, res) => {
  try {
    const bpcId = Number(req.body?.bpc_id || 0)
    if (!bpcId) return res.status(400).json({ status: 'error', message: 'Invalid bpc_id' })
    const [r] = await pool.query('DELETE FROM bearing_and_pedistal_condition WHERE bpc_id = ? LIMIT 1', [bpcId])
    const ok = (r.affectedRows || 0) > 0
    return res.json({ status: ok ? 'success' : 'error' })
  } catch (e) {
    return res.status(500).json({ status: 'error', message: e.message })
  }
})

// Pedestal condition list (needed for delete UI parity)
router.get('/inspection/pedestal_conditions/:inspectionId', optionalAuth, async (req, res) => {
  try {
    const id = Number(req.params.inspectionId || 0)
    if (!id) return res.status(400).json({ message: 'Invalid inspection id' })
    const [rows] = await pool.query(
      'SELECT * FROM bearing_and_pedistal_condition WHERE bridge_inspection_id = ? ORDER BY bpc_id ASC',
      [id]
    )
    res.json(rows || [])
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

// Upsert pedestal condition rows (bearing_and_pedistal_condition)
router.post('/inspection/pedestal_conditions/upsert', requireAuth, async (req, res) => {
  const conn = await pool.getConnection()
  try {
    const inspectionId = Number(req.body?.inspectionId || 0)
    if (!inspectionId) return res.status(400).json({ success: false, message: 'Invalid inspection id' })
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : []
    const persistedRows = rows.filter((row) => String(row?.pedestal_condition || '').trim())
    const userId = Number(req.user?.uid || 0)

    if (!persistedRows.length) {
      return res.json({ success: true, skipped: true })
    }

    await conn.beginTransaction()

    const [bRows] = await conn.query(
      `SELECT bearing_and_pedistal_id
       FROM bearing_and_pedistal
       WHERE bridge_inspection_id = ?
       ORDER BY bearing_and_pedistal_id DESC
       LIMIT 1`,
      [inspectionId]
    )
    const bearingAndPedistalId =
      Number(req.body?.bearingAndPedistalId || 0) || Number(bRows?.[0]?.bearing_and_pedistal_id || 0)

    if (!bearingAndPedistalId) {
      await conn.rollback()
      return res.status(400).json({ success: false, message: 'Save bearing & pedestal first.' })
    }

    const incomingIds = persistedRows.map((r) => Number(r?.bpc_id || 0)).filter((n) => n > 0)
    if (incomingIds.length) {
      await conn.query(
        `DELETE FROM bearing_and_pedistal_condition
         WHERE bridge_inspection_id = ? AND bpc_id NOT IN (${incomingIds.map(() => '?').join(',')})`,
        [inspectionId, ...incomingIds]
      )
    } else {
      await conn.query('DELETE FROM bearing_and_pedistal_condition WHERE bridge_inspection_id = ?', [inspectionId])
    }

    const nextId = async () => {
      const [mx] = await conn.query('SELECT COALESCE(MAX(bpc_id), 0) AS mx FROM bearing_and_pedistal_condition')
      return Number(mx?.[0]?.mx || 0) + 1
    }
    const numeric = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)

    for (const row of persistedRows) {
      const pedestalCondition = String(row?.pedestal_condition || '').trim()
      const conditionValues = [
        pedestalCondition,
        numeric(row?.pedestal_condition_length),
        numeric(row?.pedestal_condition_width),
        numeric(row?.pedestal_condition_depth),
        numeric(row?.pedestal_condition_distance_x),
        numeric(row?.pedestal_condition_distance_y),
      ]
      const nameOfSpan = String(row?.name_of_span || '').trim() || null
      const bpcId = Number(row?.bpc_id || 0)
      if (bpcId > 0) {
        await conn.query(
          `UPDATE bearing_and_pedistal_condition
           SET pedestal_condition = ?, pedestal_condition_length = ?, pedestal_condition_width = ?,
               pedestal_condition_depth = ?, pedestal_condition_distance_x = ?, pedestal_condition_distance_y = ?,
               name_of_span = ?
           WHERE bpc_id = ? AND bridge_inspection_id = ?`,
          [...conditionValues, nameOfSpan, bpcId, inspectionId]
        )
      } else {
        const id = await nextId()
        await conn.query(
          `INSERT INTO bearing_and_pedistal_condition
           (bpc_id, bridge_inspection_id, bearing_and_pedistal_id, pedestal_condition,
            pedestal_condition_length, pedestal_condition_width, pedestal_condition_depth,
            pedestal_condition_distance_x, pedestal_condition_distance_y, created_by, created_on, name_of_span)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE(), ?)`,
          [id, inspectionId, bearingAndPedistalId, ...conditionValues, userId, nameOfSpan]
        )
      }
    }

    await conn.commit()
    return res.json({ success: true })
  } catch (e) {
    await conn.rollback().catch(() => {})
    return res.status(500).json({ success: false, message: e.message })
  } finally {
    conn.release()
  }
})

// Substructure pilers list (best-effort; returns [] if table not present)
router.get('/inspection/substructure_pilers/:inspectionId', async (req, res) => {
  try {
    const id = Number(req.params.inspectionId || 0)
    if (!id) return res.status(400).json({ message: 'Invalid inspection id' })
    const [rows] = await pool.query(
      'SELECT * FROM substructure_pilers WHERE bridge_inspection_id = ? ORDER BY p_id ASC',
      [id]
    )
    return res.json(rows || [])
  } catch {
    return res.json([])
  }
})

// Upsert substructure piler row (create/update)
router.post('/inspection/substructure_piler/upsert', optionalAuth, async (req, res) => {
  try {
    const inspectionId = Number(req.body?.inspectionId || req.body?.bridge_inspection_id || 0)
    const pId = Number(req.body?.p_id || 0)
    const dataObj = req.body?.data && typeof req.body.data === 'object' ? req.body.data : req.body || {}
    if (!inspectionId) return res.status(400).json({ success: false, message: 'Invalid inspection id' })

    const table = await detectFirstExistingTable(['substructure_pilers'])
    if (!table) return res.status(404).json({ success: false, message: 'Substructure piler table not found' })

    const [metaRows] = await pool.query(
      `SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT, DATA_TYPE, COLUMN_TYPE
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [table]
    )
    const allowed = new Set((metaRows || []).map((r) => r.COLUMN_NAME))
    const patch = {}
    for (const [k, v] of Object.entries(dataObj || {})) {
      if (k === 'p_id') continue
      if (!allowed.has(k)) continue
      patch[k] = v
    }

    patch.bridge_inspection_id = inspectionId
    if (allowed.has('status') && (patch.status == null || patch.status === '')) patch.status = 'Active'
    if (allowed.has('updated_by') && patch.updated_by == null) patch.updated_by = req.user?.uid || 0
    if (allowed.has('updated_on') && patch.updated_on == null) patch.updated_on = new Date()
    if (!pId) {
      if (allowed.has('created_by') && patch.created_by == null) patch.created_by = req.user?.uid || 0
      if (allowed.has('created_on') && patch.created_on == null) patch.created_on = new Date()
    }

    for (const c of metaRows || []) {
      const key = c.COLUMN_NAME
      if (!allowed.has(key)) continue
      if (key === 'p_id') continue
      if (patch[key] !== undefined && patch[key] !== null) continue
      const nullable = c.IS_NULLABLE === 'YES'
      const hasDefault = c.COLUMN_DEFAULT !== null
      if (!nullable && !hasDefault) {
        if (String(c.DATA_TYPE).toLowerCase() === 'enum' && typeof c.COLUMN_TYPE === 'string') {
          const m = c.COLUMN_TYPE.match(/enum\((.*)\)/i)
          const first = m?.[1]?.split(',')?.[0]?.trim()?.replace(/^'+|'+$/g, '')
          patch[key] = first || 'Pending'
        } else {
          patch[key] = fallbackValueForDataType(c.DATA_TYPE)
        }
      }
    }

    const cols = Object.keys(patch).filter((k) => k !== 'p_id' && patch[k] !== undefined)
    if (!cols.length) return res.status(400).json({ success: false, message: 'No fields to save' })

    if (pId) {
      const setKeys = cols.filter((c) => c !== 'bridge_inspection_id' && c !== 'created_by' && c !== 'created_on')
      const setSql = setKeys.map((c) => `\`${c}\` = ?`).join(', ')
      const vals = setKeys.map((k) => patch[k])
      const [r] = await pool.query(
        `UPDATE \`${table}\` SET ${setSql} WHERE p_id = ? AND bridge_inspection_id = ?`,
        [...vals, pId, inspectionId]
      )
      return res.json({ success: true, data: { p_id: pId }, updated: (r.affectedRows || 0) > 0 })
    }

    const qCols = cols.map((c) => `\`${c}\``)
    const vals = cols.map((k) => patch[k])
    const [ins] = await pool.query(
      `INSERT INTO \`${table}\` (${qCols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      vals
    )
    return res.json({ success: true, data: { p_id: Number(ins?.insertId || 0) } })
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message })
  }
})

// Soft-close substructure piler row
router.post('/inspection/substructure_piler/close', optionalAuth, async (req, res) => {
  try {
    const id = Number(req.body?.p_id || 0)
    if (!id) return res.status(400).json({ success: false, message: 'Invalid p_id' })
    const table = await detectFirstExistingTable(['substructure_pilers'])
    if (!table) return res.status(404).json({ success: false, message: 'Substructure piler table not found' })
    const [r] = await pool.query(`UPDATE \`${table}\` SET status = 'In-Active' WHERE p_id = ?`, [id])
    return res.json({ success: (r.affectedRows || 0) > 0 })
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message })
  }
})

// Superstructure spans list (best-effort)
router.get('/inspection/superstructure_spans/:inspectionId', async (req, res) => {
  try {
    const id = Number(req.params.inspectionId || 0)
    if (!id) return res.status(400).json({ message: 'Invalid inspection id' })
    const [rows] = await pool.query(
      `SELECT * FROM superstructure
       WHERE bridge_inspection_id = ? AND (status IS NULL OR status = 'Active')
       ORDER BY superstructure_id ASC`,
      [id]
    )
    return res.json(rows || [])
  } catch {
    return res.json([])
  }
})

// Upsert superstructure span row (supports multiple spans per inspection)
router.post('/inspection/superstructure_span/upsert', requireAuth, async (req, res) => {
  try {
    const inspectionId = Number(req.body?.inspectionId || 0)
    const superstructureId = Number(req.body?.superstructureId || 0)
    const dataObj = { ...(req.body?.data || {}) }
    if (!inspectionId) return res.status(400).json({ success: false, message: 'Invalid inspection id' })

    // Legacy PHP column names (form UI uses longer keys)
    if (dataObj.check_excessive_loss_of_camber_and_excessive_deflection != null) {
      dataObj.check_excessive_loss_of_camber = dataObj.check_excessive_loss_of_camber_and_excessive_deflection
      delete dataObj.check_excessive_loss_of_camber_and_excessive_deflection
    }
    if (dataObj.check_spalling_disintegration_or_honey_combing_images != null) {
      dataObj.check_spalling_images = dataObj.check_spalling_disintegration_or_honey_combing_images
      delete dataObj.check_spalling_disintegration_or_honey_combing_images
    }
    if (dataObj.check_excessive_loss_of_camber_and_excessive_deflection_images != null) {
      dataObj.check_excessive_loss_of_camber_images = dataObj.check_excessive_loss_of_camber_and_excessive_deflection_images
      delete dataObj.check_excessive_loss_of_camber_and_excessive_deflection_images
    }
    if (!dataObj.superstructure_name && dataObj.name_of_span) {
      dataObj.superstructure_name = dataObj.name_of_span
    }

    const cfg = INSPECTION_COMPONENTS.superstructure
    const [metaRows] = await pool.query(
      `SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT, DATA_TYPE, COLUMN_TYPE
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [cfg.table]
    )
    const resolvedPk = await resolveInspectionComponentPk(cfg, metaRows)
    const allowed = new Set(metaRows.map((r) => r.COLUMN_NAME))
    const patch = Object.fromEntries(Object.entries(dataObj).filter(([k]) => allowed.has(k)))

    patch.bridge_inspection_id = inspectionId
    if (allowed.has('status') && (patch.status == null || patch.status === '')) {
      patch.status = 'Active'
    }
    if (allowed.has('created_by') && !superstructureId) patch.created_by = Number(req.user?.uid || 0)
    if (allowed.has('created_on') && !superstructureId) patch.created_on = new Date()
    if (allowed.has('updated_by')) patch.updated_by = Number(req.user?.uid || 0)
    if (allowed.has('updated_on')) patch.updated_on = new Date()

    for (const c of metaRows) {
      const key = c.COLUMN_NAME
      if (!allowed.has(key)) continue
      if (key === resolvedPk) continue
      if (patch[key] !== undefined && patch[key] !== null) continue
      const nullable = c.IS_NULLABLE === 'YES'
      const hasDefault = c.COLUMN_DEFAULT !== null
      if (!nullable && !hasDefault) {
        if (String(c.DATA_TYPE).toLowerCase() === 'enum' && typeof c.COLUMN_TYPE === 'string') {
          const m = c.COLUMN_TYPE.match(/enum\((.*)\)/i)
          const first = m?.[1]?.split(',')?.[0]?.trim()?.replace(/^'+|'+$/g, '')
          patch[key] = first || 'Pending'
        } else {
          patch[key] = fallbackValueForDataType(c.DATA_TYPE)
        }
      }
    }

    const cols = Object.keys(patch).filter((k) => k !== resolvedPk && patch[k] !== undefined)
    const qCols = cols.map((c) => `\`${c}\``)
    const vals = cols.map((k) => patch[k])

    if (superstructureId) {
      const setKeys = cols.filter((c) => c !== 'bridge_inspection_id' && c !== 'created_by' && c !== 'created_on')
      const setClause = setKeys.map((c) => `\`${c}\` = ?`).join(', ')
      await pool.query(
        `UPDATE \`${cfg.table}\` SET ${setClause} WHERE \`${resolvedPk}\` = ? AND bridge_inspection_id = ?`,
        [...setKeys.map((k) => patch[k]), superstructureId, inspectionId]
      )
      return res.json({ success: true, data: { superstructure_id: superstructureId } })
    }

    const [ins] = await pool.query(
      `INSERT INTO \`${cfg.table}\` (${qCols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      vals
    )
    const insertedId = Number(ins?.insertId || 0)

    await pool.query(
      `UPDATE bridge_inspection SET \`${cfg.flag}\` = 'Yes', updated_by = ?, upadted_on = CURDATE() WHERE bridge_inspection_id = ?`,
      [req.user?.uid || 0, inspectionId]
    )

    return res.json({ success: true, data: { superstructure_id: insertedId } })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ success: false, message: e.message })
  }
})

// Superstructure girders per span (best-effort)
router.get('/inspection/superstructure_girders/:inspectionId/:superstructureId', async (req, res) => {
  try {
    const inspectionId = Number(req.params.inspectionId || 0)
    const superstructureId = Number(req.params.superstructureId || 0)
    if (!inspectionId || !superstructureId) return res.status(400).json({ message: 'Invalid parameters' })
    const [rows] = await pool.query(
      'SELECT * FROM superstructure_no_of_girders WHERE bridge_inspection_id = ? AND superstructure_id = ? ORDER BY sg_id ASC',
      [inspectionId, superstructureId]
    )
    return res.json(rows || [])
  } catch {
    return res.json([])
  }
})

router.post('/inspection/superstructure_girders/upsert', requireAuth, async (req, res) => {
  try {
    const inspectionId = Number(req.body?.inspectionId || 0)
    const superstructureId = Number(req.body?.superstructureId || 0)
    const girders = Array.isArray(req.body?.girders) ? req.body.girders : []
    if (!inspectionId || !superstructureId) {
      return res.status(400).json({ success: false, message: 'Invalid inspectionId or superstructureId' })
    }

    await pool.query(
      'DELETE FROM superstructure_no_of_girders WHERE bridge_inspection_id = ? AND superstructure_id = ?',
      [inspectionId, superstructureId]
    )

    const uid = Number(req.user?.uid || 0)
    const today = new Date().toISOString().slice(0, 10)
    const numeric = (v) => {
      const n = Number(v)
      return Number.isFinite(n) ? n : 0
    }

    for (const g of girders) {
      const girderName = String(g.girder_name || g.name || '').trim()
      const condition = String(g.condition_of_girder || g.condition || '').trim()
      if (!girderName && !condition) continue
      await pool.query(
        `INSERT INTO superstructure_no_of_girders
         (bridge_inspection_id, superstructure_id, girder_name, condition_of_girder,
          girder_length, girder_width, girder_depth, girder_distance_x, girder_distance_y, created_by, created_on)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [
          inspectionId,
          superstructureId,
          girderName || 'Girder',
          condition || '',
          numeric(g.girder_length),
          numeric(g.girder_width),
          numeric(g.girder_depth),
          numeric(g.girder_distance_x),
          numeric(g.girder_distance_y),
          uid,
          today,
        ]
      )
    }

    return res.json({ success: true })
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message })
  }
})

async function trySelectFirstOk(pool, queries) {
  for (const q of queries) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const [rows] = await pool.query(q.sql, q.params || [])
      return rows || []
    } catch {
      // keep trying
    }
  }
  return []
}

async function getTableColumns(schemaName, tableName) {
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [schemaName, tableName]
  )
  return new Set((rows || []).map((r) => r.COLUMN_NAME))
}

async function detectFirstExistingTable(tables) {
  for (const t of tables) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await pool.query(`SELECT 1 FROM \`${t}\` LIMIT 1`)
      return t
    } catch {
      // continue
    }
  }
  return null
}

async function detectExpansionPilerTableAndRow(expansionPilersId) {
  const candidates = ['expansion_joints_pilers', 'expansion_joint_pilers', 'expansion_pilers']
  for (const table of candidates) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const [rows] = await pool.query(
        `SELECT * FROM \`${table}\` WHERE expansion_pilers_id = ? LIMIT 1`,
        [expansionPilersId]
      )
      if (rows?.[0]) return { table, row: rows[0] }
    } catch {
      // ignore
    }
  }
  // fallback: if a table exists but row not found, still return the first existing table
  const t = await detectFirstExistingTable(candidates)
  return { table: t, row: null }
}

async function detectWearingCoatTableAndRow(wearingCoatId) {
  const candidates = ['wearing_coat']
  for (const table of candidates) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const [rows] = await pool.query(
        `SELECT * FROM \`${table}\` WHERE wearing_coat_id = ? LIMIT 1`,
        [wearingCoatId]
      )
      if (rows?.[0]) return { table, row: rows[0] }
    } catch {
      // ignore
    }
  }
  const t = await detectFirstExistingTable(candidates)
  return { table: t, row: null }
}

// Expansion joint inspection rows (PHP parity: Inspection_model::getExpansionList)
router.get('/inspection/expansion_joints/:inspectionId', optionalAuth, async (req, res) => {
  try {
    const id = Number(req.params.inspectionId || 0)
    if (!id) return res.status(400).json({ success: false, message: 'Invalid inspection id' })
    const [rows] = await pool.query(
      `SELECT * FROM expansion_joint
       WHERE bridge_inspection_id = ?
         AND (status IS NULL OR status <> 'Deleted')
       ORDER BY expansion_joint_id ASC`,
      [id]
    )
    return res.json(rows || [])
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message })
  }
})

router.get('/inspection/expansion_joint/:inspectionId/:expansionJointId', optionalAuth, async (req, res) => {
  try {
    const inspectionId = Number(req.params.inspectionId || 0)
    const expansionJointId = Number(req.params.expansionJointId || 0)
    if (!inspectionId || !expansionJointId) {
      return res.status(400).json({ success: false, message: 'Invalid inspection or expansion joint id' })
    }
    const [rows] = await pool.query(
      `SELECT * FROM expansion_joint
       WHERE bridge_inspection_id = ? AND expansion_joint_id = ?
       LIMIT 1`,
      [inspectionId, expansionJointId]
    )
    return res.json({ success: true, data: rows[0] || null })
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message })
  }
})

router.post('/inspection/expansion_joint/upsert', optionalAuth, async (req, res) => {
  try {
    const inspectionId = Number(req.body?.inspectionId || req.body?.bridge_inspection_id || 0)
    const expansionJointId = Number(req.body?.expansion_joint_id || 0)
    const dataObj = req.body?.data && typeof req.body.data === 'object' ? req.body.data : req.body || {}
    if (!inspectionId) return res.status(400).json({ success: false, message: 'Invalid inspection id' })

    const table = 'expansion_joint'
    const [metaRows] = await pool.query(
      `SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT, DATA_TYPE, COLUMN_TYPE
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [table]
    )
    const allowed = new Set((metaRows || []).map((r) => r.COLUMN_NAME))
    const patch = {}
    for (const [k, v] of Object.entries(dataObj || {})) {
      if (k === 'expansion_joint_id') continue
      if (k === 'expansion_joint_name' && allowed.has('expansion_name')) {
        patch.expansion_name = v
        continue
      }
      if (!allowed.has(k)) continue
      patch[k] = v
    }

    patch.bridge_inspection_id = inspectionId
    if (allowed.has('status') && (patch.status == null || patch.status === '')) patch.status = 'Pending'
    if (allowed.has('updated_by') && patch.updated_by == null) patch.updated_by = req.user?.uid || 0
    if (allowed.has('updated_on') && patch.updated_on == null) patch.updated_on = new Date()
    if (!expansionJointId) {
      if (allowed.has('created_by') && patch.created_by == null) patch.created_by = req.user?.uid || 0
      if (allowed.has('created_on') && patch.created_on == null) patch.created_on = new Date()
    }

    for (const c of metaRows || []) {
      const key = c.COLUMN_NAME
      if (!allowed.has(key)) continue
      if (key === 'expansion_joint_id') continue
      if (patch[key] !== undefined && patch[key] !== null) continue
      const nullable = c.IS_NULLABLE === 'YES'
      const hasDefault = c.COLUMN_DEFAULT !== null
      if (!nullable && !hasDefault) {
        if (String(c.DATA_TYPE).toLowerCase() === 'enum' && typeof c.COLUMN_TYPE === 'string') {
          const m = c.COLUMN_TYPE.match(/enum\((.*)\)/i)
          const first = m?.[1]?.split(',')?.[0]?.trim()?.replace(/^'+|'+$/g, '')
          patch[key] = first || 'Pending'
        } else {
          patch[key] = fallbackValueForDataType(c.DATA_TYPE)
        }
      }
    }

    const cols = Object.keys(patch).filter((k) => k !== 'expansion_joint_id' && patch[k] !== undefined)
    if (!cols.length) return res.status(400).json({ success: false, message: 'No fields to save' })

    if (expansionJointId) {
      const setKeys = cols.filter((c) => c !== 'bridge_inspection_id' && c !== 'created_by' && c !== 'created_on')
      const setSql = setKeys.map((c) => `\`${c}\` = ?`).join(', ')
      const vals = setKeys.map((k) => patch[k])
      const [r] = await pool.query(
        `UPDATE \`${table}\` SET ${setSql} WHERE expansion_joint_id = ? AND bridge_inspection_id = ?`,
        [...vals, expansionJointId, inspectionId]
      )
      return res.json({
        success: true,
        data: { expansion_joint_id: expansionJointId },
        updated: (r.affectedRows || 0) > 0,
      })
    }

    const qCols = cols.map((c) => `\`${c}\``)
    const vals = cols.map((k) => patch[k])
    const [ins] = await pool.query(
      `INSERT INTO \`${table}\` (${qCols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      vals
    )
    const newId = Number(ins?.insertId || 0)
    const [bridgeInspectionFlagRows] = await pool.query(
      `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'bridge_inspection'
         AND COLUMN_NAME = 'expansion_joint'`
    )
    if (bridgeInspectionFlagRows.length) {
      await pool.query(
        `UPDATE bridge_inspection
         SET expansion_joint = 'Yes', updated_by = ?, upadted_on = CURDATE()
         WHERE bridge_inspection_id = ?`,
        [req.user?.uid || 0, inspectionId]
      )
    }
    return res.json({ success: true, data: { expansion_joint_id: newId } })
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message })
  }
})

// Expansion joint pilers list (PHP parity: Inspection::add_expansion_joints_pilers)
router.get('/inspection/expansion_pilers/:inspectionId', async (req, res) => {
  const id = Number(req.params.inspectionId || 0)
  if (!id) return res.status(400).json({ message: 'Invalid inspection id' })
  const rows = await trySelectFirstOk(pool, [
    { sql: 'SELECT * FROM expansion_joints_pilers WHERE bridge_inspection_id = ? ORDER BY expansion_pilers_id ASC', params: [id] },
    { sql: 'SELECT * FROM expansion_joint_pilers WHERE bridge_inspection_id = ? ORDER BY expansion_pilers_id ASC', params: [id] },
    { sql: 'SELECT * FROM expansion_pilers WHERE bridge_inspection_id = ? ORDER BY expansion_pilers_id ASC', params: [id] },
  ])
  return res.json(rows)
})

// Expansion distress list for a given piler (PHP parity: Inspection::add_expansion_joints_distress)
router.get('/inspection/expansion_distress/:inspectionId/:expansionPilersId', async (req, res) => {
  try {
    const inspectionId = Number(req.params.inspectionId || 0)
    const expansionPilersId = Number(req.params.expansionPilersId || 0)
    if (!inspectionId || !expansionPilersId) return res.status(400).json({ message: 'Invalid parameters' })
    const [rows] = await pool.query(
      `SELECT * FROM bridge_inspection_distress
       WHERE bridge_inspection_id = ? AND (expansion = ? OR piers = ?)
       ORDER BY id ASC`,
      [inspectionId, expansionPilersId, expansionPilersId]
    )
    return res.json(rows || [])
  } catch (e) {
    return res.status(500).json({ message: e.message })
  }
})

// Wearing coat rows list for inspection
router.get('/inspection/wearing_coat_rows/:inspectionId', async (req, res) => {
  try {
    const id = Number(req.params.inspectionId || 0)
    if (!id) return res.status(400).json({ success: false, message: 'Invalid inspection id' })
    const rows = await trySelectFirstOk(pool, [
      { sql: 'SELECT * FROM wearing_coat WHERE bridge_inspection_id = ? ORDER BY wearing_coat_id ASC', params: [id] },
    ])
    return res.json(rows || [])
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message })
  }
})

// Wearing coat upsert (create/update)
router.post('/inspection/wearing_coat/upsert', optionalAuth, async (req, res) => {
  try {
    const inspectionId = Number(req.body?.inspectionId || req.body?.bridge_inspection_id || 0)
    const wearingCoatId = Number(req.body?.wearing_coat_id || 0)
    const dataObj = req.body?.data && typeof req.body.data === 'object' ? req.body.data : req.body || {}
    if (!inspectionId) return res.status(400).json({ success: false, message: 'Invalid inspection id' })

    const { table: detectedTable } = wearingCoatId
      ? await detectWearingCoatTableAndRow(wearingCoatId)
      : { table: await detectFirstExistingTable(['wearing_coat']) }
    const table = detectedTable || 'wearing_coat'

    const [metaRows] = await pool.query(
      `SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT, DATA_TYPE, COLUMN_TYPE
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [table]
    )
    const allowed = new Set((metaRows || []).map((r) => r.COLUMN_NAME))
    const patch = {}
    for (const [k, v] of Object.entries(dataObj || {})) {
      if (k === 'wearing_coat_id') continue
      if (k === 'details_of_water_proofing_system_if_any' && allowed.has('details_of_water_proofing_system')) {
        patch.details_of_water_proofing_system = v
        continue
      }
      if (!allowed.has(k)) continue
      patch[k] = v
    }

    patch.bridge_inspection_id = inspectionId
    if (allowed.has('status') && (patch.status == null || patch.status === '')) patch.status = 'Active'
    if (allowed.has('updated_by') && patch.updated_by == null) patch.updated_by = req.user?.uid || 0
    if (allowed.has('updated_on') && patch.updated_on == null) patch.updated_on = new Date()
    if (!wearingCoatId) {
      if (allowed.has('created_by') && patch.created_by == null) patch.created_by = req.user?.uid || 0
      if (allowed.has('created_on') && patch.created_on == null) patch.created_on = new Date()
    }

    for (const c of metaRows || []) {
      const key = c.COLUMN_NAME
      if (!allowed.has(key)) continue
      if (key === 'wearing_coat_id') continue
      if (patch[key] !== undefined && patch[key] !== null) continue
      const nullable = c.IS_NULLABLE === 'YES'
      const hasDefault = c.COLUMN_DEFAULT !== null
      if (!nullable && !hasDefault) {
        if (String(c.DATA_TYPE).toLowerCase() === 'enum' && typeof c.COLUMN_TYPE === 'string') {
          const m = c.COLUMN_TYPE.match(/enum\((.*)\)/i)
          const first = m?.[1]?.split(',')?.[0]?.trim()?.replace(/^'+|'+$/g, '')
          patch[key] = first || 'Pending'
        } else {
          patch[key] = fallbackValueForDataType(c.DATA_TYPE)
        }
      }
    }

    const cols = Object.keys(patch).filter((k) => k !== 'wearing_coat_id' && patch[k] !== undefined)
    if (!cols.length) return res.status(400).json({ success: false, message: 'No fields to save' })

    if (wearingCoatId) {
      const setKeys = cols.filter((c) => c !== 'bridge_inspection_id' && c !== 'created_by' && c !== 'created_on')
      const setSql = setKeys.map((c) => `\`${c}\` = ?`).join(', ')
      const vals = setKeys.map((k) => patch[k])
      const [r] = await pool.query(
        `UPDATE \`${table}\` SET ${setSql} WHERE wearing_coat_id = ? AND bridge_inspection_id = ?`,
        [...vals, wearingCoatId, inspectionId]
      )
      return res.json({ success: true, data: { wearing_coat_id: wearingCoatId }, updated: (r.affectedRows || 0) > 0 })
    }

    const qCols = cols.map((c) => `\`${c}\``)
    const vals = cols.map((k) => patch[k])
    const [ins] = await pool.query(
      `INSERT INTO \`${table}\` (${qCols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      vals
    )
    return res.json({ success: true, data: { wearing_coat_id: Number(ins?.insertId || 0) } })
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message })
  }
})

// Wearing coat soft-close
router.post('/inspection/close_wearing_coat', optionalAuth, async (req, res) => {
  try {
    const id = Number(req.body?.wearing_coat_id || 0)
    if (!id) return res.status(400).json({ success: false, message: 'Invalid wearing_coat_id' })
    const { table } = await detectWearingCoatTableAndRow(id)
    if (!table) return res.status(404).json({ success: false, message: 'Wearing coat table not found' })
    const [r] = await pool.query(`UPDATE \`${table}\` SET status = 'In-Active' WHERE wearing_coat_id = ?`, [id])
    return res.json({ success: (r.affectedRows || 0) > 0 })
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message })
  }
})

// PHP parity: Inspection::get_expansion_piler_details (expects POST expansion_pilers_id)
router.post('/inspection/get_expansion_piler_details', async (req, res) => {
  try {
    const expansionPilersId = Number(req.body?.expansion_pilers_id || 0)
    if (!expansionPilersId) return res.status(400).json({ success: false, message: 'Invalid expansion_pilers_id' })
    const { row } = await detectExpansionPilerTableAndRow(expansionPilersId)
    return res.json({ success: true, data: row || null })
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message })
  }
})

// Upsert expansion piler row (create from template or update existing row)
router.post('/inspection/expansion_piler/upsert', optionalAuth, async (req, res) => {
  try {
    const inspectionId = Number(req.body?.inspectionId || req.body?.bridge_inspection_id || 0)
    const expansionPilersId = Number(req.body?.expansion_pilers_id || 0)
    const dataObj = req.body?.data && typeof req.body.data === 'object' ? req.body.data : req.body || {}
    if (!inspectionId) return res.status(400).json({ success: false, message: 'Invalid inspection id' })

    const table = await detectFirstExistingTable(['expansion_joints_pilers', 'expansion_joint_pilers', 'expansion_pilers'])
    if (!table) return res.status(404).json({ success: false, message: 'Expansion piler table not found' })

    const [metaRows] = await pool.query(
      `SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT, DATA_TYPE, COLUMN_TYPE
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [table]
    )
    const allowed = new Set((metaRows || []).map((r) => r.COLUMN_NAME))

    const patch = {}
    for (const [k, v] of Object.entries(dataObj || {})) {
      if (k === 'expansion_pilers_id') continue
      if (!allowed.has(k)) continue
      patch[k] = v
    }

    patch.bridge_inspection_id = inspectionId
    if (allowed.has('status') && (patch.status == null || patch.status === '')) patch.status = 'Active'
    if (allowed.has('updated_by') && patch.updated_by == null) patch.updated_by = req.user?.uid || 0
    if (allowed.has('updated_on') && patch.updated_on == null) patch.updated_on = new Date()
    if (!expansionPilersId) {
      if (allowed.has('created_by') && patch.created_by == null) patch.created_by = req.user?.uid || 0
      if (allowed.has('created_on') && patch.created_on == null) patch.created_on = new Date()
    }

    for (const c of metaRows || []) {
      const key = c.COLUMN_NAME
      if (!allowed.has(key)) continue
      if (key === 'expansion_pilers_id') continue
      if (patch[key] !== undefined && patch[key] !== null) continue
      const nullable = c.IS_NULLABLE === 'YES'
      const hasDefault = c.COLUMN_DEFAULT !== null
      if (!nullable && !hasDefault) {
        if (String(c.DATA_TYPE).toLowerCase() === 'enum' && typeof c.COLUMN_TYPE === 'string') {
          const m = c.COLUMN_TYPE.match(/enum\((.*)\)/i)
          const first = m?.[1]?.split(',')?.[0]?.trim()?.replace(/^'+|'+$/g, '')
          patch[key] = first || 'Pending'
        } else {
          patch[key] = fallbackValueForDataType(c.DATA_TYPE)
        }
      }
    }

    const cols = Object.keys(patch).filter((k) => k !== 'expansion_pilers_id' && patch[k] !== undefined)
    if (!cols.length) return res.status(400).json({ success: false, message: 'No fields to save' })

    if (expansionPilersId) {
      const setKeys = cols.filter((c) => c !== 'bridge_inspection_id' && c !== 'created_by' && c !== 'created_on')
      const setSql = setKeys.map((c) => `\`${c}\` = ?`).join(', ')
      const vals = setKeys.map((k) => patch[k])
      const [r] = await pool.query(
        `UPDATE \`${table}\` SET ${setSql} WHERE expansion_pilers_id = ? AND bridge_inspection_id = ?`,
        [...vals, expansionPilersId, inspectionId]
      )
      return res.json({ success: true, data: { expansion_pilers_id: expansionPilersId }, updated: (r.affectedRows || 0) > 0 })
    }

    const qCols = cols.map((c) => `\`${c}\``)
    const vals = cols.map((k) => patch[k])
    const [ins] = await pool.query(
      `INSERT INTO \`${table}\` (${qCols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      vals
    )
    return res.json({ success: true, data: { expansion_pilers_id: Number(ins?.insertId || 0) } })
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message })
  }
})

// PHP parity: Inspection::update_expansion_piler (expects POST expansion_pilers_id + fields)
router.post('/inspection/update_expansion_piler', optionalAuth, async (req, res) => {
  try {
    const expansionPilersId = Number(req.body?.expansion_pilers_id || 0)
    if (!expansionPilersId) return res.status(400).json({ success: false, message: 'Invalid expansion_pilers_id' })

    const { table } = await detectExpansionPilerTableAndRow(expansionPilersId)
    if (!table) return res.status(404).json({ success: false, message: 'Expansion piler table not found' })

    const dbName = process.env.DB_NAME || process.env.MYSQL_DATABASE || process.env.DATABASE || ''
    if (!dbName) return res.status(500).json({ success: false, message: 'DB_NAME not configured in backend env' })

    const allowedCols = await getTableColumns(dbName, table)
    const body = req.body || {}
    const patch = {}
    for (const [k, v] of Object.entries(body)) {
      if (k === 'expansion_pilers_id') continue
      if (!allowedCols.has(k)) continue
      patch[k] = v
    }
    if (allowedCols.has('updated_by') && patch.updated_by == null) patch.updated_by = req.user?.uid || 0
    if (allowedCols.has('updated_on') && patch.updated_on == null) patch.updated_on = new Date()

    const cols = Object.keys(patch)
    if (!cols.length) return res.json({ success: true, updated: false, message: 'No fields to update' })

    const setSql = cols.map((c) => `\`${c}\` = ?`).join(', ')
    const vals = cols.map((c) => patch[c])
    const [r] = await pool.query(
      `UPDATE \`${table}\` SET ${setSql} WHERE expansion_pilers_id = ?`,
      [...vals, expansionPilersId]
    )
    return res.json({ success: true, updated: (r.affectedRows || 0) > 0 })
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message })
  }
})

// PHP parity: Inspection::inspection_close (soft-delete by setting status=Closed)
router.post('/inspection/inspection_close', optionalAuth, async (req, res) => {
  try {
    const id = Number(req.body?.bridge_inspection_id || 0)
    if (!id) return res.status(400).json({ success: false, message: 'Invalid bridge_inspection_id' })
    await pool.query(`UPDATE bridge_inspection SET status = 'Closed', upadted_on = NOW() WHERE bridge_inspection_id = ?`, [
      id,
    ])
    return res.json({ success: true })
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message })
  }
})

// PHP parity: Inspection::close_distress (marks superstructure span inactive)
router.post('/inspection/close_distress', optionalAuth, async (req, res) => {
  try {
    const id = Number(req.body?.id || 0)
    if (!id) return res.status(400).json({ success: false, message: 'Invalid id' })
    // Best effort: try common table name & pk from legacy schema
    const [r] = await pool
      .query(`UPDATE superstructure SET status = 'In-Active' WHERE superstructure_id = ?`, [id])
      .catch(() => [null])
    if (r && (r.affectedRows || 0) > 0) return res.json({ success: true })
    // Fallback: some schemas use spans table
    const [r2] = await pool
      .query(`UPDATE superstructure_spans SET status = 'In-Active' WHERE superstructure_id = ?`, [id])
      .catch(() => [null])
    return res.json({ success: !!(r2 && (r2.affectedRows || 0) > 0) })
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message })
  }
})

// PHP parity: Inspection::expansion_joint_close_pilers (mark piler inactive)
router.post('/inspection/expansion_joint_close_pilers', optionalAuth, async (req, res) => {
  try {
    const id = Number(req.body?.expansion_pilers_id || 0)
    if (!id) return res.status(400).json({ success: false, message: 'Invalid expansion_pilers_id' })
    const { table } = await detectExpansionPilerTableAndRow(id)
    if (!table) return res.status(404).json({ success: false, message: 'Expansion piler table not found' })
    const [r] = await pool.query(`UPDATE \`${table}\` SET status = 'In-Active' WHERE expansion_pilers_id = ?`, [id])
    return res.json({ success: (r.affectedRows || 0) > 0 })
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message })
  }
})

// PHP parity: Inspection::download_all_images (zip download of images list)
router.get('/inspection/download_all_images', async (req, res) => {
  try {
    const imagesString = String(req.query.images || '').trim()
    const fieldName = String(req.query.field || 'images').trim() || 'images'
    const uploadPath = String(req.query.path || '').trim()
    if (!imagesString || !uploadPath) return res.status(400).json({ message: 'Missing parameters' })

    // uploadPath from PHP is like "upload/substructure/".
    // We serve from backend `uploadRoot` (backend/upload).
    const safeRel = uploadPath.replace(/^[/\\]+/, '').replace(/\\/g, '/')
    const baseDir = path.join(uploadRoot, safeRel.replace(/^upload\//i, ''))
    const names = imagesString
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)

    // Minimal zip writer (store-only) is complex; use tar.gz instead with correct content-disposition.
    // This still matches "download all images" user goal and works in browsers.
    res.setHeader('Content-Type', 'application/gzip')
    res.setHeader('Content-Disposition', `attachment; filename="${fieldName}_images_${Date.now()}.tar.gz"`)

    const gzip = createGzip()
    gzip.pipe(res)

    // Very small tar builder (ustar) for regular files
    const pad = (n, len) => String(n).padStart(len, '0')
    const writeTarHeader = (name, size) => {
      const buf = Buffer.alloc(512, 0)
      buf.write(name.slice(0, 100), 0, 100, 'utf8')
      buf.write('0000777\0', 100, 8, 'ascii') // mode
      buf.write('0000000\0', 108, 8, 'ascii') // uid
      buf.write('0000000\0', 116, 8, 'ascii') // gid
      buf.write(`${pad(size.toString(8), 11)}\0`, 124, 12, 'ascii')
      buf.write(`${pad(Math.floor(Date.now() / 1000).toString(8), 11)}\0`, 136, 12, 'ascii')
      buf.write('        ', 148, 8, 'ascii') // checksum placeholder
      buf.write('0', 156, 1, 'ascii') // typeflag
      buf.write('ustar\0', 257, 6, 'ascii')
      buf.write('00', 263, 2, 'ascii')
      // checksum
      let sum = 0
      for (let i = 0; i < 512; i++) sum += buf[i]
      buf.write(`${pad(sum.toString(8), 6)}\0 `, 148, 8, 'ascii')
      return buf
    }

    for (const name of names) {
      const filePath = path.join(baseDir, name)
      if (!fs.existsSync(filePath)) continue
      const stat = fs.statSync(filePath)
      if (!stat.isFile()) continue
      const content = fs.readFileSync(filePath)
      gzip.write(writeTarHeader(name, content.length))
      gzip.write(content)
      const padLen = (512 - (content.length % 512)) % 512
      if (padLen) gzip.write(Buffer.alloc(padLen, 0))
    }
    // End of archive: two 512 blocks of zeros
    gzip.end(Buffer.alloc(1024, 0))
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

router.get('/dashboard/scheduled_count', async (_req, res) => {
  const [r] = await pool.query(`SELECT COUNT(*) AS c FROM bridge_inspection WHERE status = 'Pending'`)
  res.json({ count: r[0].c })
})
router.get('/dashboard/ongoing_count', async (_req, res) => {
  const [r] = await pool.query(`SELECT COUNT(*) AS c FROM bridge_inspection WHERE status = 'Confirmed'`)
  res.json({ count: r[0].c })
})
router.get('/dashboard/approved_count', async (_req, res) => {
  const [r] = await pool.query(`SELECT COUNT(*) AS c FROM bridge_inspection WHERE status = 'Approved'`)
  res.json({ count: r[0].c })
})
router.get('/dashboard/rejected_count', async (_req, res) => {
  const [r] = await pool.query(`SELECT COUNT(*) AS c FROM bridge_inspection WHERE bmc_inspection_status = 'Rejected'`)
  res.json({ count: r[0].c })
})
router.get('/dashboard/pending_bridges', async (_req, res) => {
  const [r] = await pool.query(
    `SELECT COUNT(*) AS c FROM bridge b WHERE (b.bmc_status IS NULL OR b.bmc_status NOT IN ('Approved','Rejected')) AND b.status IN ('Completed','Pending')`
  )
  res.json({ count: r[0].c })
})
router.get('/dashboard/approved_bridges', async (_req, res) => {
  const [r] = await pool.query(`SELECT COUNT(*) AS c FROM bridge WHERE bmc_status = 'Approved'`)
  res.json({ count: r[0].c })
})
router.get('/dashboard/rejected_bridges', async (_req, res) => {
  const [r] = await pool.query(`SELECT COUNT(*) AS c FROM bridge WHERE bmc_status = 'Rejected'`)
  res.json({ count: r[0].c })
})

const DASHBOARD_COUNTS_TTL_MS = 10_000
let dashboardCountsCache = {
  ts: 0,
  data: null,
}

async function fetchDashboardCounts() {
  const now = Date.now()
  if (dashboardCountsCache.data && now - dashboardCountsCache.ts < DASHBOARD_COUNTS_TTL_MS) {
    return dashboardCountsCache.data
  }

  const [
    scheduledRows,
    ongoingRows,
    approvedRows,
    rejectedRows,
    pendingApprovalRows,
    approvedForBmcRows,
    pendingBridgeRows,
    approvedBridgeRows,
    rejectedBridgeRows,
    totalBridgeRows,
  ] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS c FROM bridge_inspection WHERE status = 'Pending'`),
    pool.query(`SELECT COUNT(*) AS c FROM bridge_inspection WHERE status = 'Confirmed'`),
    pool.query(`SELECT COUNT(*) AS c FROM bridge_inspection WHERE status = 'Approved'`),
    pool.query(`SELECT COUNT(*) AS c FROM bridge_inspection WHERE bmc_inspection_status = 'Rejected'`),
    pool.query(
      `SELECT COUNT(*) AS c
       FROM bridge_inspection
       WHERE status IN ('Pending', 'Confirmed')
         AND (bmc_inspection_status IS NULL OR TRIM(bmc_inspection_status) = '' OR bmc_inspection_status = 'No')`,
    ),
    pool.query(
      `SELECT COUNT(*) AS c
       FROM bridge_inspection
       WHERE status = 'Approved' AND bmc_inspection_status = 'Approved'`,
    ),
    pool.query(
      `SELECT COUNT(*) AS c FROM bridge b WHERE (b.bmc_status IS NULL OR b.bmc_status NOT IN ('Approved','Rejected')) AND b.status IN ('Completed','Pending')`,
    ),
    pool.query(`SELECT COUNT(*) AS c FROM bridge WHERE bmc_status = 'Approved'`),
    pool.query(`SELECT COUNT(*) AS c FROM bridge WHERE bmc_status = 'Rejected'`),
    pool.query(`SELECT COUNT(*) AS c FROM bridge`),
  ])

  const data = {
    scheduled: Number(scheduledRows?.[0]?.[0]?.c || 0),
    ongoing: Number(ongoingRows?.[0]?.[0]?.c || 0),
    approved: Number(approvedRows?.[0]?.[0]?.c || 0),
    rejected: Number(rejectedRows?.[0]?.[0]?.c || 0),
    pendingInspections: Number(pendingApprovalRows?.[0]?.[0]?.c || 0),
    approvedInspections: Number(approvedForBmcRows?.[0]?.[0]?.c || 0),
    rejectedInspections: Number(rejectedRows?.[0]?.[0]?.c || 0),
    pendingBridges: Number(pendingBridgeRows?.[0]?.[0]?.c || 0),
    approvedBridges: Number(approvedBridgeRows?.[0]?.[0]?.c || 0),
    rejectedBridges: Number(rejectedBridgeRows?.[0]?.[0]?.c || 0),
    totalBridges: Number(totalBridgeRows?.[0]?.[0]?.c || 0),
  }

  dashboardCountsCache = { ts: now, data }
  return data
}

router.get('/dashboard/counts', async (_req, res) => {
  try {
    const data = await fetchDashboardCounts()
    res.json(data)
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

router.get('/dashboard/statistics', async (_req, res) => {
  res.json({ bridges: 0, inspections: 0, message: 'Summary placeholder' })
})
router.get('/dashboard/chainage_wise', async (_req, res) => {
  res.json([])
})
router.get('/dashboard/location_data', async (_req, res) => {
  res.json([])
})

router.get('/inspection/:inspectionId/ratings', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM inspection_component_rating WHERE bridge_inspection_id = ?',
      [req.params.inspectionId]
    )
    res.json(rows)
  } catch (e) {
    res.json([])
  }
})

router.get('/inspection/:inspectionId/rating/:componentType', async (req, res) => {
  try {
    const { inspectionId, componentType } = req.params
    const componentId = req.query.component_id || null
    const params = [inspectionId, componentType]
    let sql =
      'SELECT * FROM inspection_component_rating WHERE bridge_inspection_id = ? AND component_type = ? AND status = "Active"'
    if (componentId) {
      sql += ' AND (foundation_id = ? OR superstructure_id = ? OR expansion_joint_id = ?)'
      params.push(componentId, componentId, componentId)
    }
    sql += ' ORDER BY id DESC LIMIT 1'
    const [rows] = await pool.query(sql, params)
    res.json(rows[0] || null)
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

router.get('/inspection/:inspectionId/bearing_pedestal_totals', async (req, res) => {
  try {
    const inspectionId = Number(req.params.inspectionId || 0)
    if (!inspectionId) {
      return res.status(400).json({ success: false, message: 'inspectionId is required' })
    }
    const [rows] = await pool.query(
      `SELECT (bearing_total + pier_bearing_total) AS total_bearing,
              (pedestal_total + pier_pedestal_total) AS total_pedestal
       FROM bearing_and_pedistal
       WHERE bridge_inspection_id = ?
       ORDER BY bearing_and_pedistal_id DESC
       LIMIT 1`,
      [inspectionId]
    )
    const row = rows[0] || {}
    return res.json({
      success: true,
      total_bearing: Number(row.total_bearing || 0),
      total_pedestal: Number(row.total_pedestal || 0),
    })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ success: false, message: e.message })
  }
})

const upsertBearingPedestalComponentRating = async ({
  bridgeInspectionId,
  componentType,
  formNo,
  ratingId,
  bearingAndPedestalName,
  bearingType = '',
  userId = 0,
}) => {
  const [existing] = await pool.query(
    `SELECT id FROM inspection_component_rating
     WHERE bridge_inspection_id = ? AND component_type = ? AND form_no = ?
     ORDER BY id DESC LIMIT 1`,
    [bridgeInspectionId, componentType, formNo]
  )

  if (existing[0]) {
    await pool.query(
      `UPDATE inspection_component_rating
       SET rating_id = ?, bearing_and_pedestal_name = ?, bearing_type = ?, status = 'Active',
           updated_by = ?, updated_on = NOW()
       WHERE id = ?`,
      [ratingId, bearingAndPedestalName, bearingType, Number(userId || 0), existing[0].id]
    )
    return { id: existing[0].id, updated: true }
  }

  const actorId = Number(userId || 0)
  const [r] = await pool.query(
    `INSERT INTO inspection_component_rating
     (bridge_inspection_id, rating_id, component_type, bearing_and_pedestal_name, bearing_type, component_name,
      foundation_id, superstructure_id, expansion_joint_id, form_no, status, created_by, created_on, updated_by, updated_on, repair_methodology)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NOW(),?,NOW(),?)`,
    [
      bridgeInspectionId,
      ratingId,
      componentType,
      bearingAndPedestalName,
      bearingType,
      '',
      0,
      0,
      0,
      formNo,
      'Active',
      actorId,
      actorId,
      '',
    ]
  )
  return { id: r.insertId, created: true }
}

const upsertBearingRatingDetails = async ({
  bridgeInspectionId,
  componentType,
  formNo,
  bearingName,
  bearingType,
  bearingCondition,
  userId = 0,
}) => {
  const [existing] = await pool.query(
    `SELECT id FROM bearing_rating_details
     WHERE bridge_inspection_id = ? AND component_type = ? AND form_no = ?
     ORDER BY id DESC LIMIT 1`,
    [bridgeInspectionId, componentType, formNo]
  )

  if (existing[0]) {
    await pool.query(
      `UPDATE bearing_rating_details
       SET bearing_name = ?, bearing_type = ?, bearing_condition = ?, updated_by = ?, updated_on = NOW()
       WHERE id = ?`,
      [bearingName, bearingType, bearingCondition, userId, existing[0].id]
    )
    return existing[0].id
  }

  const [r] = await pool.query(
    `INSERT INTO bearing_rating_details
     (bridge_inspection_id, component_type, form_no, bearing_name, bearing_type, bearing_condition, created_by, created_on, updated_by, updated_on)
     VALUES (?,?,?,?,?,?,?,NOW(),?,NOW())`,
    [bridgeInspectionId, componentType, formNo, bearingName, bearingType, bearingCondition, Number(userId || 0), Number(userId || 0)]
  )
  return r.insertId
}

router.post('/inspection/save_pedestal_rating', optionalAuth, async (req, res) => {
  try {
    const body = req.body || {}
    const bridgeInspectionId = Number(body.bridge_inspection_id || body.inspection_id || 0)
    const componentType = String(body.component_type || 'Pedestal').trim()
    const formNo = Number(body.form_no || 0)
    const ratingId = Number(body.rating ?? body.rating_id ?? 0)
    const bearingAndPedestalName = String(body.bearing_and_pedestal_name || '').trim()
    if (!bridgeInspectionId || !formNo || !ratingId || !bearingAndPedestalName) {
      return res.status(400).json({
        success: false,
        status: 'error',
        message: 'bridge_inspection_id, form_no, rating, and bearing_and_pedestal_name are required',
      })
    }

    const result = await upsertBearingPedestalComponentRating({
      bridgeInspectionId,
      componentType,
      formNo,
      ratingId,
      bearingAndPedestalName,
      userId: req.user?.uid || 0,
    })

    return res.json({
      success: true,
      status: 'success',
      message: result.updated ? 'Pedestal Rating updated successfully' : 'Pedestal Rating added successfully',
      id: result.id,
      updated: Boolean(result.updated),
      created: Boolean(result.created),
    })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ success: false, status: 'error', message: e.message })
  }
})

router.post('/inspection/save_bearing_rating', optionalAuth, async (req, res) => {
  try {
    const body = req.body || {}
    const bridgeInspectionId = Number(body.bridge_inspection_id || body.inspection_id || 0)
    const componentType = String(body.component_type || 'bearing').trim()
    const formNo = Number(body.form_no || 0)
    const ratingId = Number(body.rating ?? body.rating_id ?? 0)
    const bearingAndPedestalName = String(body.bearing_and_pedestal_name || '').trim()
    const bearingType = String(body.bearing_type || '').trim()
    const bearingCondition = String(body.bearing_condition || '').trim()
    if (!bridgeInspectionId || !formNo || !ratingId || !bearingAndPedestalName || !bearingType) {
      return res.status(400).json({
        success: false,
        status: 'error',
        message: 'bridge_inspection_id, form_no, rating, bearing_and_pedestal_name, and bearing_type are required',
      })
    }

    const result = await upsertBearingPedestalComponentRating({
      bridgeInspectionId,
      componentType,
      formNo,
      ratingId,
      bearingAndPedestalName,
      bearingType,
      userId: req.user?.uid || 0,
    })

    await upsertBearingRatingDetails({
      bridgeInspectionId,
      componentType,
      formNo,
      bearingName: bearingAndPedestalName,
      bearingType,
      bearingCondition,
      userId: req.user?.uid || 0,
    })

    return res.json({
      success: true,
      status: 'success',
      message: result.updated ? 'Bearing Rating updated successfully' : 'Bearing Rating added successfully',
      id: result.id,
      updated: Boolean(result.updated),
      created: Boolean(result.created),
      bearing_condition: bearingCondition,
    })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ success: false, status: 'error', message: e.message })
  }
})

router.post('/inspection/save_substructure_rating', optionalAuth, async (req, res) => {
  try {
    const body = req.body || {}
    const bridgeInspectionId = Number(body.bridge_inspection_id || body.inspection_id || 0)
    const componentType = String(body.component_type || 'substructure').trim()
    const componentName = String(body.component_name || '').trim()
    const ratingId = Number(body.rating ?? body.rating_id ?? 0)
    if (!bridgeInspectionId || !componentName || !ratingId) {
      return res.status(400).json({ success: false, status: 'error', message: 'bridge_inspection_id, component_name, and rating are required' })
    }

    const [existing] = await pool.query(
      `SELECT id FROM inspection_component_rating
       WHERE bridge_inspection_id = ? AND component_type = ? AND component_name = ?
       ORDER BY id DESC LIMIT 1`,
      [bridgeInspectionId, componentType, componentName]
    )

    if (existing[0]) {
      await pool.query(
        `UPDATE inspection_component_rating
         SET rating_id = ?, status = 'Active', updated_by = ?, updated_on = NOW()
         WHERE id = ?`,
        [ratingId, req.user?.uid || 0, existing[0].id]
      )
      return res.json({
        success: true,
        status: 'success',
        message: 'Substructure Rating updated successfully',
        id: existing[0].id,
        updated: true,
      })
    }

    const [r] = await pool.query(
      `INSERT INTO inspection_component_rating
       (bridge_inspection_id, rating_id, component_type, bearing_and_pedestal_name, bearing_type, component_name,
        foundation_id, superstructure_id, expansion_joint_id, form_no, status, created_by, created_on, updated_by, updated_on, repair_methodology)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NOW(),?,?,?)`,
      [
        bridgeInspectionId,
        ratingId,
        componentType,
        '',
        '',
        componentName,
        0,
        0,
        0,
        0,
        'Active',
        req.user?.uid || 0,
        req.user?.uid || 0,
        new Date(),
        '',
      ]
    )
    return res.json({
      success: true,
      status: 'success',
      message: 'Substructure Rating added successfully',
      id: r.insertId,
      created: true,
    })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ success: false, status: 'error', message: e.message })
  }
})

router.post('/inspection/:inspectionId/rating', optionalAuth, async (req, res) => {
  try {
    const { inspectionId } = req.params
    const body = req.body || {}
    const ratingId = Number(body.rating_id || 0)
    const componentType = String(body.component_type || '').trim()
    if (!ratingId || !componentType) {
      return res.status(400).json({ message: 'rating_id and component_type are required' })
    }
    const normalizedType = componentType.toLowerCase()
    const foundationId = Number(body.foundation_id || 0)
    const superstructureId = Number(body.superstructure_id || 0)
    const expansionJointId = Number(body.expansion_joint_id || body.component_id || 0)
    let scopedWhere = ''
    const scopedParams = []
    if (normalizedType === 'foundation' && foundationId > 0) {
      scopedWhere = ' AND foundation_id = ?'
      scopedParams.push(foundationId)
    } else if (normalizedType === 'superstructure' && superstructureId > 0) {
      scopedWhere = ' AND superstructure_id = ?'
      scopedParams.push(superstructureId)
    } else if ((normalizedType === 'expansion' || normalizedType === 'expansion_joint') && expansionJointId > 0) {
      scopedWhere = ' AND expansion_joint_id = ?'
      scopedParams.push(expansionJointId)
    }
    const [existing] = await pool.query(
      `SELECT id FROM inspection_component_rating
       WHERE bridge_inspection_id = ? AND component_type = ? AND status = 'Active'
       ${scopedWhere}
       ORDER BY id DESC LIMIT 1`,
      [inspectionId, componentType, ...scopedParams]
    )
    if (existing[0]) {
      await pool.query(
        `UPDATE inspection_component_rating
         SET rating_id = ?, updated_by = ?, updated_on = NOW()
         WHERE id = ?`,
        [ratingId, req.user?.uid || 0, existing[0].id]
      )
      return res.json({ success: true, id: existing[0].id, updated: true })
    }
    const [r] = await pool.query(
      `INSERT INTO inspection_component_rating
       (bridge_inspection_id, rating_id, component_type, bearing_and_pedestal_name, bearing_type, component_name,
        foundation_id, superstructure_id, expansion_joint_id, form_no, status, created_by, created_on, updated_by, updated_on, repair_methodology)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NOW(),?,?,?)`,
      [
        inspectionId,
        ratingId,
        componentType,
        body.bearing_and_pedestal_name || '',
        body.bearing_type || '',
        body.component_name || componentType,
        Number(body.foundation_id || req.query?.component_id || 0),
        Number(body.superstructure_id || req.query?.component_id || 0),
        Number(body.expansion_joint_id || body.component_id || req.query?.component_id || 0),
        Number(body.form_no || 0),
        'Active',
        req.user?.uid || 0,
        req.user?.uid || 0,
        new Date(),
        body.repair_methodology || '',
      ]
    )
    res.json({ success: true, id: r.insertId, created: true })
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

router.get('/inspection/:inspectionId/overall_rating', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM overall_bridge_rating
       WHERE bridge_inspection_id = ? AND status = 'Active'
       ORDER BY id DESC LIMIT 1`,
      [req.params.inspectionId]
    )
    res.json(rows[0] || null)
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

router.post('/inspection/:inspectionId/overall_rating', optionalAuth, async (req, res) => {
  try {
    const ratingId = Number(req.body?.rating_id || 0)
    if (!ratingId) return res.status(400).json({ message: 'rating_id is required' })
    const inspectionId = req.params.inspectionId
    const [existing] = await pool.query(
      `SELECT id FROM overall_bridge_rating
       WHERE bridge_inspection_id = ? AND status = 'Active'
       ORDER BY id DESC LIMIT 1`,
      [inspectionId]
    )
    if (existing[0]) {
      await pool.query(
        `UPDATE overall_bridge_rating SET rating_id = ?, updated_by = ?, updated_on = NOW() WHERE id = ?`,
        [ratingId, req.user?.uid || 0, existing[0].id]
      )
      return res.json({ success: true, id: existing[0].id, updated: true })
    }
    const [r] = await pool.query(
      `INSERT INTO overall_bridge_rating (bridge_inspection_id, rating_id, bmc_rejected, status, created_by, created_on, updated_by, updated_on)
       VALUES (?,?,?,?,?,NOW(),?,NOW())`,
      [inspectionId, ratingId, 'No', 'Active', req.user?.uid || 0, req.user?.uid || 0]
    )
    res.json({ success: true, id: r.insertId, created: true })
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

router.get('/inspection/rating_descriptions/:ratingType', async (req, res) => {
  const ratingType = String(req.params?.ratingType || '').trim().toLowerCase()
  if (ratingType === 'overall_bridge_rating') {
    return res.json(OVERALL_BRIDGE_RATING_DESCRIPTIONS)
  }
  if (ratingType === 'approaches_rating' || ratingType === 'subways_rating') {
    return res.json(APPROACHES_RATING_DESCRIPTIONS)
  }
  if (ratingType === 'foundation_rating') {
    return res.json(FOUNDATION_RATING_DESCRIPTIONS)
  }
  if (ratingType === 'bearing_rating') {
    return res.json(bearingRatingDesc)
  }
  if (componentRatingDesc[ratingType]) {
    return res.json(componentRatingDesc[ratingType])
  }
  return res.json(RATING_DESCRIPTION_DEFAULT)
})

for (const sub of [
  'scheduled', 'ongoing', 'approved', 'rejected',
]) {
  router.get(`/inspection/${sub}`, (req, res) => {
    const mode = sub === 'scheduled' ? 'scheduled' : sub === 'ongoing' ? 'ongoing' : sub === 'approved' ? 'approved' : 'rejected'
    return inspectionList(req, res, mode)
  })
}

router.post('/inspection/save_non_structural', requireAuth, async (req, res) => {
  try {
    const b = req.body || {}
    const ALLOWED_NON_STRUCTURAL_TABLE_TYPES = new Map([
      ['approaches', 'approaches'],
      ['wearing coat', 'WEARING COAT'],
      ['drainage spouts and vest holes', 'DRAINAGE SPOUTS AND VEST HOLES'],
      ['handrails, parapets, crash barriers', 'HANDRAILS, PARAPETS, CRASH BARRIERS'],
      ['footpaths', 'FOOTPATHS'],
      ['utilities', 'UTILITIES'],
      ['non-structural elements', 'NON-STRUCTURAL ELEMENTS'],
    ])
    const rawTableType = String(
      b.table_type ||
      b.tableType ||
      b.element_type ||
      b.component_name ||
      b.componentName ||
      'NON-STRUCTURAL ELEMENTS'
    ).trim()
    const tableTypeKey = rawTableType.toLowerCase()
    const tableType = ALLOWED_NON_STRUCTURAL_TABLE_TYPES.get(tableTypeKey)
    if (!tableType) {
      return res.status(400).json({
        success: false,
        message:
          'Invalid table_type. Allowed values: approaches, WEARING COAT, DRAINAGE SPOUTS AND VEST HOLES, HANDRAILS, PARAPETS, CRASH BARRIERS, FOOTPATHS, UTILITIES, NON-STRUCTURAL ELEMENTS',
      })
    }
    const numeric = (v) => {
      const n = Number(v)
      return Number.isFinite(n) ? n : 0
    }
    const nos = (() => {
      if (b.distress_nos === '' || b.nos_value === '' || b.distress_nos == null || b.nos_value == null) return null
      const n = Number(b.distress_nos ?? b.nos_value)
      if (!Number.isFinite(n) || n < 0) return null
      return Math.floor(n)
    })()
    const [r] = await pool.query(
      `INSERT INTO non_structural_distress
       (bridge_inspection_id, table_type, element_type, element_description, distress_type, field_type, name_of_span,
        distress_length, distress_width, distress_depth, distress_nos, distance_of_distress_x, distance_of_distress_y,
        abutment_A1, abutment_A2, piers, spans, foundation, expansion, lhs_distress, rhs_distress,
        condition_rating, material, maintenance_required, priority_level, inspection_notes, images, status,
        created_by, created_on, repair_methodology)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),?)`,
      [
        b.bridge_inspection_id || b.inspection_id || null,
        tableType,
        b.element_type || '',
        b.element_description || '',
        b.distress_type ?? '',
        b.field_type ?? null,
        b.name_of_span ?? null,
        numeric(b.distress_length ?? b.l_value),
        numeric(b.distress_width ?? b.w_value),
        numeric(b.distress_depth ?? b.d_value),
        nos,
        numeric(b.distance_of_distress_x),
        numeric(b.distance_of_distress_y),
        numeric(b.abutment_A1),
        numeric(b.abutment_A2),
        numeric(b.piers),
        numeric(b.spans),
        numeric(b.foundation),
        numeric(b.expansion),
        numeric(b.lhs_distress),
        numeric(b.rhs_distress),
        b.condition_rating ?? null,
        b.material ?? '',
        b.maintenance_required ?? '',
        b.priority_level ?? '',
        b.inspection_notes ?? '',
        Array.isArray(b.images) ? b.images.filter(Boolean).map((x) => String(x).trim()).join(',') : (b.images || null),
        'Active',
        req.user?.uid || null,
        b.repair_methodology ?? '',
      ]
    )
    res.json({ success: true, id: r.insertId })
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})
router.get('/inspection/non_structural/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, bridge_inspection_id, table_type, element_type, element_description, distress_type, field_type, name_of_span,
              distress_length, distress_width, distress_depth, distress_nos, distance_of_distress_x, distance_of_distress_y,
              abutment_A1, abutment_A2, piers, spans, foundation, expansion, lhs_distress, rhs_distress,
              condition_rating, material, maintenance_required, priority_level, inspection_notes, images, status,
              created_by, created_on, updated_by, updated_on, repair_methodology
       FROM non_structural_distress
       WHERE bridge_inspection_id = ? AND status = 'Active'
       ORDER BY id DESC`,
      [req.params.id]
    )
    res.json(rows)
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})
router.put('/inspection/non_structural/:id', requireAuth, async (req, res) => {
  try {
    const b = req.body || {}
    const ALLOWED_NON_STRUCTURAL_TABLE_TYPES = new Map([
      ['approaches', 'approaches'],
      ['wearing coat', 'WEARING COAT'],
      ['drainage spouts and vest holes', 'DRAINAGE SPOUTS AND VEST HOLES'],
      ['handrails, parapets, crash barriers', 'HANDRAILS, PARAPETS, CRASH BARRIERS'],
      ['footpaths', 'FOOTPATHS'],
      ['utilities', 'UTILITIES'],
      ['non-structural elements', 'NON-STRUCTURAL ELEMENTS'],
    ])
    const rawTableType = String(
      b.table_type || b.tableType || b.element_type || b.component_name || b.componentName || 'NON-STRUCTURAL ELEMENTS'
    ).trim()
    const tableTypeKey = rawTableType.toLowerCase()
    const tableType = ALLOWED_NON_STRUCTURAL_TABLE_TYPES.get(tableTypeKey)
    if (!tableType) {
      return res.status(400).json({
        success: false,
        message:
          'Invalid table_type. Allowed values: approaches, WEARING COAT, DRAINAGE SPOUTS AND VEST HOLES, HANDRAILS, PARAPETS, CRASH BARRIERS, FOOTPATHS, UTILITIES, NON-STRUCTURAL ELEMENTS',
      })
    }
    const numeric = (v) => {
      const n = Number(v)
      return Number.isFinite(n) ? n : 0
    }
    const nos = (() => {
      if (b.distress_nos === '' || b.nos_value === '' || b.distress_nos == null || b.nos_value == null) return null
      const n = Number(b.distress_nos ?? b.nos_value)
      if (!Number.isFinite(n) || n < 0) return null
      return Math.floor(n)
    })()
    const imagesPayload = Array.isArray(b.images)
      ? b.images.filter(Boolean).map((x) => String(x).trim()).join(',')
      : b.images ?? null
    await pool.query(
      `UPDATE non_structural_distress
       SET table_type = ?, element_type = ?, element_description = ?, distress_type = ?, field_type = ?, name_of_span = ?,
           distress_length = ?, distress_width = ?, distress_depth = ?, distress_nos = ?,
           distance_of_distress_x = ?, distance_of_distress_y = ?,
           abutment_A1 = ?, abutment_A2 = ?, piers = ?, spans = ?, foundation = ?, expansion = ?, lhs_distress = ?, rhs_distress = ?,
           condition_rating = ?, material = ?, maintenance_required = ?, priority_level = ?, inspection_notes = ?, images = ?,
           repair_methodology = ?, updated_by = ?, updated_on = NOW()
       WHERE id = ?`,
      [
        tableType,
        b.element_type || '',
        b.element_description || '',
        b.distress_type || '',
        b.field_type ?? null,
        b.name_of_span ?? null,
        numeric(b.distress_length ?? b.l_value),
        numeric(b.distress_width ?? b.w_value),
        numeric(b.distress_depth ?? b.d_value),
        nos,
        numeric(b.distance_of_distress_x),
        numeric(b.distance_of_distress_y),
        numeric(b.abutment_A1),
        numeric(b.abutment_A2),
        numeric(b.piers),
        numeric(b.spans),
        numeric(b.foundation),
        numeric(b.expansion),
        numeric(b.lhs_distress),
        numeric(b.rhs_distress),
        b.condition_rating ?? null,
        b.material ?? '',
        b.maintenance_required ?? '',
        b.priority_level ?? '',
        b.inspection_notes ?? '',
        imagesPayload,
        b.repair_methodology ?? '',
        req.user?.uid || null,
        req.params.id,
      ]
    )
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})
router.delete('/inspection/non_structural/:id', requireAuth, async (req, res) => {
  try {
    await pool.query(
      `UPDATE non_structural_distress SET status = 'Inactive', updated_by = ?, updated_on = NOW()
       WHERE id = ?`,
      [req.user?.uid || null, req.params.id]
    )
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})
router.post('/inspection/non_structural/upload_images', optionalAuth, upload.array('images', 10), async (req, res) => {
  const uploaded = req.files || []
  const files = uploaded.map((f) => f.filename)
  if (!files.length) return res.status(400).json({ status: 'error', message: 'No files selected' })
  const subfolder = normalizeUploadSubfolder(req.query?.folder, 'non_structural_elements')
  for (const f of uploaded) {
    await mirrorUploadRelPath(`upload/${subfolder}/${f.filename}`, uploadRoot)
  }
  res.json({ status: 'success', files, message: 'Images uploaded successfully' })
})
router.get('/inspection/3d-assets/:inspectionId', optionalAuth, async (req, res) => {
  try {
    await ensureInspection3DAssetsTable()
    const inspectionId = Number(req.params.inspectionId || 0)
    if (!inspectionId) return res.status(400).json({ message: 'Invalid inspectionId' })

    const [rows] = await pool.query(
      `SELECT *
       FROM bridge_inspection_3d_assets
       WHERE bridge_inspection_id = ?
       ORDER BY FIELD(asset_type, 'glb', 'panorama', 'distress_icon'), id ASC`,
      [inspectionId]
    )
    res.json({ status: 'success', data: await enrichRowsWithUrls(rows) })
  } catch (e) {
    console.error('3D assets list error:', e)
    res.status(500).json({ message: 'Failed to fetch 3D assets' })
  }
})
router.get('/bridges/:bridgeId/3d-assets', optionalAuth, async (req, res) => {
  try {
    await ensureInspection3DAssetsTable()
    const bridgeId = Number(req.params.bridgeId || 0)
    if (!bridgeId) return res.status(400).json({ message: 'Invalid bridgeId' })

    const [rows] = await pool.query(
      `SELECT *
       FROM bridge_inspection_3d_assets
       WHERE bridge_id = ?
       ORDER BY FIELD(asset_type, 'glb', 'panorama', 'distress_icon'), id ASC`,
      [bridgeId]
    )
    res.json({ status: 'success', data: await enrichRowsWithUrls(rows) })
  } catch (e) {
    console.error('Bridge 3D assets list error:', e)
    res.status(500).json({ message: 'Failed to fetch bridge 3D assets' })
  }
})
router.post('/inspection/3d-assets/upload/:inspectionId', optionalAuth, upload3d.array('files', 20), async (req, res) => {
  try {
    await ensureInspection3DAssetsTable()
    const inspectionId = Number(req.params.inspectionId || 0)
    if (!inspectionId) return res.status(400).json({ message: 'Invalid inspectionId' })

    const assetType = String(req.body?.assetType || '').trim().toLowerCase()
    const validAssetTypes = new Set(['glb', 'panorama', 'distress_icon'])
    if (!validAssetTypes.has(assetType)) {
      return res.status(400).json({ message: 'assetType must be glb, panorama, or distress_icon' })
    }

    const validPanoFaces = new Set(['right', 'left', 'top', 'bottom', 'front', 'back'])
    const panoFaceRaw = String(req.body?.panoFace || '').trim().toLowerCase()
    const panoFace = validPanoFaces.has(panoFaceRaw) ? panoFaceRaw : null

    const files = Array.isArray(req.files) ? req.files : []
    if (!files.length) return res.status(400).json({ message: 'No files uploaded' })

    try {
      assertValid3dUploadFiles(files, assetType)
    } catch (validationErr) {
      return res.status(validationErr.status || 400).json({ message: validationErr.message })
    }

    const bridgeId = await getBridgeIdByInspection(inspectionId)
    if (!bridgeId) return res.status(400).json({ message: 'Inspection is not linked with a valid bridge' })
    const userId = Number(req.user?.uid || req.user?.id || req.user?.userid || 0) || null
    const title = String(req.body?.title || '').trim() || null
    const distressType = String(req.body?.distressType || '').trim() || null
    const distressNote = String(req.body?.distressNote || '').trim() || null
    const distressX = req.body?.distressX === '' || req.body?.distressX == null ? null : Number(req.body?.distressX)
    const distressY = req.body?.distressY === '' || req.body?.distressY == null ? null : Number(req.body?.distressY)
    const distressZ = req.body?.distressZ === '' || req.body?.distressZ == null ? null : Number(req.body?.distressZ)

    const inserted = []
    for (const f of files) {
      const relPath = `upload/inspection_3d_assets/${safeInspectionFolderSegment(inspectionId)}/${f.filename}`
      const [result] = await pool.query(
        `INSERT INTO bridge_inspection_3d_assets
         (bridge_inspection_id, bridge_id, asset_type, pano_face, title, distress_type, distress_note, distress_x, distress_y, distress_z,
          file_name, file_path, original_name, mime_type, size_bytes, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          inspectionId, bridgeId, assetType, panoFace, title, distressType, distressNote, distressX, distressY, distressZ,
          f.filename, relPath, f.originalname || null, f.mimetype || null, f.size || null, userId,
        ]
      )
      await mirrorUploadRelPath(relPath, uploadRoot)
      inserted.push({
        id: result.insertId,
        file_name: f.filename,
        file_path: relPath,
        asset_type: assetType,
        pano_face: panoFace,
      })
    }

    res.json({ status: 'success', data: await enrichRowsWithUrls(inserted), message: '3D assets uploaded successfully' })
  } catch (e) {
    console.error('3D assets upload error:', e)
    res.status(500).json({ message: 'Failed to upload 3D assets' })
  }
})
router.post('/bridges/:bridgeId/3d-assets/upload', optionalAuth, upload3d.array('files', 20), async (req, res) => {
  try {
    await ensureInspection3DAssetsTable()
    const bridgeId = Number(req.params.bridgeId || 0)
    if (!bridgeId) return res.status(400).json({ message: 'Invalid bridgeId' })

    const inspectionId = Number(req.body?.inspectionId || 0) || null
    const assetType = String(req.body?.assetType || '').trim().toLowerCase()
    const validAssetTypes = new Set(['glb', 'panorama', 'distress_icon'])
    if (!validAssetTypes.has(assetType)) {
      return res.status(400).json({ message: 'assetType must be glb, panorama, or distress_icon' })
    }
    const validPanoFaces = new Set(['right', 'left', 'top', 'bottom', 'front', 'back'])
    const panoFaceRaw = String(req.body?.panoFace || '').trim().toLowerCase()
    const panoFace = validPanoFaces.has(panoFaceRaw) ? panoFaceRaw : null
    const files = Array.isArray(req.files) ? req.files : []
    if (!files.length) return res.status(400).json({ message: 'No files uploaded' })

    try {
      assertValid3dUploadFiles(files, assetType)
    } catch (validationErr) {
      return res.status(validationErr.status || 400).json({ message: validationErr.message })
    }

    const userId = Number(req.user?.uid || req.user?.id || req.user?.userid || 0) || null
    const title = String(req.body?.title || '').trim() || null
    const distressType = String(req.body?.distressType || '').trim() || null
    const distressNote = String(req.body?.distressNote || '').trim() || null
    const distressX = req.body?.distressX === '' || req.body?.distressX == null ? null : Number(req.body?.distressX)
    const distressY = req.body?.distressY === '' || req.body?.distressY == null ? null : Number(req.body?.distressY)
    const distressZ = req.body?.distressZ === '' || req.body?.distressZ == null ? null : Number(req.body?.distressZ)

    const inserted = []
    for (const f of files) {
      const relPath = `upload/inspection_3d_assets/${safeInspectionFolderSegment(inspectionId || bridgeId)}/${f.filename}`
      const [result] = await pool.query(
        `INSERT INTO bridge_inspection_3d_assets
         (bridge_inspection_id, bridge_id, asset_type, pano_face, title, distress_type, distress_note, distress_x, distress_y, distress_z,
          file_name, file_path, original_name, mime_type, size_bytes, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          inspectionId, bridgeId, assetType, panoFace, title, distressType, distressNote, distressX, distressY, distressZ,
          f.filename, relPath, f.originalname || null, f.mimetype || null, f.size || null, userId,
        ]
      )
      await mirrorUploadRelPath(relPath, uploadRoot)
      inserted.push({ id: result.insertId, file_name: f.filename, file_path: relPath, asset_type: assetType, pano_face: panoFace })
    }
    res.json({ status: 'success', data: await enrichRowsWithUrls(inserted), message: 'Bridge 3D assets uploaded successfully' })
  } catch (e) {
    console.error('Bridge 3D assets upload error:', e)
    res.status(500).json({ message: 'Failed to upload bridge 3D assets' })
  }
})
router.get('/inspection/bridge_details/:bridgeId', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM bridge WHERE bridge_id = ?', [req.params.bridgeId])
  res.json(rows[0] || {})
})

// Legacy 3D viewer API (threedm / hosted viewer compatibility)
router.get('/bridge-details/:bridgeId', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM bridge WHERE bridge_id = ?', [req.params.bridgeId])
  res.json(rows[0] || {})
})

const model3dRoot = path.join(uploadRoot, 'model_3d')
ensureDir(model3dRoot)

function normalizeModel3dFileName(name) {
  let s = String(name || '').trim()
  if (!s) return ''
  s = s.replace(/(\.glb)+$/gi, '.glb')
  if (!/\.glb$/i.test(s)) s = `${s}.glb`
  return s
}

function listModel3dFileNames() {
  const fromJson = new Set()
  const jsonPath = path.join(model3dRoot, 'models.json')
  if (fs.existsSync(jsonPath)) {
    try {
      const catalog = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
      for (const entry of Array.isArray(catalog?.models) ? catalog.models : []) {
        const file = normalizeModel3dFileName(entry)
        if (file) fromJson.add(file)
      }
    } catch {
      /* ignore */
    }
  }

  let fromDisk = []
  try {
    fromDisk = fs
      .readdirSync(model3dRoot, { withFileTypes: true })
      .filter((d) => d.isFile() && /\.glb(\.glb)?$/i.test(d.name))
      .map((d) => normalizeModel3dFileName(d.name))
  } catch {
    fromDisk = []
  }

  return [...new Set([...fromJson, ...fromDisk])]
}

function resolveModel3dPath(fileName) {
  const normalized = normalizeModel3dFileName(fileName)
  if (!normalized) return null

  const candidates = new Set([
    normalized,
    `${normalized}.glb`,
    normalized.replace(/\.glb$/i, '.glb.glb'),
  ])

  for (const name of candidates) {
    const candidatePath = path.join(model3dRoot, name)
    if (fs.existsSync(candidatePath)) return candidatePath
  }

  let diskNames = []
  try {
    diskNames = fs.readdirSync(model3dRoot)
  } catch {
    return path.join(model3dRoot, normalized)
  }

  const canonical = normalized.toLowerCase()
  const match = diskNames.find((name) => normalizeModel3dFileName(name).toLowerCase() === canonical)
  if (match) return path.join(model3dRoot, match)

  return path.join(model3dRoot, normalized)
}

function loadLfsExpectedBytes(fileName) {
  try {
    const p = path.join(model3dRoot, 'lfs-manifest.json')
    if (!fs.existsSync(p)) return null
    const manifest = JSON.parse(fs.readFileSync(p, 'utf8'))
    const entry = manifest?.files?.find(
      (f) => String(f.file || '').toLowerCase() === String(fileName || '').toLowerCase()
    )
    return entry?.size > 0 ? entry.size : null
  } catch {
    return null
  }
}

/** Reject GLBs that are likely corrupted (e.g. 1 GB file when manifest says 58 MB). */
function isPlausibleGlbSize(fileName, sizeBytes) {
  const expected = loadLfsExpectedBytes(fileName)
  if (!expected) return true
  return sizeBytes >= expected * 0.4 && sizeBytes <= expected * 1.6
}

function startModel3dSync(res) {
  const tokenSet = Boolean(process.env.GITHUB_TOKEN || process.env.GH_TOKEN)
  if (!tokenSet) {
    return res.status(400).json({
      status: 'error',
      message:
        'Set GITHUB_TOKEN in Railway Variables (GitHub PAT with repo scope for planeteyeai/nhit-backend1), redeploy, then open this URL again.',
      githubLfsRepo: process.env.GITHUB_LFS_REPO || 'planeteyeai/nhit-backend1',
      tokenSet: false,
    })
  }
  if (glbEnsureStatus.running) {
    return res.json({
      status: 'running',
      message: 'Download already in progress. Check /model-3d/status',
      tokenSet: true,
      sync: { ...glbEnsureStatus },
    })
  }
  runEnsureGlbAssets().catch((e) => console.error('[model-3d/sync]', e.message))
  return res.json({
    status: 'started',
    message: 'GLB download started (~800 MB). Wait 10–20 min, then open /model-3d/catalog',
    tokenSet: true,
    githubLfsRepo: process.env.GITHUB_LFS_REPO || 'planeteyeai/nhit-backend1',
    statusUrl: '/model-3d/status',
    catalogUrl: '/model-3d/catalog',
  })
}

/** Trigger GitHub LFS download (Railway). GET or POST if catalog is empty. */
router.get('/model-3d/sync', optionalAuth, (req, res) => startModel3dSync(res))
router.post('/model-3d/sync', optionalAuth, (req, res) => startModel3dSync(res))

/** GLB library catalog from upload/model_3d/models.json (disk and/or Railway bucket). */
router.get('/model-3d/catalog', optionalAuth, async (_req, res) => {
  try {
    const entries = listModel3dFileNames()
    const all = []
    for (const entry of entries) {
      const file = normalizeModel3dFileName(entry)
      if (!file) continue
      const fullPath = resolveModel3dPath(file)
      const exists = fs.existsSync(fullPath)
      let sizeBytes = 0
      if (exists) {
        try {
          sizeBytes = fs.statSync(fullPath).size
        } catch {
          sizeBytes = 0
        }
      }
      const validLocal = exists && isValidGlbFile(fullPath) && isPlausibleGlbSize(file, sizeBytes)
      const bucketKey = `upload/model_3d/${file}`
      const inBucket = !validLocal && isStorageEnabled() && (await objectExists(bucketKey))
      const validGlb = validLocal || inBucket
      all.push({
        id: file,
        name: file.replace(/\.glb$/i, '').replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim(),
        file,
        path: `/model-3d/file?name=${encodeURIComponent(file)}`,
        exists: exists || inBucket,
        sizeBytes,
        validGlb,
        bucketOnly: inBucket && !validLocal,
        sizeWarning:
          exists && isValidGlbFile(fullPath) && !isPlausibleGlbSize(file, sizeBytes)
            ? 'File size looks wrong (corrupted copy). Re-download from Git LFS.'
            : undefined,
      })
    }

    const models = all.filter((m) => m.validGlb)
    const skipped = all.length - models.length

    if (
      models.length === 0 &&
      skipped > 0 &&
      (process.env.GITHUB_TOKEN || process.env.GH_TOKEN) &&
      !glbEnsureStatus.running
    ) {
      runEnsureGlbAssets().catch((e) => console.error('[model-3d/catalog] sync', e.message))
    }

    res.json({
      status: 'success',
      models,
      skipped,
      sync: glbEnsureStatus,
      deployHint:
        skipped > 0 && models.length === 0
          ? glbEnsureStatus.running
            ? `Downloading GLBs (${glbEnsureStatus.ready}/${glbEnsureStatus.total})… Wait 10–20 min, then refresh.`
            : !process.env.GITHUB_TOKEN && !process.env.GH_TOKEN
              ? 'Set GITHUB_TOKEN on Railway, redeploy, then open /model-3d/sync in the browser.'
              : 'GLB not ready. Open https://nhit-backend.up.railway.app/model-3d/sync then wait 10–20 min and refresh catalog.'
          : skipped > 0
            ? 'Some catalog entries are missing; only valid GLB files are listed.'
            : undefined,
    })
  } catch (e) {
    console.error('model-3d catalog error:', e)
    res.status(500).json({ message: 'Failed to load model catalog' })
  }
})

/** Debug: list catalog files and whether each is a real GLB on disk (for Railway deploy checks). */
router.get('/model-3d/status', optionalAuth, (_req, res) => {
  try {
    const jsonPath = path.join(model3dRoot, 'models.json')
    let catalog = { models: [] }
    if (fs.existsSync(jsonPath)) {
      catalog = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
    }
    const entries = Array.isArray(catalog.models) ? catalog.models : []
    const files = entries.map((entry) => {
      const file = normalizeModel3dFileName(entry)
      if (!file) return null
      const fullPath = path.join(model3dRoot, file)
      const exists = fs.existsSync(fullPath)
      let sizeBytes = 0
      if (exists) {
        try {
          sizeBytes = fs.statSync(fullPath).size
        } catch {
          sizeBytes = 0
        }
      }
      return {
        file,
        exists,
        sizeBytes,
        validGlb: exists && isValidGlbFile(fullPath),
        likelyLfsPointer: exists && sizeBytes > 0 && sizeBytes < 512 && !isValidGlbFile(fullPath),
      }
    }).filter(Boolean)
    const validCount = files.filter((f) => f.validGlb).length
    const counts = countValidGlbs()
    res.json({
      status: 'success',
      model3dRoot,
      validCount,
      totalInCatalog: files.length,
      files,
      ok: validCount > 0,
      githubTokenSet: Boolean(process.env.GITHUB_TOKEN || process.env.GH_TOKEN),
      sync: glbEnsureStatus,
      counts,
      hint:
        validCount === 0
          ? !process.env.GITHUB_TOKEN && !process.env.GH_TOKEN
            ? 'Add GITHUB_TOKEN in Railway Variables (repo is private), redeploy, POST /model-3d/sync'
            : glbEnsureStatus.running
              ? `Downloading… ${glbEnsureStatus.ready}/${glbEnsureStatus.total} (${glbEnsureStatus.currentFile || ''})`
              : 'POST /model-3d/sync to start download, wait 10–20 min'
          : undefined,
    })
  } catch (e) {
    console.error('model-3d status error:', e)
    res.status(500).json({ message: 'Failed to read model_3d status' })
  }
})

/** Serve a catalog GLB (GET only — files live in upload/model_3d/ or Railway bucket). */
router.get('/model-3d/file', optionalAuth, async (req, res, next) => {
  try {
    const file = normalizeModel3dFileName(req.query.name)
    if (!file) return res.status(400).json({ message: 'Missing ?name=' })

    const fullPath = resolveModel3dPath(file)
    const bucketKey = `upload/model_3d/${file}`

    if (fs.existsSync(fullPath) && isValidGlbFile(fullPath)) {
      res.setHeader('Content-Type', 'model/gltf-binary')
      res.setHeader('Accept-Ranges', 'bytes')
      res.setHeader('Cache-Control', 'public, max-age=86400')
      return res.sendFile(fullPath, { acceptRanges: true }, (err) => {
        if (err) next(err)
      })
    }

    if (await pipeBucketObjectToResponse(res, bucketKey)) return

    if (!fs.existsSync(fullPath) && !loadManifestEntry(file)) {
      return res.status(404).json({
        message: `Model not found: ${file}. Place the .glb in upload/model_3d/ or the Railway bucket at ${bucketKey}.`,
      })
    }

    if (!isValidGlbFile(fullPath)) {
      if (!process.env.GITHUB_TOKEN && !process.env.GH_TOKEN) {
        return res.status(503).json({
          message:
            'GLB not on server. Set GITHUB_TOKEN on Railway (repo planeteyeai/nhit-backend1), redeploy, open /model-3d/sync',
          syncUrl: '/model-3d/sync',
        })
      }
      const dl = await ensureSingleModelFile(file)
      if (!dl.ok || !isValidGlbFile(fullPath)) {
        return res.status(503).json({
          message: dl.error || 'Could not download GLB from GitHub LFS yet. Try /model-3d/sync and wait.',
          syncUrl: '/model-3d/sync',
        })
      }
    }

    res.setHeader('Content-Type', 'model/gltf-binary')
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.sendFile(fullPath, { acceptRanges: true }, (err) => {
      if (err) next(err)
    })
  } catch (e) {
    next(e)
  }
})

function loadManifestEntry(fileName) {
  try {
    const p = path.join(model3dRoot, 'lfs-manifest.json')
    if (!fs.existsSync(p)) return false
    const manifest = JSON.parse(fs.readFileSync(p, 'utf8'))
    return Array.isArray(manifest.files) && manifest.files.some((f) => f.file === fileName)
  } catch {
    return false
  }
}

/** 360 panorama upload (ported from Backend/threed/main.py) */
router.post('/upload-panorama', optionalAuth, uploadPanoramaMem.single('file'), async (req, res) => {
  try {
    const data = await processPanoramaUpload(req, uploadRoot)
    await mirrorPanoramaUploadResult(uploadRoot, { payload: data })
    res.json(data)
  } catch (e) {
    console.error('upload-panorama error:', e)
    res.status(e.status || 500).json({ message: e.message || 'Panorama upload failed' })
  }
})

router.get('/bridges/:bridgeId/panoramas', optionalAuth, async (req, res) => {
  try {
    const bridgeId = Number(req.params.bridgeId || 0)
    if (!bridgeId) return res.status(400).json({ message: 'Invalid bridgeId' })
    const stations = listBridgePanoramas(uploadRoot, bridgeId, req)
    res.json({ status: 'success', data: stations })
  } catch (e) {
    console.error('bridge panoramas list error:', e)
    res.status(500).json({ message: e.message || 'Failed to list panoramas' })
  }
})

router.post('/bridges/:bridgeId/panoramas/upload', optionalAuth, uploadPanoramaMem.single('file'), async (req, res) => {
  try {
    const bridgeId = Number(req.params.bridgeId || 0)
    if (!bridgeId) return res.status(400).json({ message: 'Invalid bridgeId' })
    const data = await processPanoramaUpload(req, uploadRoot, { bridgeId: String(bridgeId) })
    await mirrorPanoramaUploadResult(uploadRoot, { bridgeId: String(bridgeId), payload: data })
    res.json({ status: 'success', ...data })
  } catch (e) {
    console.error('bridge panorama upload error:', e)
    res.status(e.status || 500).json({ message: e.message || 'Panorama upload failed' })
  }
})

router.delete('/bridges/:bridgeId/panoramas/:stationId', optionalAuth, async (req, res) => {
  try {
    const bridgeId = Number(req.params.bridgeId || 0)
    const stationId = String(req.params.stationId || '').trim()
    if (!bridgeId || !stationId) return res.status(400).json({ message: 'Invalid parameters' })
    const result = deleteBridgePanorama(uploadRoot, bridgeId, stationId)
    res.json({ status: 'success', ...result })
  } catch (e) {
    console.error('bridge panorama delete error:', e)
    res.status(e.status || 500).json({ message: e.message || 'Failed to delete panorama' })
  }
})

const INSPECTION_COMPONENTS = {
  general: { table: 'general', pk: 'general_id', flag: 'general' },
  approaches: { table: 'approaches', pk: 'approaches_id', flag: 'approaches' },
  protection_works: { table: 'protection_works', pk: 'protection_works_id', flag: 'protection_works' },
  waterway: { table: 'waterway', pk: 'waterway_id', flag: 'waterway' },
  subways: { table: 'subways', pk: 'subway_id', flag: 'subways' },
  wearing_coat: { table: 'wearing_coat', pk: 'wearing_coat_id', flag: 'wearing_coat' },
  drainage_spouts_and_vest_holes: {
    table: 'drainage_spouts_and_vest_holes',
    pk: 'drainage_spouts_and_vest_holes_id',
    flag: 'drainage_spouts_and_vest_holes',
  },
  handrails: {
    table: 'handrails_parapets_crash_barriers',
    pk: 'handrails_parapets_crash_barriers_id',
    flag: 'hand_rails_&_parapets_walls',
  },
  footpaths: { table: 'footpaths', pk: 'footpath_id', flag: 'footpaths' },
  utilities: { table: 'utilities', pk: 'utilities_id', flag: 'utilities' },
  foundation: { table: 'foundation', pk: 'foundation_id', flag: 'foundation' },
  substructure: { table: 'substructure', pk: 'substructure_id', flag: 'substructure' },
  bearing_and_pedestal: { table: 'bearing_and_pedistal', pk: 'bearing_and_pedistal_id', flag: 'bearing_and_pedestal' },
  superstructure: { table: 'superstructure', pk: 'superstructure_id', flag: 'superstructure' },
  expansion_joint: { table: 'expansion_joint', pk: 'expansion_joint_id', flag: 'expansion_joint' },
}

const INSPECTION_COMPONENT_PK_CACHE = new Map()

const SUBWAYS_FIELD_MAP = {
  pier_condition: 'check_condition_of_side_retaining_wall',
  pier_condition_image: 'check_condition_of_side_retaining_wall_image',
  large_excavations_done: 'check_large_excavations_done',
  large_excavations_done_image: 'check_large_excavations_done_image',
  damages_to_protective_measures: 'check_damages_to_protective_measures',
  damages_to_protective_measures_image: 'check_damages_to_protective_measures_image',
  damages_to_protective_coating_or_paint: 'check_damage_to_protective_coating_or_paint',
  damages_to_protective_coating_or_paint_image: 'check_damage_to_protective_coating_or_paint_image',
}

const SUBWAYS_REVERSE_FIELD_MAP = Object.fromEntries(
  Object.entries(SUBWAYS_FIELD_MAP).map(([k, v]) => [v, k])
)

function toDbComponentPayload(componentKey, payload) {
  if (componentKey !== 'subways' || !payload || typeof payload !== 'object') return payload
  return Object.fromEntries(Object.entries(payload).map(([k, v]) => [SUBWAYS_FIELD_MAP[k] || k, v]))
}

function fromDbComponentPayload(componentKey, row) {
  if (componentKey !== 'subways' || !row || typeof row !== 'object') return row
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [SUBWAYS_REVERSE_FIELD_MAP[k] || k, v]))
}

async function resolveInspectionComponentPk(cfg, metaRows = null) {
  const cacheKey = `${cfg.table}:${cfg.pk}`
  if (INSPECTION_COMPONENT_PK_CACHE.has(cacheKey)) return INSPECTION_COMPONENT_PK_CACHE.get(cacheKey)

  if (Array.isArray(metaRows) && metaRows.length) {
    const names = new Set(metaRows.map((r) => r.COLUMN_NAME))
    if (names.has(cfg.pk)) {
      INSPECTION_COMPONENT_PK_CACHE.set(cacheKey, cfg.pk)
      return cfg.pk
    }
  } else {
    const [configuredPkRows] = await pool.query(
      `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
       LIMIT 1`,
      [cfg.table, cfg.pk]
    )
    if (configuredPkRows.length) {
      INSPECTION_COMPONENT_PK_CACHE.set(cacheKey, cfg.pk)
      return cfg.pk
    }
  }

  const [pkRows] = await pool.query(
    `SELECT k.COLUMN_NAME
     FROM information_schema.TABLE_CONSTRAINTS t
     JOIN information_schema.KEY_COLUMN_USAGE k
       ON t.CONSTRAINT_NAME = k.CONSTRAINT_NAME
      AND t.TABLE_SCHEMA = k.TABLE_SCHEMA
      AND t.TABLE_NAME = k.TABLE_NAME
     WHERE t.TABLE_SCHEMA = DATABASE()
       AND t.TABLE_NAME = ?
       AND t.CONSTRAINT_TYPE = 'PRIMARY KEY'
     ORDER BY k.ORDINAL_POSITION
     LIMIT 1`,
    [cfg.table]
  )
  const resolved = pkRows[0]?.COLUMN_NAME || cfg.pk
  INSPECTION_COMPONENT_PK_CACHE.set(cacheKey, resolved)
  return resolved
}

router.get('/inspection/component-meta/:key', async (req, res) => {
  try {
    const key = String(req.params.key || '').trim()
    const cfg = INSPECTION_COMPONENTS[key]
    if (!cfg) return res.status(400).json({ success: false, message: 'Unknown component' })
    const [metaRows] = await pool.query(
      `SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT, DATA_TYPE, COLUMN_TYPE, ORDINAL_POSITION
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
       ORDER BY ORDINAL_POSITION`,
      [cfg.table]
    )
    const columns = metaRows.map((r) => {
      let enumValues = null
      if (String(r.DATA_TYPE).toLowerCase() === 'enum' && typeof r.COLUMN_TYPE === 'string') {
        const m = r.COLUMN_TYPE.match(/enum\((.*)\)/i)
        enumValues =
          m?.[1]
            ?.split(',')
            ?.map((s) => s.trim().replace(/^'+|'+$/g, ''))
            ?.filter(Boolean) || null
      }
      return {
        name: r.COLUMN_NAME,
        dataType: r.DATA_TYPE,
        nullable: r.IS_NULLABLE === 'YES',
        defaultValue: r.COLUMN_DEFAULT,
        enumValues,
      }
    })
    const resolvedPk = await resolveInspectionComponentPk(cfg, metaRows)
    res.json({ success: true, data: { table: cfg.table, pk: resolvedPk, flag: cfg.flag, columns } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, message: e.message })
  }
})

router.get('/inspection/component-dropdowns/:key', async (req, res) => {
  try {
    const key = String(req.params.key || '').trim()
    const data = INSPECTION_DROPDOWNS[key] || {}
    res.json({ success: true, data })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, message: e.message })
  }
})

// Full export of PHP constants.php arrays (define arrays + $config arrays)
router.get('/php/constants', async (_req, res) => {
  try {
    const data = {
      source: 'frontend/src/constants/constants.js',
      constants: {
        STRUCTURAL_RM_OPTIONS,
        NON_STRUCTURAL_RM_OPTIONS,
      },
      config: {},
    }
    res.json({ success: true, data })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
})

// Get a single constant or config array by name
// Example: /php/constants/TYPE_OF_TERRAIN  or /php/constants/rating_descriptions
router.get('/php/constants/:name', async (req, res) => {
  try {
    const name = String(req.params.name || '').trim()
    const phpConstants = {
      constants: {
        STRUCTURAL_RM_OPTIONS,
        NON_STRUCTURAL_RM_OPTIONS,
      },
      config: {},
    }
    if (name === 'RM_MEASUREMENT_MAP') {
      return res.json({ success: true, scope: 'constants', name, data: RM_MEASUREMENT_MAP })
    }
    if (name === 'BOQ_Items') {
      return res.json({ success: true, scope: 'constants', name, data: BOQ_Items })
    }
    const c = phpConstants?.constants?.[name]
    if (c !== undefined) return res.json({ success: true, scope: 'constants', name, data: c })
    const k = phpConstants?.config?.[name]
    if (k !== undefined) return res.json({ success: true, scope: 'config', name, data: k })
    return res.status(404).json({ success: false, message: 'Not found' })
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message })
  }
})

router.get('/inspection/bridge-inspection-meta', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bridge_inspection'
       ORDER BY ORDINAL_POSITION`
    )
    res.json({ success: true, data: rows.map((r) => r.COLUMN_NAME) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, message: e.message })
  }
})

router.get('/inspection/table-list', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT TABLE_NAME
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
       ORDER BY TABLE_NAME`
    )
    res.json({ success: true, data: rows.map((r) => r.TABLE_NAME) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, message: e.message })
  }
})

router.get('/inspection/table-search', async (req, res) => {
  try {
    const q = String(req.query?.q || '').trim()
    if (!q) return res.json({ success: true, data: [] })
    const [rows] = await pool.query(
      `SELECT TABLE_NAME
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE ?
       ORDER BY TABLE_NAME`,
      [`%${q}%`]
    )
    res.json({ success: true, data: rows.map((r) => r.TABLE_NAME) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, message: e.message })
  }
})

router.get('/inspection/component/:key/:inspectionId', async (req, res) => {
  try {
    const key = String(req.params.key || '').trim()
    const cfg = INSPECTION_COMPONENTS[key]
    if (!cfg) return res.status(400).json({ message: 'Unknown component' })
    const inspectionId = Number(req.params.inspectionId)
    if (!inspectionId) return res.status(400).json({ message: 'Invalid inspection id' })
    const resolvedPk = await resolveInspectionComponentPk(cfg)
    const [rows] = await pool.query(
      `SELECT * FROM \`${cfg.table}\` WHERE bridge_inspection_id = ? ORDER BY \`${resolvedPk}\` DESC LIMIT 1`,
      [inspectionId]
    )
    if (rows[0]) {
      const row = fromDbComponentPayload(key, rows[0] || null)
      if (key === 'handrails' && row && typeof row === 'object') {
        const [inspectionRows] = await pool.query(
          `SELECT bridge_id FROM bridge_inspection WHERE bridge_inspection_id = ? LIMIT 1`,
          [inspectionId]
        )
        const bridgeId = Number(inspectionRows?.[0]?.bridge_id || 0)
        if (bridgeId) {
          const [bridgeRows] = await pool.query(
            `SELECT material_lhs, material_rhs
             FROM handrails_parapets_crash_barriers_bridge
             WHERE bridge_id = ?
             ORDER BY handrails_parapets_crash_barriers_bridge_id DESC
             LIMIT 1`,
            [bridgeId]
          )
          const bridgeRow = bridgeRows?.[0] || {}
          row.material_lhs = String(row.material_lhs || bridgeRow.material_lhs || '').trim()
          row.material_rhs = String(row.material_rhs || bridgeRow.material_rhs || '').trim()
        }
      }
      return res.json(row)
    }

    // Legacy compatibility: some older datasets store protection works against bridge_id
    // in `protection_works_bridge` only. Fallback so already-filled values are visible.
    if (key === 'protection_works') {
      const [inspectionRows] = await pool.query(
        `SELECT bridge_id FROM bridge_inspection WHERE bridge_inspection_id = ? LIMIT 1`,
        [inspectionId]
      )
      const bridgeId = Number(inspectionRows?.[0]?.bridge_id || 0)
      if (bridgeId) {
        const [legacyRows] = await pool.query(
          `SELECT *
           FROM protection_works_bridge
           WHERE bridge_id = ?
           ORDER BY protection_works_bridge_id DESC
           LIMIT 1`,
          [bridgeId]
        )
        if (legacyRows[0]) {
          const d = legacyRows[0]
          return res.json({
            protection_works_id: null,
            bridge_inspection_id: inspectionId,
            type: d.type || '',
            layout_cross_section_profile: '',
            slope_pitching_apron_and_toe_walls: '',
            floor_protection_works: '',
            scour_for_abutments: '',
            scour_for_abutments_image: '',
            scour_for_piers: '',
            scour_for_piers_image: '',
            reserve_store_material: d.reserve_store_material || '',
            status: d.status || 'Pending',
          })
        }
      }
    }

    // Legacy: bridge master data may exist only in substructure_bridge (no inspection substructure row yet).
    if (key === 'substructure') {
      const [inspectionRows] = await pool.query(
        `SELECT bridge_id FROM bridge_inspection WHERE bridge_inspection_id = ? LIMIT 1`,
        [inspectionId]
      )
      const bridgeId = Number(inspectionRows?.[0]?.bridge_id || 0)
      if (bridgeId) {
        const [legacyRows] = await pool.query(
          `SELECT *
           FROM substructure_bridge
           WHERE bridge_id = ?
           ORDER BY substructure_bridge_id DESC
           LIMIT 1`,
          [bridgeId]
        )
        if (legacyRows[0]) {
          const d = legacyRows[0]
          return res.json({
            substructure_id: null,
            bridge_inspection_id: inspectionId,
            type_a1: d.type_a1 || '',
            type_a2: d.type_a2 || '',
            substructure_material_a1: d.substructure_material_a1 || '',
            substructure_material_a2: d.substructure_material_a2 || '',
            max_depth_abutment_found_a1: d.max_depth_abutment_found_a1 || '',
            max_depth_abutment_found_a2: d.max_depth_abutment_found_a2 || '',
            condition_a1: '',
            condition_a2: '',
            substructure_name: '',
            condition_distress_length: 0,
            condition_distress_width: 0,
            condition_distress_depth: 0,
            distance_distress_x: '',
            distance_distress_y: '',
            efficiency_drainage_a1: '',
            efficiency_drainage_a2: '',
            efficiency_drainage_a1_images: '',
            efficiency_drainage_a2_images: '',
            max_depth_abutment_found_a1_images: '',
            max_depth_abutment_found_a2_images: '',
            condition_a1_images: '',
            condition_a2_images: '',
            status: d.status || 'Pending',
          })
        }
      }
    }

    // Legacy: bridge master handrails materials when no inspection row exists yet.
    if (key === 'handrails') {
      const [inspectionRows] = await pool.query(
        `SELECT bridge_id FROM bridge_inspection WHERE bridge_inspection_id = ? LIMIT 1`,
        [inspectionId]
      )
      const bridgeId = Number(inspectionRows?.[0]?.bridge_id || 0)
      if (bridgeId) {
        const [legacyRows] = await pool.query(
          `SELECT material_lhs, material_rhs
           FROM handrails_parapets_crash_barriers_bridge
           WHERE bridge_id = ?
           ORDER BY handrails_parapets_crash_barriers_bridge_id DESC
           LIMIT 1`,
          [bridgeId]
        )
        if (legacyRows[0]) {
          const d = legacyRows[0]
          return res.json({
            handrails_parapets_crash_barriers_id: null,
            bridge_inspection_id: inspectionId,
            present_lhs: '',
            present_rhs: '',
            material_lhs: d.material_lhs || '',
            material_rhs: d.material_rhs || '',
            conditions_lhs: '',
            conditions_rhs: '',
            expansion_joint_gap_lhs: '',
            expansion_joint_gap_rhs: '',
            expansion_joint_gap_images: '',
            present_of_additional_safety_measures_lhs: '',
            present_of_additional_safety_measures_rhs: '',
            present_of_additional_safety_measures_images: '',
            presence_of_towers_lhs: '',
            presence_of_towers_rhs: '',
            presence_of_towers_images: '',
            inspection_galley_ladder_platform_lhs: '',
            inspection_galley_ladder_platform_rhs: '',
            whether_guard_rail_or_crash_barrier: '',
            status: 'Active',
          })
        }
      }
    }
    return res.json(fromDbComponentPayload(key, null))
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: e.message })
  }
})

router.post('/inspection/component/:key/:inspectionId', requireAuth, async (req, res) => {
  try {
    const key = String(req.params.key || '').trim()
    const cfg = INSPECTION_COMPONENTS[key]
    if (!cfg) return res.status(400).json({ success: false, message: 'Unknown component' })
    const inspectionId = Number(req.params.inspectionId)
    if (!inspectionId) return res.status(400).json({ success: false, message: 'Invalid inspection id' })

    const dataObj = toDbComponentPayload(key, req.body || {})
    const [metaRows] = await pool.query(
      `SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT, DATA_TYPE, COLUMN_TYPE
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [cfg.table]
    )
    const resolvedPk = await resolveInspectionComponentPk(cfg, metaRows)
    const allowed = new Set(metaRows.map((r) => r.COLUMN_NAME))
    const patch = Object.fromEntries(Object.entries(dataObj).filter(([k]) => allowed.has(k)))
    // Empty-string numerics -> 0
    for (const r of metaRows) {
      if (patch[r.COLUMN_NAME] === '') {
        const t = String(r.DATA_TYPE || '').toLowerCase()
        if (['int', 'bigint', 'smallint', 'tinyint', 'mediumint', 'decimal', 'float', 'double'].includes(t)) {
          patch[r.COLUMN_NAME] = 0
        }
      }
    }

    patch.bridge_inspection_id = inspectionId
    const statusMeta = metaRows.find((r) => r.COLUMN_NAME === 'status')
    if (allowed.has('status')) {
      patch.status = ensureEnumValue(statusMeta, patch.status)
    }
    if (allowed.has('created_by')) patch.created_by = Number(req.user?.uid || 0)
    if (allowed.has('created_on')) patch.created_on = new Date()
    if (allowed.has('updated_by')) patch.updated_by = Number(req.user?.uid || 0)
    if (allowed.has('updated_on')) patch.updated_on = new Date()

    // Fill remaining NOT NULL columns without defaults (dump schema is strict)
    for (const c of metaRows) {
      const key = c.COLUMN_NAME
      if (!allowed.has(key)) continue
      if (key === resolvedPk) continue
      if (patch[key] !== undefined && patch[key] !== null) continue
      const nullable = c.IS_NULLABLE === 'YES'
      const hasDefault = c.COLUMN_DEFAULT !== null
      if (!nullable && !hasDefault) {
        if (String(c.DATA_TYPE).toLowerCase() === 'enum' && typeof c.COLUMN_TYPE === 'string') {
          patch[key] = ensureEnumValue(c, patch[key])
        } else {
          patch[key] = fallbackValueForDataType(c.DATA_TYPE)
        }
      }
    }

    const [existing] = await pool.query(
      `SELECT \`${resolvedPk}\` AS id FROM \`${cfg.table}\` WHERE bridge_inspection_id = ? ORDER BY \`${resolvedPk}\` DESC LIMIT 1`,
      [inspectionId]
    )
    const existingId = Number(existing[0]?.id || 0)
    const cols = Object.keys(patch).filter((k) => k !== resolvedPk && patch[k] !== undefined)
    const vals = cols.map((k) => patch[k])
    const qCols = cols.map((c) => `\`${c}\``)

    if (existingId) {
      const setClause = cols.filter((c) => c !== 'bridge_inspection_id' && c !== 'created_by' && c !== 'created_on').map((c) => `\`${c}\` = ?`).join(', ')
      const setKeys = cols.filter((c) => c !== 'bridge_inspection_id' && c !== 'created_by' && c !== 'created_on')
      await pool.query(
        `UPDATE \`${cfg.table}\` SET ${setClause} WHERE \`${resolvedPk}\` = ?`,
        [...setKeys.map((k) => patch[k]), existingId]
      )
    } else {
      await pool.query(
        `INSERT INTO \`${cfg.table}\` (${qCols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
        vals
      )
    }

    // Mark component flag on bridge_inspection only if the column exists in current DB schema.
    const [bridgeInspectionFlagRows] = await pool.query(
      `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'bridge_inspection'
         AND COLUMN_NAME = ?`,
      [cfg.flag]
    )
    if (bridgeInspectionFlagRows.length) {
      await pool.query(
        `UPDATE bridge_inspection
         SET \`${cfg.flag}\` = 'Yes', updated_by = ?, upadted_on = CURDATE()
         WHERE bridge_inspection_id = ?`,
        [req.user?.uid || 0, inspectionId]
      )
    }

    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, message: e.message })
  }
})
router.get('/inspection/structure_data/:bridgeId', async (req, res) => {
  const [rows] = await pool.query(
    'SELECT structure_data_bridge FROM bridge WHERE bridge_id = ?',
    [req.params.bridgeId]
  )
  res.json(rows[0] || {})
})

router.post('/inspections', requireAuth, async (req, res) => {
  try {
    const raw = req.body || {}
    const bridgeId = Number(raw.bridge_id || raw.bridgeId)
    if (!bridgeId) return res.status(400).json({ success: false, message: 'bridge_id is required' })

    // Only allow real bridge_inspection columns (avoid "Unknown column" like si_id).
    const [colRows] = await pool.query(
      `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bridge_inspection'`
    )
    const allowedCols = new Set(colRows.map((r) => r.COLUMN_NAME))

    // Bootstrap from an existing row to satisfy strict NOT NULL legacy schema.
    const [tplRows] = await pool.query('SELECT * FROM bridge_inspection LIMIT 1')
    const tpl = tplRows[0] || {}
    delete tpl.bridge_inspection_id

    const payload = {
      ...tpl,
      ...Object.fromEntries(Object.entries(raw).filter(([k]) => allowedCols.has(k))),
      bridge_id: bridgeId,
      bmc_inspection_status: raw.bmc_inspection_status || raw.bmcInspectionStatus || tpl.bmc_inspection_status || 'No',
      bmc_user: Number(raw.bmc_user ?? raw.bmcUser ?? tpl.bmc_user ?? 0),
      remark: raw.remark ?? tpl.remark ?? '',
      status: raw.status || tpl.status || 'Confirmed',
      created_by: Number(req.user?.uid || tpl.created_by || 0),
      updated_by: Number(req.user?.uid || tpl.updated_by || 0),
      created_on: new Date(),
      upadted_on: new Date(),
    }

    // Resolve numeric state_id / zone_id required by dump schema if not provided.
    if (payload.state_id == null || payload.state_id === 0) {
      const [bridgeRows] = await pool.query('SELECT state_id FROM bridge WHERE bridge_id = ? LIMIT 1', [bridgeId])
      const st = bridgeRows[0]?.state_id
      if (st != null) {
        const [stateRows] = await pool.query(
          'SELECT state_id FROM state WHERE state_code = ? OR state_id = ? LIMIT 1',
          [st, st]
        )
        payload.state_id = Number(stateRows[0]?.state_id || payload.state_id || 0)
      }
    }
    if (payload.zone_id == null || payload.zone_id === 0) {
      const [bridgeRows] = await pool.query('SELECT zone FROM bridge WHERE bridge_id = ? LIMIT 1', [bridgeId])
      const zc = bridgeRows[0]?.zone
      if (zc != null) {
        const [zoneRows] = await pool.query(
          'SELECT zone_id FROM zone WHERE zone_code = ? OR zone_id = ? LIMIT 1',
          [zc, zc]
        )
        payload.zone_id = Number(zoneRows[0]?.zone_id || payload.zone_id || 0)
      }
    }

    // Fill any remaining NOT NULL columns without defaults.
    const [metaRows] = await pool.query(
      `SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT, DATA_TYPE, COLUMN_TYPE
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bridge_inspection'`
    )

    // Coerce empty-string numerics (e.g. FLOAT columns) to 0
    for (const c of metaRows) {
      const key = c.COLUMN_NAME
      if (payload[key] === '') {
        const t = String(c.DATA_TYPE || '').toLowerCase()
        if (['int', 'bigint', 'smallint', 'tinyint', 'mediumint', 'decimal', 'float', 'double'].includes(t)) {
          payload[key] = 0
        }
      }
    }

    for (const c of metaRows) {
      const key = c.COLUMN_NAME
      if (key === 'bridge_inspection_id') continue
      if (payload[key] !== undefined && payload[key] !== null) continue
      const nullable = c.IS_NULLABLE === 'YES'
      const hasDefault = c.COLUMN_DEFAULT !== null
      if (!nullable && !hasDefault) {
        if (String(c.DATA_TYPE).toLowerCase() === 'enum' && typeof c.COLUMN_TYPE === 'string') {
          const m = c.COLUMN_TYPE.match(/enum\((.*)\)/i)
          const first = m?.[1]?.split(',')?.[0]?.trim()?.replace(/^'+|'+$/g, '')
          payload[key] = first || 'No'
        } else {
          payload[key] = fallbackValueForDataType(c.DATA_TYPE)
        }
      }
    }

    const cols = Object.keys(payload).filter((k) => payload[k] !== undefined)
    const vals = cols.map((k) => payload[k])
    const qCols = cols.map((c) => `\`${c}\``)
    const [ins] = await pool.query(
      `INSERT INTO bridge_inspection (${qCols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      vals
    )
    res.status(201).json({ success: true, bridge_inspection_id: ins.insertId })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, message: e.message })
  }
})

router.put('/inspections/:id', requireAuth, async (req, res) => {
  try {
    const inspectionId = Number(req.params.id)
    if (!inspectionId) return res.status(400).json({ success: false, message: 'Invalid inspection id' })
    const raw = req.body || {}

    const [metaRows] = await pool.query(
      `SELECT COLUMN_NAME, DATA_TYPE
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bridge_inspection'`
    )
    const allowed = new Set(metaRows.map((r) => r.COLUMN_NAME))
    const typeByCol = new Map(metaRows.map((r) => [r.COLUMN_NAME, String(r.DATA_TYPE || '').toLowerCase()]))

    const patch = Object.fromEntries(Object.entries(raw).filter(([k]) => allowed.has(k)))
    for (const [k, v] of Object.entries(patch)) {
      if (v === '') {
        const t = typeByCol.get(k)
        if (['int', 'bigint', 'smallint', 'tinyint', 'mediumint', 'decimal', 'float', 'double'].includes(t)) {
          patch[k] = 0
        }
      }
    }
    patch.updated_by = Number(req.user?.uid || 0)
    patch.upadted_on = new Date()

    const keys = Object.keys(patch)
    if (!keys.length) return res.json({ success: true })
    const setClause = keys.map((k) => `\`${k}\` = ?`).join(', ')
    await pool.query(`UPDATE bridge_inspection SET ${setClause} WHERE bridge_inspection_id = ?`, [
      ...keys.map((k) => patch[k]),
      inspectionId,
    ])
    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, message: e.message })
  }
})

router.get('/bridge/schedule_inspecion/:bridgeId', requireAuth, async (req, res) => {
  try {
    const bridgeId = Number(req.params.bridgeId)
    const [rows] = await pool.query(
      `SELECT * FROM schedule_inspecion WHERE bridge_id = ? ORDER BY si_id DESC LIMIT 1`,
      [bridgeId]
    )
    res.json(rows[0] || null)
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

router.get('/bridge/schedule_adhoc_inspecion/:bridgeId', requireAuth, async (req, res) => {
  try {
    const bridgeId = Number(req.params.bridgeId)
    const [rows] = await pool.query(
      `SELECT * FROM schedule_adhoc_inspecion WHERE bridge_id = ? ORDER BY adhoc_inspecion_id DESC LIMIT 1`,
      [bridgeId]
    )
    res.json(rows[0] || null)
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

router.post('/bridge/schedule_inspecion/:bridgeId', requireAuth, async (req, res) => {
  try {
    const bridgeId = Number(req.params.bridgeId)
    const b = req.body || {}
    await pool.query(
      `INSERT INTO schedule_inspecion
       (bridge_id, pre_month, post_month, routine_inspecion_month, routine_inspecion_frequency, status, updated_by, updated_on)
       VALUES (?,?,?,?,?,?,?,CURDATE())`,
      [
        bridgeId,
        b.pre_month || b.preMonth || '',
        b.post_month || b.postMonth || '',
        b.routine_inspecion_month || b.routineInspectionMonth || '',
        b.routine_inspecion_frequency || b.routineInspectionFrequency || '',
        'Active',
        req.user?.uid || 0,
      ]
    )
    await pool.query(
      `UPDATE bridge SET is_inspecion_schedule = 'Yes', updated_by = ?, updated_on = NOW() WHERE bridge_id = ?`,
      [req.user?.uid || 0, bridgeId]
    )
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})
router.post('/bridge/schedule_adhoc_inspecion/:bridgeId', requireAuth, async (req, res) => {
  try {
    const bridgeId = Number(req.params.bridgeId)
    const b = req.body || {}
    await pool.query(
      `INSERT INTO schedule_adhoc_inspecion
       (bridge_id, adhoc_inspecion_date, comment, status, updated_by, updated_on)
       VALUES (?,?,?,?,?,NOW())`,
      [
        bridgeId,
        b.adhoc_inspecion_date || b.adhocInspectionDate || b.start_date || b.startDate || new Date(),
        b.comment || b.remarks || '',
        'Active',
        req.user?.uid || null,
      ]
    )
    res.json({ success: true })
  } catch (e) {
    // legacy schema can differ; return controlled error
    res.status(500).json({ message: e.message })
  }
})

// Start an inspection from a scheduled row -> creates a bridge_inspection entry (moves to Ongoing list).
router.post('/schedule-inspecion/:siId/start', requireAuth, async (req, res) => {
  try {
    const siId = Number(req.params.siId)
    if (!siId) return res.status(400).json({ message: 'Invalid siId' })

    const [schedRows] = await pool.query('SELECT * FROM schedule_inspecion WHERE si_id = ? LIMIT 1', [siId])
    const sched = schedRows[0]
    if (!sched) return res.status(404).json({ message: 'Schedule not found' })

    const bridgeId = Number(sched.bridge_id)
    const [bridgeRows] = await pool.query('SELECT * FROM bridge WHERE bridge_id = ? LIMIT 1', [bridgeId])
    const bridge = bridgeRows[0]
    if (!bridge) return res.status(404).json({ message: 'Bridge not found for schedule' })

    // Resolve numeric state_id / zone_id required by bridge_inspection table (dump uses ints)
    const [stateRows] = await pool.query('SELECT state_id FROM state WHERE state_code = ? OR state_id = ? LIMIT 1', [
      bridge.state_id,
      bridge.state_id,
    ])
    const stateId = Number(stateRows[0]?.state_id || 0)
    const [zoneRows] = await pool.query('SELECT zone_id FROM zone WHERE zone_code = ? OR zone_id = ? LIMIT 1', [
      bridge.zone,
      bridge.zone,
    ])
    const zoneId = Number(zoneRows[0]?.zone_id || 0)

    // Bootstrap from an existing row to satisfy strict NOT NULL legacy schema.
    const [tplRows] = await pool.query('SELECT * FROM bridge_inspection LIMIT 1')
    const tpl = tplRows[0] || {}
    delete tpl.bridge_inspection_id

    const payload = {
      ...tpl,
      bridge_id: bridgeId,
      state_id: stateId || tpl.state_id || 0,
      zone_id: zoneId || tpl.zone_id || 0,
      design_discharge_in_cumecs: bridge.design_discharge_in_cumecs != null ? String(bridge.design_discharge_in_cumecs) : (tpl.design_discharge_in_cumecs || ''),
      bmc_inspection_status: 'No',
      bmc_user: 0,
      remark: '',
      status: 'Confirmed', // Ongoing list
      created_by: req.user?.uid || 0,
      updated_by: req.user?.uid || 0,
      created_on: new Date(),
      upadted_on: new Date(),
    }

    // Fill any remaining NOT NULL columns without defaults (dump schema is strict).
    const [metaRows] = await pool.query(
      `SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT, DATA_TYPE, COLUMN_TYPE
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bridge_inspection'`
    )
    for (const c of metaRows) {
      const key = c.COLUMN_NAME
      if (key === 'bridge_inspection_id') continue
      if (payload[key] !== undefined && payload[key] !== null) continue
      const nullable = c.IS_NULLABLE === 'YES'
      const hasDefault = c.COLUMN_DEFAULT !== null
      if (!nullable && !hasDefault) {
        // Enums must use a valid value; choose first enum option.
        if (String(c.DATA_TYPE).toLowerCase() === 'enum' && typeof c.COLUMN_TYPE === 'string') {
          const m = c.COLUMN_TYPE.match(/enum\((.*)\)/i)
          const first = m?.[1]?.split(',')?.[0]?.trim()?.replace(/^'+|'+$/g, '')
          payload[key] = first || 'No'
        } else {
          payload[key] = fallbackValueForDataType(c.DATA_TYPE)
        }
      }
    }

    const cols = Object.keys(payload).filter((k) => payload[k] !== undefined)
    const vals = cols.map((k) => payload[k])
    const qCols = cols.map((c) => `\`${c}\``)
    const [ins] = await pool.query(
      `INSERT INTO bridge_inspection (${qCols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      vals
    )

    // Move this schedule row out of "Scheduled" list once inspection is started.
    await pool.query(
      `UPDATE schedule_inspecion
       SET status = 'InActive', updated_by = ?, updated_on = CURDATE()
       WHERE si_id = ?`,
      [req.user?.uid || 0, siId]
    )

    // Return the id so frontend can optionally view it immediately
    res.status(201).json({ success: true, bridge_inspection_id: ins.insertId })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: e.message })
  }
})
router.post('/bridge/update_images/:bridgeId', optionalAuth, upload.any(), async (req, res) => {
  try {
    const bridgeId = Number(req.params.bridgeId)
    const files = req.files || []
    if (!files.length) return res.status(400).json({ message: 'No images uploaded' })
    const [rows] = await pool.query('SELECT bridge_images FROM bridge WHERE bridge_id = ? LIMIT 1', [bridgeId])
    let existing = []
    const raw = rows[0]?.bridge_images
    if (raw) {
      try {
        existing = Array.isArray(raw) ? raw : JSON.parse(raw)
      } catch {
        existing = String(raw).split(',').map((x) => x.trim()).filter(Boolean)
      }
    }
    const added = files.map((f) => f.filename)
    const merged = [...existing, ...added]
    await mirrorUploadRelPaths(
      added.map((name) => `upload/bridge_images/${bridgeId}/${name}`),
      uploadRoot
    )
    await pool.query('UPDATE bridge SET bridge_images = ?, updated_by = ?, updated_on = CURDATE() WHERE bridge_id = ?', [
      merged.join(','),
      req.user?.uid || 0,
      bridgeId,
    ])
    res.json({ success: true, files: added })
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})
router.get('/upload/bridge_images/:bridgeId', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT bridge_images FROM bridge WHERE bridge_id = ? LIMIT 1', [req.params.bridgeId])
    const raw = rows[0]?.bridge_images
    if (!raw) return res.json([])
    let list = []
    try {
      list = Array.isArray(raw) ? raw : JSON.parse(raw)
    } catch {
      list = String(raw).split(',').map((x) => x.trim()).filter(Boolean)
    }
    res.json(list)
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})
router.post('/bridge/delete_image', optionalAuth, async (req, res) => {
  try {
    const bridgeId = Number(req.body?.bridge_id)
    const imageName = String(req.body?.image_name || '').trim()
    if (!bridgeId || !imageName) return res.status(400).json({ success: false, message: 'Invalid parameters' })
    const [rows] = await pool.query('SELECT bridge_images FROM bridge WHERE bridge_id = ? LIMIT 1', [bridgeId])
    let list = []
    const raw = rows[0]?.bridge_images
    if (raw) {
      try {
        list = Array.isArray(raw) ? raw : JSON.parse(raw)
      } catch {
        list = String(raw).split(',').map((x) => x.trim()).filter(Boolean)
      }
    }
    const updated = list.filter((x) => x !== imageName)
    await pool.query('UPDATE bridge SET bridge_images = ?, updated_by = ?, updated_on = CURDATE() WHERE bridge_id = ?', [
      updated.join(','),
      req.user?.uid || 0,
      bridgeId,
    ])
    const filePath = path.join(uploadRoot, 'bridge_images', String(bridgeId), imageName)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
})

for (const step of [
  'structure_data', 'general_data', 'approaches_data', 'protection_works', 'foundation', 'substructure',
  'bearing_pedestal', 'superstructure', 'expansion_joint', 'wearing_coat', 'handrails',
]) {
  const bridgeFlagCol =
    step === 'structure_data'
      ? 'structure_data_bridge'
      : step === 'general_data'
        ? 'general_bridge'
        : step === 'approaches_data'
          ? 'approaches_bridge'
          : step === 'protection_works'
            ? 'protection_works_bridge'
            : step === 'foundation'
              ? 'foundation_bridge'
              : step === 'substructure'
                ? 'substructure_bridge'
                : step === 'bearing_pedestal'
                  ? 'bearing_and_pedistal_bridge'
                  : step === 'superstructure'
                    ? 'superstructure_bridge'
                    : step === 'expansion_joint'
                      ? 'expansion_joint_bridge'
                      : step === 'wearing_coat'
                        ? 'wearing_coat_bridge'
                        : 'handrails_parapets_crash_barriers_bridge'

  router.get(`/bridge/${step}/:bridgeId`, async (req, res) => {
    try {
      const cfg = STEP_TABLE_MAP[step]
      if (step === 'expansion_joint') {
        const [rows] = await pool.query(
          `SELECT * FROM ${cfg.table} WHERE bridge_id = ? ORDER BY ${cfg.pk} ASC`,
          [req.params.bridgeId]
        )
        return res.json(rows)
      }
      const [rows] = await pool.query(
        `SELECT * FROM ${cfg.table} WHERE bridge_id = ? ORDER BY ${cfg.pk} DESC LIMIT 1`,
        [req.params.bridgeId]
      )
      if (rows[0]) return res.json(rows[0])
      // On this schema, bridge step columns are enum Yes/No flags.
      // If no step-row exists yet, return null.
      return res.json(null)
    } catch (e) {
      res.status(500).json({ message: e.message })
    }
  })
  router.post(`/bridge/${step}/:bridgeId`, optionalAuth, async (req, res) => {
    try {
      const cfg = STEP_TABLE_MAP[step]
      const dataObj = normalizeStepBody(req.body || {})
      const [metaRows] = await pool.query(
        `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, EXTRA
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [cfg.table]
      )
      const allowed = new Set(metaRows.map((x) => x.COLUMN_NAME))
      const statusMeta = metaRows.find((r) => r.COLUMN_NAME === 'status') || null
      const patch = Object.fromEntries(Object.entries(dataObj).filter(([k]) => allowed.has(k)))
      if (step === 'structure_data') coerceStructureDataBridgePatch(patch, allowed)
      if (allowed.has('updated_by')) patch.updated_by = req.user?.uid || 0
      if (allowed.has('updated_on')) patch.updated_on = new Date()

      const [existingByBridge] = await pool.query(
        `SELECT ${cfg.pk} AS step_id FROM ${cfg.table} WHERE bridge_id = ? ORDER BY ${cfg.pk} DESC LIMIT 1`,
        [req.params.bridgeId]
      )
      const stepId = Number(existingByBridge[0]?.step_id || 0)

      // Step 16 requirement:
      // Save each expansion joint entry as a NEW row for the same bridge_id
      // and store selected value in type_a1 column only.
      if (step === 'expansion_joint') {
        const rowsFromBody = Array.isArray(dataObj.expansion_rows) ? dataObj.expansion_rows : null
        const incomingRows = (
          rowsFromBody && rowsFromBody.length
            ? rowsFromBody
            : [dataObj.type_a1 ? { type_a1: dataObj.type_a1 } : null, dataObj.type_a2 ? { type_a1: dataObj.type_a2 } : null]
        )
          .filter(Boolean)
          .map((r) => ({
            id: Number(r?.expansion_joint_bridge_id || r?.id || 0) || null,
            type: String(r?.type_a1 || r?.type || '').trim(),
          }))
          .filter((r) => r.type)

        if (!incomingRows.length) {
          return res.status(400).json({ success: false, message: 'No expansion joint values provided' })
        }

        // Default status value based on enum definition in target table.
        const statusMeta = metaRows.find((r) => r.COLUMN_NAME === 'status') || null
        let defaultStatus = 'Pending'
        if (statusMeta?.DATA_TYPE === 'enum' && typeof statusMeta.COLUMN_TYPE === 'string') {
          const ct = statusMeta.COLUMN_TYPE
          if (ct.includes("'Active'")) defaultStatus = 'Active'
          else if (ct.includes("'Pending'")) defaultStatus = 'Pending'
        }

        const [existingRows] = await pool.query(
          `SELECT ${cfg.pk} AS row_id FROM ${cfg.table} WHERE bridge_id = ?`,
          [req.params.bridgeId]
        )
        const existingIdSet = new Set(existingRows.map((r) => Number(r.row_id)).filter(Boolean))
        const keptIds = []

        for (const item of incomingRows) {
          if (item.id && existingIdSet.has(item.id)) {
            const updates = []
            const vals = []
            if (allowed.has('type_a1')) {
              updates.push('type_a1 = ?')
              vals.push(item.type)
            }
            if (allowed.has('type_a2')) {
              updates.push('type_a2 = ?')
              vals.push('')
            }
            if (allowed.has('updated_by')) {
              updates.push('updated_by = ?')
              vals.push(req.user?.uid || 0)
            }
            if (allowed.has('updated_on')) {
              updates.push('updated_on = ?')
              vals.push(new Date())
            }
            if (updates.length) {
              vals.push(item.id, req.params.bridgeId)
              await pool.query(
                `UPDATE ${cfg.table} SET ${updates.join(', ')} WHERE ${cfg.pk} = ? AND bridge_id = ?`,
                vals
              )
            }
            keptIds.push(item.id)
            continue
          }

          const payload = {}
          if (allowed.has('bridge_id')) payload.bridge_id = req.params.bridgeId
          if (allowed.has('type_a1')) payload.type_a1 = item.type
          if (allowed.has('type_a2')) payload.type_a2 = ''
          if (allowed.has('status')) payload.status = defaultStatus
          if (allowed.has('updated_by')) payload.updated_by = req.user?.uid || 0
          if (allowed.has('updated_on')) payload.updated_on = new Date()
          if (allowed.has('created_by')) payload.created_by = req.user?.uid || 0
          if (allowed.has('created_on')) payload.created_on = new Date()

          const pkMeta = metaRows.find((r) => r.COLUMN_NAME === cfg.pk) || null
          const isAutoPk = String(pkMeta?.EXTRA || '').toLowerCase().includes('auto_increment')
          if (!isAutoPk && payload[cfg.pk] == null) {
            const [nextRows] = await pool.query(
              `SELECT COALESCE(MAX(${cfg.pk}), 0) + 1 AS next_id FROM ${cfg.table}`
            )
            payload[cfg.pk] = Number(nextRows?.[0]?.next_id || 1)
          }

          const cols = Object.keys(payload)
          const vals = cols.map((k) => payload[k])
          const [ins] = await pool.query(
            `INSERT INTO ${cfg.table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
            vals
          )
          keptIds.push(Number(ins.insertId || payload[cfg.pk] || 0))
        }

        const toDelete = [...existingIdSet].filter((id) => !keptIds.includes(id))
        if (toDelete.length) {
          await pool.query(
            `DELETE FROM ${cfg.table} WHERE bridge_id = ? AND ${cfg.pk} IN (${toDelete.map(() => '?').join(', ')})`,
            [req.params.bridgeId, ...toDelete]
          )
        }

        try {
          await pool.query(
            `UPDATE bridge SET \`${bridgeFlagCol}\` = 'Yes', updated_by = ?, updated_on = CURDATE() WHERE bridge_id = ?`,
            [req.user?.uid || 0, req.params.bridgeId]
          )
        } catch {}

        return res.json({ success: true, ids: keptIds, created: true, count: keptIds.length })
      }

      if (stepId > 0) {
        const keys = Object.keys(patch)
        if (keys.length) {
          const setClause = keys.map((k) => `${k} = ?`).join(', ')
          await pool.query(`UPDATE ${cfg.table} SET ${setClause} WHERE ${cfg.pk} = ?`, [
            ...keys.map((k) => patch[k]),
            stepId,
          ])
        }
        // PHP parity: mark step as completed in bridge table via Yes/No flag.
        try {
          await pool.query(
            `UPDATE bridge SET \`${bridgeFlagCol}\` = 'Yes', updated_by = ?, updated_on = CURDATE() WHERE bridge_id = ?`,
            [req.user?.uid || 0, req.params.bridgeId]
          )
        } catch {
          // ignore if column differs in some deployments
        }
        return res.json({ success: true, id: stepId, updated: true })
      }

      // Bootstrap from an existing row to satisfy strict NOT NULL legacy schema.
      const [tplRows] = await pool.query(`SELECT * FROM ${cfg.table} LIMIT 1`)
      const tpl = tplRows[0] || {}
      delete tpl[cfg.pk]
      // Default status must match each table's enum.
      // Many *_bridge tables in dump use enum('Active','In-Active') while others use enum('Pending','Completed').
      let defaultStatus = 'Pending'
      if (statusMeta?.DATA_TYPE === 'enum' && typeof statusMeta.COLUMN_TYPE === 'string') {
        const ct = statusMeta.COLUMN_TYPE // e.g. "enum('Active','In-Active')"
        if (ct.includes("'Active'")) defaultStatus = 'Active'
        else if (ct.includes("'Pending'")) defaultStatus = 'Pending'
        else {
          // Fallback to first enum value if we can parse it.
          const m = ct.match(/enum\((.*)\)/i)
          if (m?.[1]) {
            const first = m[1].split(',')[0]?.trim()?.replace(/^'+|'+$/g, '')
            if (first) defaultStatus = first
          }
        }
      }

      const payload = { ...tpl, ...patch, bridge_id: req.params.bridgeId }
      if (allowed.has('status') && (payload.status == null || payload.status === '')) payload.status = defaultStatus
      if (allowed.has('updated_by')) payload.updated_by = req.user?.uid || 0
      if (allowed.has('updated_on')) payload.updated_on = new Date()
      if (allowed.has('created_by') && payload.created_by == null) payload.created_by = req.user?.uid || 0
      if (allowed.has('created_on') && !payload.created_on) payload.created_on = new Date()

      // Legacy step tables in some deployments don't auto-increment PK.
      const pkMeta = metaRows.find((r) => r.COLUMN_NAME === cfg.pk) || null
      const isAutoPk = String(pkMeta?.EXTRA || '').toLowerCase().includes('auto_increment')
      if (!isAutoPk && payload[cfg.pk] == null) {
        const [nextRows] = await pool.query(
          `SELECT COALESCE(MAX(${cfg.pk}), 0) + 1 AS next_id FROM ${cfg.table}`
        )
        payload[cfg.pk] = Number(nextRows?.[0]?.next_id || 1)
      }

      const cols = Object.keys(payload).filter((k) => k !== cfg.pk || payload[cfg.pk] != null)
      const vals = cols.map((k) => payload[k])
      const [ins] = await pool.query(
        `INSERT INTO ${cfg.table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
        vals
      )
      // PHP parity: mark step as completed in bridge table via Yes/No flag.
      try {
        await pool.query(
          `UPDATE bridge SET \`${bridgeFlagCol}\` = 'Yes', updated_by = ?, updated_on = CURDATE() WHERE bridge_id = ?`,
          [req.user?.uid || 0, req.params.bridgeId]
        )
      } catch {
        // ignore if column differs in some deployments
      }
      res.json({ success: true, id: ins.insertId, created: true })
    } catch (e) {
      res.status(500).json({ message: e.message })
    }
  })
}

/** Child rows for Step 13: piers linked to substructure_bridge (substructure_piers_bridge). */
;(function mountSubstructurePiersBridgeRoutes() {
  router.get('/bridge/substructure_piers/:bridgeId', async (req, res) => {
    try {
      const bridgeId = Number(req.params.bridgeId || 0)
      if (!bridgeId) return res.status(400).json({ success: false, message: 'Invalid bridge id' })
      const [rows] = await pool.query(
        `SELECT * FROM substructure_piers_bridge WHERE bridge_id = ? ORDER BY p_id ASC`,
        [bridgeId]
      )
      res.json({ success: true, data: rows })
    } catch (e) {
      const msg = String(e.message || '')
      if (msg.includes('doesn\'t exist') || msg.includes("doesn't exist")) {
        return res.json({ success: true, data: [] })
      }
      console.error(e)
      res.status(500).json({ success: false, message: e.message })
    }
  })

  router.post('/bridge/substructure_piers/:bridgeId', optionalAuth, async (req, res) => {
    try {
      const bridgeId = Number(req.params.bridgeId || 0)
      if (!bridgeId) return res.status(400).json({ success: false, message: 'Invalid bridge id' })
      const uid = req.user?.uid || 0
      const body = req.body || {}
      const type = String(body.type || '').trim()
      const substructure_material = String(body.substructure_material || '').trim()
      const max_depth = String(
        body.max_depth_of_abutment_foundation || body.max_depth_abutment || ''
      ).trim()
      const piler_name = String(body.piler_name || body.pier_name || '').trim()

      if (!type || !substructure_material || !max_depth || !piler_name) {
        return res.status(400).json({
          success: false,
          message: 'Type, substructure material, maximum depth of abutment, and pier name are required.',
        })
      }

      const [subRows] = await pool.query(
        `SELECT substructure_bridge_id FROM substructure_bridge WHERE bridge_id = ? ORDER BY substructure_bridge_id DESC LIMIT 1`,
        [bridgeId]
      )
      const substructure_bridge_id = Number(subRows[0]?.substructure_bridge_id || 0)
      if (!substructure_bridge_id) {
        return res.status(400).json({
          success: false,
          message:
            'Save the main Substructure data (abutments A1/A2) first, then add piers.',
        })
      }

      const condition = String(body.condition || 'NA').trim() || 'NA'
      const efficiency = String(body.efficiency_of_drainage || 'NA').trim() || 'NA'

      const [nextRows] = await pool.query(
        `SELECT COALESCE(MAX(p_id), 0) + 1 AS next_id FROM substructure_piers_bridge`
      )
      const p_id = Number(nextRows?.[0]?.next_id || 1)

      await pool.query(
        `INSERT INTO substructure_piers_bridge (
          p_id, substructure_bridge_id, bridge_id, type, substructure_material,
          \`condition\`, efficiency_of_drainage, max_depth_of_abutment_foundation, piler_name,
          status, created_by, created_on, updated_by, updated_on
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?, CURDATE(), ?, CURDATE())`,
        [
          p_id,
          substructure_bridge_id,
          bridgeId,
          type,
          substructure_material,
          condition,
          efficiency,
          max_depth,
          piler_name,
          uid,
          uid,
        ]
      )
      res.json({ success: true, p_id })
    } catch (e) {
      console.error(e)
      res.status(500).json({ success: false, message: e.message })
    }
  })

  router.put('/bridge/substructure_piers/:bridgeId/:pId', optionalAuth, async (req, res) => {
    try {
      const bridgeId = Number(req.params.bridgeId || 0)
      const pId = Number(req.params.pId || 0)
      if (!bridgeId || !pId) {
        return res.status(400).json({ success: false, message: 'Invalid bridge id or pier id' })
      }
      const body = req.body || {}
      const type = String(body.type || '').trim()
      const substructure_material = String(body.substructure_material || '').trim()
      const max_depth = String(body.max_depth_of_abutment_foundation || '').trim()
      const piler_name = String(body.piler_name || '').trim()
      const [r] = await pool.query(
        `UPDATE substructure_piers_bridge
         SET type=?, substructure_material=?, max_depth_of_abutment_foundation=?, piler_name=?, updated_on=CURDATE()
         WHERE bridge_id=? AND p_id=?`,
        [type, substructure_material, max_depth, piler_name, bridgeId, pId]
      )
      res.json({ success: true, updated: Number(r.affectedRows || 0) })
    } catch (e) {
      console.error(e)
      res.status(500).json({ success: false, message: e.message })
    }
  })

  router.delete('/bridge/substructure_piers/:bridgeId/:pId', optionalAuth, async (req, res) => {
    try {
      const bridgeId = Number(req.params.bridgeId || 0)
      const pId = Number(req.params.pId || 0)
      if (!bridgeId || !pId) {
        return res.status(400).json({ success: false, message: 'Invalid bridge id or pier id' })
      }
      const [r] = await pool.query(
        `DELETE FROM substructure_piers_bridge WHERE bridge_id = ? AND p_id = ?`,
        [bridgeId, pId]
      )
      res.json({ success: true, deleted: Number(r.affectedRows || 0) })
    } catch (e) {
      console.error(e)
      res.status(500).json({ success: false, message: e.message })
    }
  })
})()

router.get('/boq/export/:bridgeId', async (req, res) => {
  try {
    const bridgeId = Number(req.params.bridgeId || 0)
    if (!bridgeId) return res.status(400).json({ message: 'Invalid bridge id' })

    const [bridgeRows] = await pool.query('SELECT * FROM bridge WHERE bridge_id = ? LIMIT 1', [bridgeId])
    const bridge = bridgeRows[0]
    if (!bridge) return res.status(404).json({ message: 'Bridge not found' })

    // Prefer last approved inspection for this bridge (PHP parity)
    const [insRows] = await pool.query(
      `SELECT bridge_inspection_id, status, created_on
       FROM bridge_inspection
       WHERE bridge_id = ?
       ORDER BY (status = 'Approved') DESC, created_on DESC
       LIMIT 1`,
      [bridgeId]
    )
    const inspection = insRows[0]
    if (!inspection?.bridge_inspection_id) {
      return res.status(404).json({ message: 'No inspection found for this bridge' })
    }
    const inspectionId = Number(inspection.bridge_inspection_id)

    const notationMap = {
      Bulging: 'BG',
      'Map Crack/Crazing': 'CRA',
      'Crack along main reinforcement': 'RC',
      'Crack perpendicular to main Reinforcement': 'RP',
      'Minor Crack': 'MC',
      'Wide Crack': 'WC',
      Spalling: 'SPL',
      'Delaminated Section': 'DL',
      Honeycombing: 'HC',
      Tilt: 'TL',
      'Steel Corroded': 'SC',
      'Steel Exposed': 'SE',
      'Seepage Evident': 'SPE',
      'Seepage Marks': 'SPM',
      Scaling: 'SL',
      'Sag in Girder': 'SG/(G)',
      'Sag in Slab': 'SG/(S)',
      Efflorescence: 'EFF',
      Settlement: 'STL',
      'Hollow Section': 'HS',
      'Vegetation Growth': 'VEG',
      'Pedestal Damage': 'PD',
      'Hollow Pocket': 'HP',
    }

    const [structural] = await pool.query(
      `SELECT *
       FROM bridge_inspection_distress
       WHERE bridge_inspection_id = ?
       ORDER BY id ASC`,
      [inspectionId]
    )

    let nonStructural = []
    try {
      const [ns] = await pool.query(
        `SELECT *
         FROM non_structural_distress
         WHERE bridge_inspection_id = ?
         ORDER BY id ASC`,
        [inspectionId]
      )
      nonStructural = ns || []
    } catch {
      nonStructural = []
    }

    let manual = []
    try {
      const [m] = await pool.query(
        `SELECT *
         FROM manual_distress
         WHERE bridge_inspection_id = ?
         ORDER BY id ASC`,
        [inspectionId]
      )
      manual = m || []
    } catch {
      manual = []
    }

    const wb = new ExcelJS.Workbook()
    wb.creator = 'BMS'
    wb.created = new Date()

    const ws = wb.addWorksheet('BOQ Data')

    // Header row (PHP parity)
    const headers = [
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
    ws.addRow(headers)
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }
    ws.views = [{ state: 'frozen', ySplit: 1 }]

    const addRow = (r) => ws.addRow(r.map((x) => (x === null || x === undefined ? '' : x)))

    const unitAndArea = (len, wid, dep, forceNos = 0) => {
      const L = Number(len || 0)
      const B = Number(wid || 0)
      const D = Number(dep || 0)
      if (L > 0 && B === 0 && D === 0) return { unit: 'RMT', area: L }
      if (L > 0 && B > 0 && D === 0) return { unit: 'Sq.m', area: L * B }
      if (L > 0 && B > 0 && D > 0) return { unit: 'Cu.m', area: L * B * D }
      return { unit: 'Nos', area: Number(forceNos || 0) }
    }

    const locText = (x, y) => {
      const X = x != null && String(x).trim() !== '' ? String(x).trim() : ''
      const Y = y != null && String(y).trim() !== '' ? String(y).trim() : ''
      return X && Y ? `X = ${X} m | Y = ${Y} m` : ''
    }

    const findRmItemNo = (rmText) => {
      const t = String(rmText || '').trim()
      if (!t) return ''
      if (RM_MEASUREMENT_MAP[t]) return RM_MEASUREMENT_MAP[t].item_no
      const key = Object.keys(RM_MEASUREMENT_MAP).find((k) => {
        const kl = k.toLowerCase()
        const tl = t.toLowerCase()
        return kl === tl || tl.includes(kl) || kl.includes(tl)
      })
      return key ? RM_MEASUREMENT_MAP[key].item_no : ''
    }

    const boqMeasureExtras = (rm, unit, area, L, B, D, nos) => {
      const n = Number(nos || 0)
      const itemNo = findRmItemNo(rm)
      const no =
        itemNo !== '' && itemNo != null ? itemNo : unit === 'Nos' && n > 0 ? n : ''
      return [no, Number(L || 0), Number(B || 0), Number(D || 0), Number(area || 0)]
    }

    const emptySection = (label) =>
      Array.from({ length: headers.length }, (_, i) => (i === 0 ? label : ''))

    // STRUCTURAL
    for (const d of structural || []) {
      const tableType = d.table_type || d.element_name || ''
      const obs = d.distress_type || d.observation || ''
      const L = d.distress_length ?? 0
      const B = d.distress_width ?? 0
      const D = d.distress_depth ?? 0
      const nos =
        d.distress_nos != null && d.distress_nos !== ''
          ? d.distress_nos
          : tableType === 'Bearing Name'
            ? 1
            : 0
      const { unit, area } = unitAndArea(L, B, D, nos)
      addRow([
        tableType,
        notationMap[obs] || obs,
        obs,
        locText(d.distance_of_distress_x, d.distance_of_distress_y),
        '-',
        unit,
        Number(L || 0),
        Number(B || 0),
        Number(D || 0),
        Number(area || 0),
        d.repair_methodology || '-',
        ...boqMeasureExtras(d.repair_methodology, unit, area, L, B, D, nos),
      ])
    }

    // NON-STRUCTURAL
    if (nonStructural.length) {
      addRow(emptySection('NON-STRUCTURAL ELEMENTS'))
    }
    for (const n of nonStructural || []) {
      const element = n.element_type || n.table_type || 'Non Structural'
      const obs = n.distress_type || n.element_description || ''
      const L = n.distress_length ?? n.l_value ?? 0
      const B = n.distress_width ?? n.w_value ?? 0
      const D = n.distress_depth ?? n.d_value ?? 0
      const nos = n.distress_nos ?? n.nos_value ?? 0
      const { unit, area } = unitAndArea(L, B, D, nos)
      addRow([
        element,
        notationMap[obs] || (obs ? '-' : '-'),
        obs,
        locText(n.distance_of_distress_x, n.distance_of_distress_y) || element,
        '-',
        unit,
        Number(L || 0),
        Number(B || 0),
        Number(D || 0),
        Number(area || 0),
        n.repair_methodology || '-',
        ...boqMeasureExtras(n.repair_methodology, unit, area, L, B, D, nos),
      ])
    }

    // MANUAL DISTRESS
    if (manual.length) {
      addRow(emptySection('MANUAL DISTRESS'))
    }
    for (const m of manual || []) {
      const element = m.element_type || 'Manual'
      const obs = m.element_description || ''
      const L = m.l_value ?? 0
      const B = m.w_value ?? 0
      const D = m.d_value ?? 0
      const nos = m.nos_value ?? 0
      const { unit, area } = unitAndArea(L, B, D, nos)
      addRow([
        element,
        '-',
        obs,
        element,
        '-',
        unit,
        Number(L || 0),
        Number(B || 0),
        Number(D || 0),
        Number(area || 0),
        '-',
        ...boqMeasureExtras('', unit, area, L, B, D, nos),
      ])
    }

    // Basic styling
    ws.columns = headers.map((h, idx) => {
      const width =
        idx === 0 ? 28 :
        idx === 2 ? 34 :
        idx === 3 ? 24 :
        idx === 10 ? 28 :
        14
      return { width }
    })

    const identity = (bridge.bridge_identity_no || `Bridge_${bridgeId}`).replace(/[^\w\-]+/g, '_')
    const filename = `BOQ_${identity}_${new Date().toISOString().split('T')[0]}.xlsx`
    const buf = await wb.xlsx.writeBuffer()

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    return res.send(Buffer.from(buf))
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

function sendPlaceholderPdf(res, filename = 'report.pdf') {
  const pdf = Buffer.from(
    '%PDF-1.4\n' +
      '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
      '2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n' +
      '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n' +
      '4 0 obj<</Length 56>>stream\n' +
      'BT /F1 18 Tf 72 720 Td (BMS report placeholder PDF) Tj ET\n' +
      'endstream\n' +
      'endobj\n' +
      '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n' +
      'xref\n0 6\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000117 00000 n \n0000000243 00000 n \n0000000349 00000 n \n' +
      'trailer<</Size 6/Root 1 0 R>>\nstartxref\n420\n%%EOF\n',
    'utf8'
  )
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send(pdf)
}

function pipePdf(res, filename, build) {
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  const doc = new PDFDocument({ size: 'A4', margin: 40 })
  doc.pipe(res)
  build(doc)
  doc.end()
}

router.post('/index.php/bmc/inspection/generate_boq_pdf', uploadNone, async (req, res) => {
  const id = Number(req.body?.bridge_inspection_id || req.body?.inspection_id || 0)
  if (!id) return sendPlaceholderPdf(res, 'boq-report.pdf')
  try {
    await pool.query(
      `UPDATE bridge_inspection
       SET boq_conclusion_report = ?, boq_causes_of_distress = ?, boq_remedial_measures = ?, boq_repair_methodology = ?, upadted_on = NOW()
       WHERE bridge_inspection_id = ?`,
      [
        req.body?.conclusion_report || '',
        req.body?.causes_of_distress || '',
        req.body?.remarks || '',
        req.body?.repair_methodology || '',
        id,
      ]
    )
  } catch {
    // continue to PDF
  }

  const [iRows] = await pool.query(
    `SELECT i.*, b.bridge_identity_no, b.chainage, b.popular_name_of_bridge, b.project_name
     FROM bridge_inspection i
     LEFT JOIN bridge b ON b.bridge_id = i.bridge_id
     WHERE i.bridge_inspection_id = ? LIMIT 1`,
    [id]
  )
  const i = iRows[0] || {}
  const [dRows] = await pool.query(
    `SELECT * FROM bridge_inspection_distress WHERE bridge_inspection_id = ? ORDER BY id`,
    [id]
  )

  return pipePdf(res, `boq-${id}.pdf`, (doc) => {
    doc.fontSize(16).text('BOQ Report', { align: 'center' })
    doc.moveDown()
    doc.fontSize(10)
    doc.text(`Inspection ID: ${id}`)
    doc.text(`Bridge Identity No: ${i.bridge_identity_no || ''}`)
    doc.text(`Project: ${i.project_name || ''}`)
    doc.text(`Chainage: ${i.chainage || ''}`)
    doc.text(`Bridge Name: ${i.popular_name_of_bridge || ''}`)
    doc.moveDown()
    doc.fontSize(12).text('Distress List', { underline: true })
    doc.moveDown(0.5)
    doc.fontSize(8)

    const headers = ['Element', 'Observation', 'Location', 'L', 'W', 'D', 'Repair']
    doc.text(headers.join(' | '))
    doc.moveDown(0.25)
    doc.text('-'.repeat(110))
    doc.moveDown(0.25)

    for (const r of dRows || []) {
      const line = [
        r.element_name || r.table_type || '',
        String(r.observation || '').replace(/\s+/g, ' ').trim().slice(0, 40),
        String(r.location || '').replace(/\s+/g, ' ').trim().slice(0, 25),
        r.distress_length ?? '',
        r.distress_width ?? '',
        r.distress_depth ?? '',
        String(r.repair_methodology || '').replace(/\s+/g, ' ').trim().slice(0, 25),
      ]
      doc.text(line.join(' | '))
    }

    doc.moveDown()
    doc.fontSize(10).text('Conclusion / Remarks', { underline: true })
    doc.moveDown(0.25)
    doc.fontSize(9).text(i.boq_conclusion_report || req.body?.conclusion_report || '')
    doc.moveDown()
    doc.fontSize(10).text('Causes of Distress', { underline: true })
    doc.moveDown(0.25)
    doc.fontSize(9).text(i.boq_causes_of_distress || req.body?.causes_of_distress || '')
    doc.moveDown()
    doc.fontSize(10).text('Remedial Measures', { underline: true })
    doc.moveDown(0.25)
    doc.fontSize(9).text(i.boq_remedial_measures || req.body?.remarks || '')
  })
})

router.get('/index.php/bmc/bridge/export_pdf/:bridgeId', async (req, res) => {
  try {
    const bridgeId = Number(req.params.bridgeId || 0)
    if (!bridgeId) return res.status(400).json({ message: 'Invalid bridge id' })

    const [bRows] = await pool.query('SELECT * FROM bridge WHERE bridge_id = ? LIMIT 1', [bridgeId])
    const bridge = bRows[0]
    if (!bridge) return res.status(404).json({ message: 'Not found' })

    // Load each step table (latest row for this bridge_id)
    const steps = [
      { key: 'structure_data_bridge', table: 'structure_data_bridge', pk: 'structure_data_bridge_id' },
      { key: 'general_bridge', table: 'general_bridge', pk: 'general_id' },
      { key: 'approaches_bridge', table: 'approaches_bridge', pk: 'approaches_bridge_id' },
      { key: 'protection_works_bridge', table: 'protection_works_bridge', pk: 'protection_works_bridge_id' },
      { key: 'foundation_bridge', table: 'foundation_bridge', pk: 'foundation_bridge_id' },
      { key: 'substructure_bridge', table: 'substructure_bridge', pk: 'substructure_bridge_id' },
      { key: 'bearing_and_pedistal_bridge', table: 'bearing_and_pedistal_bridge', pk: 'bearing_and_pedistal_bridge_id' },
      { key: 'superstructure_bridge', table: 'superstructure_bridge', pk: 'superstructure_bridge_id' },
      { key: 'expansion_joint_bridge', table: 'expansion_joint_bridge', pk: 'expansion_joint_bridge_id' },
      { key: 'wearing_coat_bridge', table: 'wearing_coat_bridge', pk: 'wearing_coat_bridge_id' },
      {
        key: 'handrails_parapets_crash_barriers_bridge',
        table: 'handrails_parapets_crash_barriers_bridge',
        pk: 'handrails_parapets_crash_barriers_bridge_id',
      },
    ]

    const stepData = {}
    for (const s of steps) {
      try {
        const [rows] = await pool.query(
          `SELECT * FROM \`${s.table}\` WHERE bridge_id = ? ORDER BY \`${s.pk}\` DESC LIMIT 1`,
          [bridgeId]
        )
        stepData[s.key] = rows[0] || null
      } catch {
        stepData[s.key] = null
      }
    }

    return pipePdf(res, `bridge-${bridgeId}.pdf`, (doc) => {
      doc.fontSize(16).text('Bridge Report', { align: 'center' })
      doc.moveDown()
      doc.fontSize(10)
      doc.text(`Bridge ID: ${bridge.bridge_id}`)
      doc.text(`Bridge Identity No: ${bridge.bridge_identity_no || ''}`)
      doc.text(`Project Name: ${bridge.project_name || ''}`)
      doc.text(`State: ${bridge.state_id ?? ''} | Zone: ${bridge.zone ?? ''}`)
      doc.text(`Road Type: ${bridge.road_type || ''} | Highway No: ${bridge.highway_no || ''}`)
      doc.text(`Chainage: ${bridge.chainage || ''}`)
      doc.moveDown()

      const writeSection = (title, obj) => {
        doc.fontSize(12).text(title, { underline: true })
        doc.moveDown(0.25)
        doc.fontSize(8)
        if (!obj) {
          doc.text('No data.')
          doc.moveDown()
          return
        }
        const keys = Object.keys(obj).filter((k) => !['created_on', 'updated_on', 'created_by', 'updated_by'].includes(k))
        for (const k of keys) {
          const v = obj[k]
          if (v === null || v === undefined || v === '') continue
          doc.text(`${k}: ${String(v)}`)
        }
        doc.moveDown()
      }

      writeSection('Step 1: Bridge', bridge)
      writeSection('Step 8: Structure Data', stepData.structure_data_bridge)
      writeSection('Step 9: General', stepData.general_bridge)
      writeSection('Step 10: Approaches', stepData.approaches_bridge)
      writeSection('Step 11: Protection Works', stepData.protection_works_bridge)
      writeSection('Step 12: Foundation', stepData.foundation_bridge)
      writeSection('Step 13: Substructure', stepData.substructure_bridge)
      writeSection('Step 14: Bearing & Pedestal', stepData.bearing_and_pedistal_bridge)
      writeSection('Step 15: Superstructure', stepData.superstructure_bridge)
      writeSection('Step 16: Expansion Joint', stepData.expansion_joint_bridge)
      writeSection('Step 17: Wearing Coat', stepData.wearing_coat_bridge)
      writeSection('Step 18: Handrails/Parapets/Crash Barriers', stepData.handrails_parapets_crash_barriers_bridge)
    })
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

async function exportBridgeExcel(req, res) {
  try {
    const bridgeId = Number(req.params.bridgeId || 0)
    if (!bridgeId) return res.status(400).json({ message: 'Invalid bridge id' })

    const [bRows] = await pool.query('SELECT * FROM bridge WHERE bridge_id = ? LIMIT 1', [bridgeId])
    const bridge = bRows[0]
    if (!bridge) return res.status(404).json({ message: 'Not found' })

    const steps = [
      { title: 'Step 1: Bridge', table: 'bridge', pk: 'bridge_id', key: 'bridge' },
      { title: 'Step 8: Structure Data', table: 'structure_data_bridge', pk: 'structure_data_bridge_id', key: 'structure_data_bridge' },
      { title: 'Step 9: General', table: 'general_bridge', pk: 'general_id', key: 'general_bridge' },
      { title: 'Step 10: Approaches', table: 'approaches_bridge', pk: 'approaches_bridge_id', key: 'approaches_bridge' },
      { title: 'Step 11: Protection Works', table: 'protection_works_bridge', pk: 'protection_works_bridge_id', key: 'protection_works_bridge' },
      { title: 'Step 12: Foundation', table: 'foundation_bridge', pk: 'foundation_bridge_id', key: 'foundation_bridge' },
      { title: 'Step 13: Substructure', table: 'substructure_bridge', pk: 'substructure_bridge_id', key: 'substructure_bridge' },
      { title: 'Step 14: Bearing & Pedestal', table: 'bearing_and_pedistal_bridge', pk: 'bearing_and_pedistal_bridge_id', key: 'bearing_and_pedistal_bridge' },
      { title: 'Step 15: Superstructure', table: 'superstructure_bridge', pk: 'superstructure_bridge_id', key: 'superstructure_bridge' },
      { title: 'Step 16: Expansion Joint', table: 'expansion_joint_bridge', pk: 'expansion_joint_bridge_id', key: 'expansion_joint_bridge' },
      { title: 'Step 17: Wearing Coat', table: 'wearing_coat_bridge', pk: 'wearing_coat_bridge_id', key: 'wearing_coat_bridge' },
      { title: 'Step 18: Handrails/Parapets/Crash Barriers', table: 'handrails_parapets_crash_barriers_bridge', pk: 'handrails_parapets_crash_barriers_bridge_id', key: 'handrails_parapets_crash_barriers_bridge' },
    ]

    const stepData = { bridge }
    for (const s of steps) {
      if (s.table === 'bridge') continue
      try {
        const [rows] = await pool.query(
          `SELECT * FROM \`${s.table}\` WHERE bridge_id = ? ORDER BY \`${s.pk}\` DESC LIMIT 1`,
          [bridgeId]
        )
        stepData[s.key] = rows[0] || null
      } catch {
        stepData[s.key] = null
      }
    }

    const wb = new ExcelJS.Workbook()
    wb.creator = 'BMS'
    wb.created = new Date()

    const ws = wb.addWorksheet('Bridge Report')
    ws.columns = [
      { header: 'Field', key: 'field', width: 45 },
      { header: 'Value', key: 'value', width: 80 },
    ]

    const addTitle = (text) => {
      ws.addRow([])
      const r = ws.addRow([text, ''])
      r.font = { bold: true, size: 14 }
    }

    const addSection = (title, obj) => {
      ws.addRow([])
      const r = ws.addRow([title, ''])
      r.font = { bold: true, size: 12 }
      if (!obj) {
        ws.addRow(['No data', ''])
        return
      }
      const keys = Object.keys(obj).filter((k) => !['created_on', 'updated_on', 'created_by', 'updated_by'].includes(k))
      for (const k of keys) {
        const v = obj[k]
        if (v === null || v === undefined || v === '') continue
        ws.addRow([k, String(v)])
      }
    }

    addTitle('BRIDGE DETAILED REPORT')
    addSection('Basic', {
      bridge_id: bridge.bridge_id,
      bridge_identity_no: bridge.bridge_identity_no || '',
      project_name: bridge.project_name || '',
      state_id: bridge.state_id ?? '',
      zone: bridge.zone ?? '',
      road_type: bridge.road_type || '',
      highway_no: bridge.highway_no || '',
      chainage: bridge.chainage || '',
      bridge_no: bridge.bridge_no || '',
      bridge_side: bridge.bridge_side || '',
    })

    for (const s of steps) {
      const obj = s.table === 'bridge' ? bridge : stepData[s.key]
      addSection(s.title, obj)
    }

    // Nice formatting
    ws.getRow(1).font = { bold: true }
    ws.views = [{ state: 'frozen', ySplit: 1 }]

    const buf = await wb.xlsx.writeBuffer()
    const identity = (bridge.bridge_identity_no || `Bridge_${bridgeId}`).replace(/[^\w\-]+/g, '_')
    const filename = `Bridge_Report_${identity}_${new Date().toISOString().split('T')[0]}.xlsx`

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    return res.send(Buffer.from(buf))
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
}

router.get('/index.php/bmc/bridge/export_excel/:bridgeId', exportBridgeExcel)
router.get('/bmc/bridge/export_excel/:bridgeId', exportBridgeExcel)

router.post('/inspection/upload_lidar_pdf/:inspectionId', optionalAuth, upload.single('file'), async (req, res) => {
  const inspectionId = Number(req.params.inspectionId || 0)
  if (!inspectionId) return res.status(400).json({ success: false, message: 'Invalid inspection id' })
  const f = req.file
  if (!f) return res.status(400).json({ success: false, message: 'No file' })
  const finalName = `${inspectionId}_Lidar.pdf`
  const finalPath = path.join(uploadRoot, 'download', finalName)
  try {
    fs.renameSync(f.path, finalPath)
    await mirrorUploadRelPath(`upload/download/${finalName}`, uploadRoot)
  } catch {
    // ignore
  }
  res.json({ success: true, filename: finalName })
})

router.post('/inspection/upload_sar_pdf/:inspectionId', optionalAuth, upload.single('file'), async (req, res) => {
  const inspectionId = Number(req.params.inspectionId || 0)
  if (!inspectionId) return res.status(400).json({ success: false, message: 'Invalid inspection id' })
  const f = req.file
  if (!f) return res.status(400).json({ success: false, message: 'No file' })
  const finalName = `${inspectionId}_Sar.pdf`
  const finalPath = path.join(uploadRoot, 'download', finalName)
  try {
    fs.renameSync(f.path, finalPath)
    await mirrorUploadRelPath(`upload/download/${finalName}`, uploadRoot)
  } catch {
    // ignore
  }
  res.json({ success: true, filename: finalName })
})

router.get('/api/storage/status', optionalAuth, (_req, res) => {
  res.json({ ok: true, storage: storageStatus() })
})

router.get('/api/files/presign', optionalAuth, async (req, res) => {
  try {
    const key = toObjectKey(req.query?.key || req.query?.path || '')
    if (!key) return res.status(400).json({ message: 'Missing key' })
    if (!isStorageEnabled()) {
      return res.status(503).json({ message: 'Object storage is not configured' })
    }
    if (!(await objectExists(key))) {
      return res.status(404).json({ message: 'File not found in bucket' })
    }
    const url = await getPresignedUrl(key)
    if (!url) return res.status(500).json({ message: 'Could not create presigned URL' })
    res.json({ ok: true, key, url, expiresIn: Number(process.env.PRESIGNED_URL_EXPIRY_SEC || 3600) })
  } catch (e) {
    console.error('presign error:', e)
    res.status(500).json({ message: e.message || 'Presign failed' })
  }
})

/** Lidar PDF — GET only; file at upload/download/{inspectionId}_Lidar.pdf (disk or bucket). */
router.get('/index.php/bmc/inspection/download_lidar_pdf/:inspectionId', async (req, res) => {
  const inspectionId = Number(req.params.inspectionId || 0)
  const finalName = `${inspectionId}_Lidar.pdf`
  const p = path.join(uploadRoot, 'download', finalName)
  const s3Key = `upload/download/${finalName}`
  if (inspectionId && fs.existsSync(p)) return res.download(p)
  if (await redirectToBucketObject(res, s3Key)) return
  sendPlaceholderPdf(res, `lidar-${req.params.inspectionId}.pdf`)
})

/** SAR PDF — GET only; file at upload/download/{inspectionId}_Sar.pdf (disk or bucket). */
router.get('/index.php/bmc/inspection/download_sar_pdf/:inspectionId', async (req, res) => {
  const inspectionId = Number(req.params.inspectionId || 0)
  const finalName = `${inspectionId}_Sar.pdf`
  const p = path.join(uploadRoot, 'download', finalName)
  const s3Key = `upload/download/${finalName}`
  if (inspectionId && fs.existsSync(p)) return res.download(p)
  if (await redirectToBucketObject(res, s3Key)) return
  sendPlaceholderPdf(res, `sar-${req.params.inspectionId}.pdf`)
})

export default router
