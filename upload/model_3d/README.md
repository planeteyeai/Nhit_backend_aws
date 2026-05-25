# 3D model library (manual setup)

GLB files in this folder are **not** stored in Git (too large). After clone/pull, copy your `.glb` files here.

`models.json` **is** tracked in Git — it lists which GLB filenames the app shows in the 3D viewer dropdown.

On deploy, ensure:

1. `models.json` exists (from repo)
2. Matching `.glb` files exist on disk (copy from backup or shared storage)

Frontend fallback: `nhit-frontend/src/components/model/models.json` (same list).
