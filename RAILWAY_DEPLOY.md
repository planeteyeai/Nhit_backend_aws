# Deploy BMS backend on Railway (with 3D GLB models)

## Why you see "GLB files missing on server"

The `.glb` files are stored with **Git LFS**. If the Railway build only runs `npm ci`, you get tiny pointer files (~130 bytes), not real models.

## One-time: push LFS files to GitHub (on your PC)

```powershell
cd Backend\nhit-backend
git lfs install
git lfs pull
git lfs push --all origin
```

Confirm on GitHub: repo → **Settings** → **Git LFS** (objects should exist).

## Railway service settings

1. Open **Railway** → project → **nhit-backend** service.
2. **Settings** → **Source** → repo: `nhit-backend` (or correct subfolder).
3. **Root Directory**:
   - Repo is only backend: leave **empty**
   - Monorepo: `Backend/nhit-backend`
4. **Settings** → **Build**:
   - **Builder**: **Dockerfile**
   - **Dockerfile path**: `Dockerfile`
   - Remove any custom build that is only `npm ci`
5. **Settings** → **Deploy** → **Start Command**: `npm start`
6. **Variables** (required):
   - `NODE_ENV` = `production`
   - `CORS_ORIGIN` = `https://nhit-frontend.onrender.com`
   - (your DB and JWT vars as before)
7. **Deployments** → **Redeploy** latest commit.

## Build log must show

- `git lfs pull` downloading objects
- `[verify-glb] OK ... (XX.X MB)` for each model
- `[verify-glb] 10/10 valid GLB files`

If verify fails, the **build fails** (fix LFS before the app goes live).

## After deploy — test in browser

| URL | Expected |
|-----|----------|
| `/health` | `{"ok":true,...}` |
| `/model-3d/catalog` | `"models": [ ... ]` with **10** items |
| `/model-3d/status` | `"ok": true`, `"validCount": 10` |

## Render frontend

```env
VITE_API_BASE_URL=https://nhit-backend.up.railway.app
```

Redeploy frontend after catalog shows models.
