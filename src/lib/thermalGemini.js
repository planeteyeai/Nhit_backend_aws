const ALLOWED_MODELS = new Set([
  'gemini-2.5-flash',
  'gemini-2.5-flash-image',
  'gemini-3-flash-preview',
])

const DEFAULT_MODEL = 'gemini-2.5-flash'
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

function getGeminiApiKey() {
  return String(process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '').trim()
}

function normalizeContents(contents) {
  if (!contents) return []
  if (Array.isArray(contents)) return contents
  if (contents.parts || contents.role) return [contents]
  return [contents]
}

function sanitizeParts(parts = []) {
  return parts.map((part) => {
    const inline = part.inlineData || part.inline_data
    if (inline?.data) {
      return {
        inlineData: {
          mimeType: inline.mimeType || inline.mime_type || 'image/jpeg',
          data: inline.data,
        },
      }
    }
    if (part.text != null) return { text: part.text }
    return part
  })
}

function toRestBody(contents, config) {
  const body = {
    contents: normalizeContents(contents).map((item) => ({
      role: item.role || 'user',
      parts: sanitizeParts(item.parts || []),
    })),
  }
  if (config && typeof config === 'object') {
    body.generationConfig = {}
    if (config.responseMimeType) body.generationConfig.responseMimeType = config.responseMimeType
    if (config.responseSchema) body.generationConfig.responseSchema = config.responseSchema
    if (config.temperature != null) body.generationConfig.temperature = config.temperature
    if (!Object.keys(body.generationConfig).length) delete body.generationConfig
  }
  return body
}

function sanitizeResponse(json) {
  const candidates = Array.isArray(json?.candidates) ? json.candidates : []
  const firstText = candidates[0]?.content?.parts?.find((p) => p?.text)?.text || ''
  return {
    ok: true,
    text: firstText,
    candidates: candidates.map((c) => ({
      content: {
        parts: (c?.content?.parts || []).map((part) => {
          const inline = part.inlineData || part.inline_data
          if (inline?.data) {
            return {
              inlineData: {
                mimeType: inline.mimeType || inline.mime_type || 'image/png',
                data: inline.data,
              },
            }
          }
          return { text: part.text || '' }
        }),
      },
    })),
  }
}

function googleErrorMessage(json, status) {
  const msg = json?.error?.message || json?.message || json?.error?.status
  if (msg) return String(msg)
  return `Gemini request failed (${status})`
}

export async function thermalGenerateHandler(req, res) {
  const apiKey = getGeminiApiKey()
  if (!apiKey) {
    return res.status(503).json({
      ok: false,
      message: 'Gemini API key is not configured. Set GEMINI_API_KEY on the backend.',
    })
  }

  const model = String(req.body?.model || DEFAULT_MODEL).trim()
  if (!ALLOWED_MODELS.has(model)) {
    return res.status(400).json({ ok: false, message: `Unsupported model: ${model}` })
  }

  const contents = req.body?.contents
  if (!contents) {
    return res.status(400).json({ ok: false, message: 'Missing contents' })
  }

  req.setTimeout(180000)
  res.setTimeout(180000)

  try {
    const url = `${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toRestBody(contents, req.body?.config)),
    })
    const raw = await upstream.text()
    let json = {}
    try {
      json = raw ? JSON.parse(raw) : {}
    } catch {
      json = { message: raw?.slice(0, 300) || 'Invalid Gemini response' }
    }

    if (!upstream.ok) {
      const message = googleErrorMessage(json, upstream.status)
      console.error('[thermal/generate]', model, upstream.status, message)
      const status = upstream.status === 401 || upstream.status === 403 ? 401 : 502
      return res.status(status).json({ ok: false, message })
    }

    return res.json(sanitizeResponse(json))
  } catch (err) {
    const message = err?.message || 'Gemini request failed'
    console.error('[thermal/generate]', message)
    if (!res.headersSent) {
      res.status(502).json({ ok: false, message })
    }
  }
}
