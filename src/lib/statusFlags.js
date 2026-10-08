/**
 * Canonical BMS status / Yes-No architecture.
 *
 * Bridge inventory:
 *   status: Pending → Completed (submit) → Closed (archived after BMC Approved, optional)
 *   bmc_status: No → Approved | Rejected
 *   *_bridge flags: step saved
 *   form_filled: Yes when all required inventory step flags are Yes
 *
 * Inspection:
 *   status: Pending | Confirmed → Approved | Closed; Reject → Pending
 *   bmc_inspection_status: No → Approved | Rejected
 *   section Yes/No columns: section saved (source of truth for Edit Pending checklist)
 */

/** Bridge inventory step completion columns on `bridge`. */
export const BRIDGE_STEP_FLAGS = [
  'structure_data_bridge',
  'general_bridge',
  'approaches_bridge',
  'protection_works_bridge',
  'foundation_bridge',
  'substructure_bridge',
  'bearing_and_pedistal_bridge',
  'superstructure_bridge',
  'expansion_joint_bridge',
  'wearing_coat_bridge',
  'handrails_parapets_crash_barriers_bridge',
]

/**
 * Inspection UI row key → DB column on `bridge_inspection`.
 * `subways` UI key maps to schema column `for_subways` (legacy name).
 */
export const INSPECTION_UI_TO_FLAG = {
  structure_data: 'bridge_inspection',
  general: 'general',
  approaches: 'approaches',
  protection_works: 'protection_works',
  waterway: 'waterway',
  foundation: 'foundation',
  substructure: 'substructure',
  subways: 'for_subways',
  bearing: 'bearing_and_pedestal',
  bearing_and_pedestal: 'bearing_and_pedestal',
  superstructure: 'superstructure',
  expansion_joint: 'expansion_joint',
  wearing_coat: 'wearing_coat',
  drainage: 'drainage_spouts_and_vest_holes',
  drainage_spouts_and_vest_holes: 'drainage_spouts_and_vest_holes',
  handrails: 'hand_rails_&_parapets_walls',
  footpaths: 'footpaths',
  utilities: 'utilities',
}

/** Component API key → DB flag column (used by /inspection/:component upsert). */
export const INSPECTION_COMPONENT_FLAGS = {
  general: 'general',
  approaches: 'approaches',
  protection_works: 'protection_works',
  waterway: 'waterway',
  subways: 'for_subways',
  wearing_coat: 'wearing_coat',
  drainage_spouts_and_vest_holes: 'drainage_spouts_and_vest_holes',
  handrails: 'hand_rails_&_parapets_walls',
  footpaths: 'footpaths',
  utilities: 'utilities',
  foundation: 'foundation',
  substructure: 'substructure',
  bearing_and_pedestal: 'bearing_and_pedestal',
  superstructure: 'superstructure',
  expansion_joint: 'expansion_joint',
}

/** All Yes/No section flags reset on new inspection create. */
export const INSPECTION_SECTION_FLAGS = [
  'bridge_inspection',
  ...new Set(Object.values(INSPECTION_COMPONENT_FLAGS)),
  // Reserved / unused in current UI — keep reset so template copy never sticks Yes
  'bridge_number',
  'environment',
  'aesthetics',
]

export function isYes(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase() === 'yes'
}

export function resetInspectionSectionFlags(payload, { keep = [] } = {}) {
  if (!payload || typeof payload !== 'object') return payload
  const keepSet = new Set(keep)
  for (const flag of INSPECTION_SECTION_FLAGS) {
    if (keepSet.has(flag)) continue
    payload[flag] = 'No'
  }
  return payload
}

/** SET one inspection section flag to Yes (no-op if column missing). */
export async function markInspectionSectionYes(pool, inspectionId, flagCol, userId = 0) {
  const id = Number(inspectionId || 0)
  const flag = String(flagCol || '').trim()
  if (!id || !flag) return false
  try {
    const [cols] = await pool.query(
      `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'bridge_inspection'
         AND COLUMN_NAME = ?
       LIMIT 1`,
      [flag],
    )
    if (!cols.length) return false
    await pool.query(
      `UPDATE bridge_inspection
       SET \`${flag}\` = 'Yes', updated_by = ?, upadted_on = CURDATE()
       WHERE bridge_inspection_id = ?`,
      [Number(userId || 0), id],
    )
    return true
  } catch (e) {
    console.warn('[statusFlags] markInspectionSectionYes failed:', flag, e.message)
    return false
  }
}

/** SET bridge inventory step flag Yes, then refresh form_filled. */
export async function markBridgeStepYes(pool, bridgeId, flagCol, userId = 0) {
  const id = Number(bridgeId || 0)
  const flag = String(flagCol || '').trim()
  if (!id || !flag) return false
  try {
    await pool.query(
      `UPDATE bridge SET \`${flag}\` = 'Yes', updated_by = ?, updated_on = CURDATE() WHERE bridge_id = ?`,
      [Number(userId || 0), id],
    )
  } catch (e) {
    console.warn('[statusFlags] markBridgeStepYes failed:', flag, e.message)
    return false
  }
  await refreshBridgeFormFilled(pool, id, userId)
  return true
}

/**
 * form_filled = Yes when every required inventory step flag is Yes.
 * Also forced Yes when bridge.status is already Completed/Closed.
 */
export async function refreshBridgeFormFilled(pool, bridgeId, userId = 0) {
  const id = Number(bridgeId || 0)
  if (!id) return false
  try {
    const cols = BRIDGE_STEP_FLAGS.map((c) => `\`${c}\``).join(', ')
    const [rows] = await pool.query(
      `SELECT status, ${cols} FROM bridge WHERE bridge_id = ? LIMIT 1`,
      [id],
    )
    const row = rows[0]
    if (!row) return false
    const status = String(row.status || '').trim().toLowerCase()
    const allSteps =
      status === 'completed' ||
      status === 'closed' ||
      BRIDGE_STEP_FLAGS.every((f) => isYes(row[f]))
    await pool.query(
      `UPDATE bridge SET form_filled = ?, updated_by = ?, updated_on = CURDATE() WHERE bridge_id = ?`,
      [allSteps ? 'Yes' : 'No', Number(userId || 0), id],
    )
    return allSteps
  } catch (e) {
    console.warn('[statusFlags] refreshBridgeFormFilled failed:', e.message)
    return false
  }
}

/**
 * BMC inventory decision.
 * Approved → bmc_status Approved, form_filled Yes, status stays Completed (or set Completed if empty).
 * Rejected → Pending + Rejected for resubmit.
 * Closed is reserved for explicit archive (POST /bridges/:id/close).
 */
export async function applyBridgeBmcDecision(pool, bridgeId, decision, userId = 0) {
  const id = Number(bridgeId || 0)
  const d = String(decision || '').trim().toLowerCase()
  if (!id || !['approved', 'rejected'].includes(d)) return false
  if (d === 'approved') {
    await pool.query(
      `UPDATE bridge
       SET bmc_status = 'Approved',
           status = CASE WHEN status = 'Pending' THEN 'Completed' ELSE status END,
           form_filled = 'Yes',
           bmc_status_updated_on = NOW(),
           updated_by = ?,
           updated_on = NOW()
       WHERE bridge_id = ?`,
      [Number(userId || 0), id],
    )
  } else {
    await pool.query(
      `UPDATE bridge
       SET bmc_status = 'Rejected',
           status = 'Pending',
           bmc_status_updated_on = NOW(),
           updated_by = ?,
           updated_on = NOW()
       WHERE bridge_id = ?`,
      [Number(userId || 0), id],
    )
  }
  return true
}

/** Explicit archive: bridge leaves active inventory queues. */
export async function closeBridgeInventory(pool, bridgeId, userId = 0) {
  const id = Number(bridgeId || 0)
  if (!id) return false
  await pool.query(
    `UPDATE bridge
     SET status = 'Closed',
         form_filled = 'Yes',
         updated_by = ?,
         updated_on = NOW()
     WHERE bridge_id = ?`,
    [Number(userId || 0), id],
  )
  return true
}

/** Build Edit-Pending checklist booleans from a bridge_inspection row. */
export function inspectionChecklistFromRow(row) {
  const out = {}
  if (!row) return out
  for (const [uiKey, flag] of Object.entries(INSPECTION_UI_TO_FLAG)) {
    if (uiKey === 'bearing_and_pedestal' || uiKey === 'drainage_spouts_and_vest_holes') continue
    out[uiKey] = isYes(row[flag])
  }
  return out
}
