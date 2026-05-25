# 3D model library (manual setup)

GLB files in this folder are stored with **Git LFS** (they are too large for normal Git).

After clone:

```bash
git lfs install
git lfs pull
```

`models.json` lists which GLB filenames the 3D viewer dropdown uses.

On deploy, ensure:

1. `models.json` exists (from repo)
2. Matching `.glb` files exist on disk (copy from backup or shared storage)

Frontend fallback: `nhit-frontend/src/components/model/models.json` (same list).
