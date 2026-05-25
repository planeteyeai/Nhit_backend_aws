# 3D model library (manual setup)

GLB files in this folder are stored with **Git LFS** (they are too large for normal Git).

After clone:

```bash
git lfs install
git lfs pull
```

`models.json` lists which GLB filenames the 3D viewer dropdown uses.

On deploy, **real GLB binaries** must be on disk (not Git LFS pointer text files).

### Railway (recommended — this repo)

Use the **`Dockerfile`** builder (see `railway.toml`) so `git lfs pull` runs on every deploy.

1. Railway Dashboard → **nhit-backend** service → **Settings**
2. **Root Directory**: empty if repo is `nhit-backend` only; else `Backend/nhit-backend`
3. **Builder**: **Dockerfile** (not Nixpacks-only with plain `npm ci`)
4. **Redeploy** latest commit from GitHub
5. Build logs should show `git lfs pull` downloading large `.glb` files

Alternative: Nixpacks via `nixpacks.toml` (only if Dockerfile is not used).

After deploy, open:

```text
https://YOUR-RAILWAY-URL/model-3d/status
```

You want `"ok": true` and `"validCount": 10` (or similar). Each file should have `sizeBytes` in the **millions**, not ~130.

### Render / VPS (manual build command)

```bash
git lfs install && git lfs pull && npm ci
```

Without LFS pull, the 3D viewer shows *"GLB files missing on server"*.

Check on server:

```bash
ls -la upload/model_3d/*.glb
```

Files must be large (not ~130 bytes). API `GET /model-3d/catalog` lists only valid GLBs.

1. `models.json` exists (from repo)
2. Matching `.glb` files exist on disk (real binaries, not LFS pointers)

Frontend fallback: `nhit-frontend/src/components/model/models.json` (same list).
