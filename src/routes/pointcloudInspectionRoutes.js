/**
 * Object Removal + Distress Highlighter persistence for the embedded Potree viewer.
 *
 * Every route requires a valid BMS JWT (same Bearer token the rest of the API uses).
 * Full catalog list is Admin/BMC only. Deletes require owner or Admin/BMC.
 */
import { createRequire } from 'module'
import express from 'express'
import { requireAuth, attachDbUserRole, isUserManager } from '../middleware/auth.js'

const require = createRequire(import.meta.url)
const store = require('../pointcloudViewer/lib/inspectionStore.js')

function actor(req) {
  const u = req.user || {}
  return u.username || (u.uid != null ? String(u.uid) : null)
}

function fail(res, err) {
  const status = Number.isInteger(err?.status) ? err.status : 500
  if (status >= 500) console.error('[pointcloud-inspection]', err)
  res.status(status).json({ error: status >= 500 ? 'Server error' : err.message || 'Request failed' })
}

async function refreshActor(req) {
  try {
    await attachDbUserRole(req)
  } catch {
    /* keep JWT claims if DB briefly unavailable */
  }
}

function sameActor(a, b) {
  if (a == null || b == null) return false
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase()
}

/** Deletes: Admin/BMC, or original createdBy. Legacy null createdBy → managers only. */
async function assertCanDeleteProject(req, projectId) {
  await refreshActor(req)
  if (isUserManager(req.user)) return true
  const project = await store.getProject(projectId).catch(() => null)
  const owner = project?.createdBy
  if (!owner) {
    const err = new Error('Forbidden')
    err.status = 403
    throw err
  }
  if (!sameActor(owner, actor(req))) {
    const err = new Error('Forbidden')
    err.status = 403
    throw err
  }
  return true
}

export function createPointcloudInspectionRouter() {
  const router = express.Router()
  router.use(requireAuth)

  router.get('/', async (req, res) => {
    try {
      await refreshActor(req)
      const { projectId, action } = req.query
      // Full catalog enumeration is admin/BMC only — stops IDOR reconnaissance.
      if (action === 'list' || (!projectId && !action)) {
        if (!isUserManager(req.user)) {
          return res.status(403).json({ error: 'Forbidden' })
        }
        return res.json(await store.listProjects())
      }
      if (action === 'csv') {
        if (!projectId) return res.status(400).json({ error: 'projectId required' })
        const csv = await store.exportCsv(projectId)
        res.setHeader('Content-Type', 'text/csv; charset=utf-8')
        const fileId = String(projectId).replace(/[^a-zA-Z0-9._+-]+/g, '_')
        res.setHeader('Content-Disposition', `attachment; filename="${fileId}_distress.csv"`)
        return res.send(csv)
      }
      if (action === 'removals') {
        if (!projectId) return res.status(400).json({ error: 'projectId required' })
        return res.json({ projectId, removals: await store.getRemovals(projectId) })
      }
      if (projectId) return res.json(await store.getProject(projectId))
      return res.status(400).json({ error: 'projectId required' })
    } catch (err) {
      fail(res, err)
    }
  })

  router.post('/', async (req, res) => {
    try {
      await refreshActor(req)
      const body = req.body || {}
      const action = req.query.action || body.action
      if (action === 'project') return res.json(await store.createOrUpdateProject(body, actor(req)))
      if (action === 'removals') {
        if (!body.projectId) return res.status(400).json({ error: 'projectId required' })
        const saved = await store.saveRemovals(body.projectId, body.removals || body, body.cloudName, actor(req))
        return res.json({ ok: true, removals: saved })
      }
      if (!body.projectId) return res.status(400).json({ error: 'projectId required' })
      return res.json(await store.saveDistress(body.projectId, body.distress || body, actor(req)))
    } catch (err) {
      fail(res, err)
    }
  })

  router.put('/', async (req, res) => {
    try {
      await refreshActor(req)
      const body = req.body || {}
      if (!body.projectId || !(body.distress?.id || body.id)) {
        return res.status(400).json({ error: 'projectId and distress.id required' })
      }
      return res.json(await store.saveDistress(body.projectId, body.distress || body, actor(req)))
    } catch (err) {
      fail(res, err)
    }
  })

  router.delete('/', async (req, res) => {
    try {
      const { projectId, distressId } = req.query
      if (!projectId || !distressId) return res.status(400).json({ error: 'projectId and distressId required' })
      await assertCanDeleteProject(req, projectId)
      return res.json(await store.deleteDistress(projectId, distressId))
    } catch (err) {
      fail(res, err)
    }
  })

  return router
}
