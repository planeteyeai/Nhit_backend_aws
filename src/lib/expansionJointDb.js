let linkColumnReady = false

export async function ensureExpansionJointBridgeLinkColumn(pool) {
  if (linkColumnReady) return true
  try {
    await pool.query(
      'ALTER TABLE expansion_joint ADD COLUMN expansion_joint_bridge_id INT NULL DEFAULT NULL'
    )
  } catch {
    /* column may already exist */
  }
  linkColumnReady = true
  return true
}

export async function getExpansionJointBridgeItems(pool, bridgeId) {
  const id = Number(bridgeId || 0)
  if (!id) return []
  const [rows] = await pool.query(
    `SELECT id, bridge_id, expansion_name, expansion_type, default_condition, display_order
     FROM expansion_joint_bridge_items
     WHERE bridge_id = ?
     ORDER BY display_order ASC, id ASC`,
    [id]
  )
  return rows || []
}

export async function replaceExpansionJointBridgeItems(pool, bridgeId, items = [], userId = 0) {
  const id = Number(bridgeId || 0)
  if (!id) return false
  await pool.query('DELETE FROM expansion_joint_bridge_items WHERE bridge_id = ?', [id])
  if (!items.length) return true

  const uid = Number(userId || 0)
  const now = new Date()
  let order = 1
  for (const item of items) {
    const type = String(item?.expansion_type || item?.type || '').trim()
    if (!type) continue
    const name =
      String(item?.expansion_name || item?.name || '').trim() ||
      `Type of expansion joint ${order}`
    await pool.query(
      `INSERT INTO expansion_joint_bridge_items
       (bridge_id, expansion_name, expansion_type, default_condition, display_order, created_by, created_on, updated_by, updated_on)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        name,
        type,
        String(item?.default_condition || 'Good').trim() || 'Good',
        Number(item?.display_order || order),
        uid || null,
        now,
        uid || null,
        now,
      ]
    )
    order += 1
  }
  return true
}

export async function fetchBridgeExpansionInventory(pool, bridgeId) {
  const id = Number(bridgeId || 0)
  if (!id) return []
  const [rows] = await pool.query(
    `SELECT expansion_joint_bridge_id, bridge_id, type_a1, type_a2, status, updated_on
     FROM expansion_joint_bridge
     WHERE bridge_id = ?
     ORDER BY expansion_joint_bridge_id ASC`,
    [id]
  )
  return rows || []
}

/**
 * Templates for inspection list: prefer expansion_joint_bridge_items, else expansion_joint_bridge.
 * Inspection rows are created only when the user saves each form (PHP expansion_list parity).
 */
export async function fetchBridgeExpansionTemplates(pool, bridgeId) {
  const id = Number(bridgeId || 0)
  if (!id) return []

  const bridgeRows = await fetchBridgeExpansionInventory(pool, id)
  const itemRows = await getExpansionJointBridgeItems(pool, id)

  if (itemRows.length) {
    return itemRows
      .map((item, idx) => {
        const bridgeRow = bridgeRows[idx] || {}
        const type = String(item.expansion_type || bridgeRow.type_a1 || '').trim()
        if (!type) return null
        return {
          expansion_joint_bridge_id: Number(bridgeRow.expansion_joint_bridge_id || 0) || null,
          bridge_id: id,
          type_a1: type,
          expansion_name:
            String(item.expansion_name || '').trim() || `Type of expansion joint ${idx + 1}`,
          default_condition: String(item.default_condition || 'Good').trim() || 'Good',
          display_order: Number(item.display_order || idx + 1),
        }
      })
      .filter(Boolean)
  }

  return bridgeRows
    .map((row, idx) => {
      const type = String(row.type_a1 || '').trim()
      if (!type) return null
      return {
        expansion_joint_bridge_id: Number(row.expansion_joint_bridge_id || 0) || null,
        bridge_id: id,
        type_a1: type,
        expansion_name: `Type of expansion joint ${idx + 1}`,
        default_condition: 'Good',
        display_order: idx + 1,
      }
    })
    .filter(Boolean)
}
