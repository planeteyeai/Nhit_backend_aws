/**
 * Object Removal + Distress Highlighter persistence for the embedded Potree viewer.
 *
 *   GET    /api/pointcloud-inspection?projectId=…                 project + distress records
 *   GET    /api/pointcloud-inspection?action=removals&projectId=…  removal journal
 *   GET    /api/pointcloud-inspection?action=csv&projectId=…       distress CSV export
 *   GET    /api/pointcloud-inspection?action=list                  all inspected clouds
 *   POST   /api/pointcloud-inspection?action=project               create/update project meta
 *   POST   /api/pointcloud-inspection?action=removals              save removal journal
 *   POST   /api/pointcloud-inspection                              save a distress record
 *   PUT    /api/pointcloud-inspection                              update a distress record
 *   DELETE /api/pointcloud-inspection?projectId=…&distressId=…     delete a distress record
 *
 * Every route requires a valid BMS JWT (same Bearer token the rest of the API uses).
 */
import { createRequire } from 'module'
import express from 'express'
import { requireAuth } from '../middleware/auth.js'

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

export function createPointcloudInspectionRouter() {
  const router = express.Router()
  router.use(requireAuth)

  router.get('/', async (req, res) => {
    try {
      const { projectId, action } = req.query
      if (action === 'list') return res.json(await store.listProjects())
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
      return res.json(await store.listProjects())
    } catch (err) {
      fail(res, err)
    }
  })

  router.post('/', async (req, res) => {
    try {
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
      return res.json(await store.deleteDistress(projectId, distressId))
    } catch (err) {
      fail(res, err)
    }
  })

  return router
}
