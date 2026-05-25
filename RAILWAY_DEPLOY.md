# Live setup: Railway (backend) + Render (frontend)

Local works because GLB files are on your disk. Live needs the same files on Railway.

---

## A. One-time on your PC (push LFS to GitHub)

```powershell
cd "c:\Users\Vishal.Bhor\Desktop\BMS 2\Backend\nhit-backend"
git lfs install
git lfs pull
git lfs push --all planeteye
git lfs push --all origin
```

**Live GitHub repo:** `https://github.com/planeteyeai/nhit-backend1`  
Connect **Railway** to this repo (not only `vishalbhor-45/nhit-backend`).

---

## B. Railway — backend (`nhit-backend.up.railway.app`)

### Recommended: **Nixpacks** (fix for failed Docker build)

1. Railway → **nhit-backend** service → **Settings**
2. **Root Directory**: empty (repo = `nhit-backend` only) OR `Backend/nhit-backend` for monorepo
3. **Build**:
   - **Builder**: **Nixpacks** (not Dockerfile, if Docker keeps failing)
   - **Custom Build Command**: leave **empty** (uses `nixpacks.toml` → runs `git lfs pull`)
4. **Deploy** → **Start Command**: `npm start`
5. **Variables** (required):

| Variable | Example |
|----------|---------|
| `NODE_ENV` | `production` |
| `CORS_ORIGIN` | `https://nhit-frontend.onrender.com` |
| `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | your MySQL |
| `JWT_SECRET` | your secret |

6. **Variables** (optional but recommended):

| Variable | Value |
|----------|--------|
| `GITHUB_LFS_REPO` | `planeteyeai/nhit-backend1` |
| `GITHUB_TOKEN` | **Required** — GitHub PAT with `repo` read (repo is private) |

Create token: GitHub → Settings → Developer settings → Personal access tokens → Generate → scope **repo**.

7. **Deployments** → **Redeploy** (latest commit)

**On first start**, the server downloads GLB files from GitHub LFS in the **background** (~800 MB total).  
Check Railway **Deploy logs** for `[ensure-glb] downloading …` / `saved …`.  
Wait **10–20 minutes**, then open `/model-3d/catalog` again.

Or open in your browser (after `GITHUB_TOKEN` is set):

```text
https://nhit-backend.up.railway.app/model-3d/sync
```

Check progress: `GET /model-3d/status` → `"sync": { "running": true, "ready": 3, "total": 10 }`

Build may still show `git lfs pull` (optional); startup download is the main fix.

### If you use Dockerfile instead

- **Builder**: Dockerfile  
- Dockerfile clones GitHub when `.git` is missing (see `scripts/pull-model-glbs.sh`)

---

## C. Test backend (browser)

| URL | OK when |
|-----|---------|
| `https://nhit-backend.up.railway.app/health` | `{"ok":true}` |
| `https://nhit-backend.up.railway.app/model-3d/catalog` | `"models"` has **10** items |
| `https://nhit-backend.up.railway.app/model-3d/status` | `"ok":true`, `"validCount":10` |

If catalog shows `"models":[]` → GLB still missing; check build log for `git lfs` / `[verify-glb]`.

---

## D. Render — frontend (`nhit-frontend.onrender.com`)

1. Render → **nhit-frontend** → **Environment**
2. Add:

```env
VITE_API_BASE_URL=https://nhit-backend.up.railway.app
```

(No trailing slash. Must be **Railway**, not the Render URL.)

3. **Build Command**: `npm ci && npm run build`
4. **Save** → **Manual Deploy**

---

## E. Test 3D viewer

```
https://nhit-frontend.onrender.com/?view=3D+Viewer&bridgeId=41
```

Log in → open **3D Viewer** → choose a model from the dropdown.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Railway build **FAILED** (Docker) | Switch builder to **Nixpacks**, redeploy |
| `GLB files missing on server` | Backend build did not run `git lfs pull`; fix B above |
| `Not a valid GLB` | Wrong `VITE_API_BASE_URL` or backend has no files |
| CORS errors in browser | Set `CORS_ORIGIN` on Railway to your Render URL |

---

## Checklist

- [ ] `git lfs push --all origin` done  
- [ ] Railway redeploy succeeded (green)  
- [ ] `/model-3d/catalog` shows 10 models  
- [ ] Render `VITE_API_BASE_URL` = Railway URL  
- [ ] Render frontend redeployed  
