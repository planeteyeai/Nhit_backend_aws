# 3D model library (manual setup)

GLB files in this folder are stored with **Git LFS** (they are too large for normal Git).

After clone:

```bash
git lfs install
git lfs pull
```

`models.json` lists which GLB filenames the 3D viewer dropdown uses.

On deploy (Render / Railway / VPS), **required**:

```bash
git lfs install
git lfs pull
```

Without this, only tiny LFS pointer text files are deployed — the 3D viewer shows
"not a valid GLB". After pull, each `.glb` should be tens/hundreds of MB.

Check on server:

```bash
ls -la upload/model_3d/*.glb
```

Files must be large (not ~130 bytes). API `GET /model-3d/catalog` lists only valid GLBs.

1. `models.json` exists (from repo)
2. Matching `.glb` files exist on disk (real binaries, not LFS pointers)

Frontend fallback: `nhit-frontend/src/components/model/models.json` (same list).
