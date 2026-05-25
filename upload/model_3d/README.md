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

This project includes **`nixpacks.toml`** at the backend root. Railway should use it automatically.

1. Railway Dashboard → your **backend** service → **Settings**
2. **Root Directory**: leave empty if the connected repo is `nhit-backend` only; otherwise set the folder that contains `package.json` and `nixpacks.toml`
3. **Builder**: Nixpacks (default)
4. Do **not** override the install step with plain `npm ci` only — that skips LFS
5. **Redeploy** the latest commit from GitHub

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
