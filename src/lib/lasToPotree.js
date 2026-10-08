/**
 * LAS/LAZ in upload/model_3d/ → Potree 2.x in upload/potree/ via PotreeConverter.
 * Run manually: npm run potree:convert (uses Desktop PotreeConverter path on Windows by default).
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import {
  downloadObjectToFile,
  guessContentType,
  isStorageEnabled,
  listBucketObjectsUnderPrefix,
  uploadFromFile,
} from './storage.js'
import {
  extractChainageKey,
  invalidatePotreeCatalogCache,
  listPotreeModels,
  POTREE_BUCKET_PREFIX,
} from './potreeModels.js'
import { chainageKeyToKm, resolvePotreeProject } from './potreeProjects.js'

const MODEL_3D_PREFIX = 'upload/model_3d/'
const LAS_EXT = /\.(las|laz)$/i
const POTREE_OUTPUT_FILES = ['metadata.json', 'hierarchy.bin', 'octree.bin']

let convertStatus = {
  running: false,
  lastRun: null,
  lastError: null,
  results: [],
}

export function getLasConvertStatus() {
  return { ...convertStatus, running: convertStatus.running }
}

export function lasFileToPotreeFolderName(lasFileName) {
  const base = path.basename(String(lasFileName || ''), path.extname(lasFileName))
  const slug = base
    .toLowerCase()
    .replace(/\+/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${Date.now()}-${slug || 'pointcloud'}`
}

function defaultConverterPath() {
  const env = String(process.env.POTREE_CONVERTER_PATH || '').trim()
  if (env) return env
  if (process.platform === 'win32') {
    return path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../tools/PotreeConverter/PotreeConverter.exe'
    )
  }
  return '/usr/local/bin/PotreeConverter'
}

function runPotreeConverter(exePath, inputLas, outputDir) {
  return new Promise((resolve, reject) => {
    // Do not use shell:true — paths with spaces (e.g. "las to poctree converter") break on Windows.
    const proc = spawn(exePath, [inputLas, '-o', outputDir], {
      stdio: 'inherit',
      shell: false,
      windowsHide: true,
    })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`PotreeConverter exited with code ${code}`))
    })
  })
}

function resolvePotreeOutputDir(outputDir) {
  if (fs.existsSync(path.join(outputDir, 'metadata.json'))) return outputDir
  for (const entry of fs.readdirSync(outputDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const candidate = path.join(outputDir, entry.name)
    if (fs.existsSync(path.join(candidate, 'metadata.json'))) return candidate
  }
  return outputDir
}

async function uploadPotreeOutput(localDir, folderName) {
  for (const file of POTREE_OUTPUT_FILES) {
    const localPath = path.join(localDir, file)
    if (!fs.existsSync(localPath)) {
      throw new Error(`Missing ${file} in PotreeConverter output`)
    }
    await uploadFromFile(
      localPath,
      `${POTREE_BUCKET_PREFIX}${folderName}/${file}`,
      guessContentType(file)
    )
  }
}

/** LAS/LAZ files in model_3d that do not yet have a Potree output for the same chainage. */
export async function listPendingLasConversions() {
  if (!isStorageEnabled()) return []
  const [objects, potreeModels] = await Promise.all([
    listBucketObjectsUnderPrefix(MODEL_3D_PREFIX),
    listPotreeModels(),
  ])
  const convertedChainages = new Set(potreeModels.map((m) => m.chainageKey).filter(Boolean))
  const pending = []

  for (const obj of objects) {
    const name = path.basename(obj.key)
    if (!LAS_EXT.test(name)) continue
    const chainageKey = extractChainageKey(name)
    if (chainageKey && convertedChainages.has(chainageKey)) continue
    pending.push({
      key: obj.key,
      fileName: name,
      chainageKey,
      sizeBytes: obj.sizeBytes,
    })
  }

  pending.sort((a, b) => Number(a.sizeBytes || 0) - Number(b.sizeBytes || 0))
  return pending
}

export async function convertLasFileFromS3(s3Key, options = {}) {
  const converterPath = options.converterPath || defaultConverterPath()
  if (!converterPath || !fs.existsSync(converterPath)) {
    throw new Error(
      `PotreeConverter not found (${converterPath || 'default path'}). ` +
        'Install PotreeConverter or set POTREE_CONVERTER_PATH when running npm run potree:convert'
    )
  }

  const fileName = path.basename(s3Key)
  const modelFolder = lasFileToPotreeFolderName(fileName)
  const chainageKey = extractChainageKey(fileName)
  const project = resolvePotreeProject(chainageKeyToKm(chainageKey))
  const folderName = project ? `${project}/${modelFolder}` : modelFolder
  const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bms-potree-'))
  const localLas = path.join(workRoot, fileName)
  const outputDir = path.join(workRoot, 'output')
  fs.mkdirSync(outputDir, { recursive: true })

  try {
    console.log(`[potree] downloading ${s3Key}`)
    if (!(await downloadObjectToFile(s3Key, localLas))) {
      throw new Error(`Failed to download ${s3Key}`)
    }

    console.log(`[potree] converting ${fileName} → upload/potree/${folderName}/`)
    await runPotreeConverter(converterPath, localLas, outputDir)

    const potreeDir = resolvePotreeOutputDir(outputDir)
    await uploadPotreeOutput(potreeDir, folderName)
    invalidatePotreeCatalogCache()

    return {
      folder: folderName,
      fileName,
      chainageKey,
      project: project || '',
      s3Prefix: `${POTREE_BUCKET_PREFIX}${folderName}/`,
    }
  } finally {
    fs.rmSync(workRoot, { recursive: true, force: true })
  }
}

export async function convertPendingLasFiles(options = {}) {
  if (convertStatus.running) {
    return { skipped: true, reason: 'already running', ...getLasConvertStatus() }
  }

  convertStatus.running = true
  convertStatus.results = []

  try {
    const pending = await listPendingLasConversions()
    const maxFiles = Math.max(1, Number(options.maxFiles || process.env.POTREE_CONVERT_MAX || 1))
    const batch = pending.slice(0, maxFiles)

    for (const item of batch) {
      try {
        const result = await convertLasFileFromS3(item.key, options)
        convertStatus.results.push({ ok: true, ...result })
      } catch (e) {
        convertStatus.results.push({ ok: false, fileName: item.fileName, error: e.message })
        console.error('[potree] convert failed:', item.fileName, e.message)
      }
    }

    convertStatus.lastRun = new Date().toISOString()
    convertStatus.lastError = convertStatus.results.some((r) => !r.ok)
      ? convertStatus.results.find((r) => !r.ok)?.error || 'conversion failed'
      : null

    return {
      converted: convertStatus.results.filter((r) => r.ok).length,
      failed: convertStatus.results.filter((r) => !r.ok).length,
      pendingRemaining: Math.max(0, pending.length - batch.length),
      pendingTotal: pending.length,
      results: convertStatus.results,
    }
  } catch (e) {
    convertStatus.lastError = e.message
    throw e
  } finally {
    convertStatus.running = false
  }
}
