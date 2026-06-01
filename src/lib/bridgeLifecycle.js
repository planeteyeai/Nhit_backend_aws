/** Bridge lifecycle: Inventory (1) → Inspection (2) → Boq (3) → Draft Report (4) */

export const LIFECYCLE_STAGE_LABELS = ['Inventory', 'Inspection', 'Boq', 'Draft Report']

function norm(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

function hasBoqDraft(row) {
  const conclusion = String(row?.latest_boq_conclusion_report ?? row?.boq_conclusion_report ?? '').trim()
  const layout = String(
    row?.latest_boq_structure_layout_images ?? row?.boq_structure_layout_images ?? '',
  ).trim()
  return Boolean(conclusion) || (layout && layout !== '[]')
}

function hasInventoryCompleted(row) {
  const bridgeStatus = norm(row?.status)
  if (bridgeStatus === 'active' || bridgeStatus === 'completed' || bridgeStatus === 'closed') return true
  if (norm(row?.form_filled) === 'yes') return true
  if (norm(row?.structure_data_bridge) === 'yes') return true
  return false
}

/**
 * Derive lifecycle step from bridge + latest inspection fields (see inspectionWhereClause in bmsRoutes).
 * Bridge: status Pending|Completed|Closed, bmc_status No|Approved|Rejected
 * Inspection: status Pending|Confirmed|Approved|Closed, bmc_inspection_status No|Approved|Rejected
 */
export function computeBridgeLifecycleStage(row) {
  if (!row) return 1

  const explicit = Number(row.lifecycle_stage ?? row.inspection_stage)
  if (Number.isFinite(explicit) && explicit >= 1 && explicit <= 4) {
    return Math.round(explicit)
  }

  const bridgeStatus = norm(row.status)
  const bridgeBmc = norm(row.bmc_status || 'no')
  const inspStatus = norm(row.latest_inspection_status)
  const inspBmc = norm(row.latest_bmc_inspection_status || 'no')
  const hasInsp = row.latest_bridge_inspection_id != null && String(row.latest_bridge_inspection_id).trim() !== ''
  const scheduled =
    row.schedule_regular_si_id != null ||
    row.schedule_adhoc_id != null ||
    norm(row.is_inspecion_schedule) === 'yes'

  // Stage 4 — draft report (BMC approved inspection, or BOQ draft saved)
  if (inspBmc === 'approved') return 4
  if (inspStatus === 'approved' && hasBoqDraft(row)) return 4

  // Stage 3 — BOQ (site approved inspection; pending or rejected BMC inspection)
  if (inspStatus === 'approved') return 3
  if (inspBmc === 'rejected') return 3

  // Stage 2 — inspection in progress or scheduled
  if (inspStatus === 'pending' || inspStatus === 'confirmed') return 2
  if (bridgeStatus === 'active') return 2
  if (bridgeBmc === 'approved') {
    if (scheduled) return 2
    if (hasInsp && inspStatus !== 'closed') return 2
    if (!hasInsp) return 2
  }
  if (hasInventoryCompleted(row) && bridgeBmc !== 'rejected') return 2

  // Stage 1 — bridge inventory / pending BMC bridge approval
  if (bridgeStatus === 'pending') return 1
  if (bridgeBmc === 'rejected') return 1
  if (bridgeStatus === 'completed' && (bridgeBmc === 'no' || bridgeBmc === '')) return 1
  if (bridgeBmc !== 'approved') return 1

  return 1
}

export function lifecycleStageLabel(stage) {
  const n = Math.min(4, Math.max(1, Number(stage) || 1))
  return LIFECYCLE_STAGE_LABELS[n - 1]
}

/** Short status line for listing UI (helps verify tracking). */
export function bridgeTrackingStatusHint(row) {
  const bridgeStatus = String(row?.status ?? '—').trim() || '—'
  const bridgeBmc = String(row?.bmc_status ?? 'No').trim() || 'No'
  const parts = [`Bridge ${bridgeStatus}`, `BMC ${bridgeBmc}`]

  if (row?.latest_bridge_inspection_id) {
    const inspStatus = String(row?.latest_inspection_status ?? '—').trim() || '—'
    const inspBmc = String(row?.latest_bmc_inspection_status ?? 'No').trim() || 'No'
    parts.push(`Insp ${inspStatus}`, `Insp BMC ${inspBmc}`)
  } else if (
    row?.schedule_regular_si_id ||
    row?.schedule_adhoc_id ||
    norm(row?.is_inspecion_schedule) === 'yes'
  ) {
    parts.push('Scheduled')
  } else if (norm(row?.bmc_status) === 'approved') {
    parts.push('Awaiting inspection')
  }

  return parts.join(' · ')
}
