# Upload directory structure

Runtime uploads (images, PDFs, GLB, panoramas) are **not** committed to Git.

After clone or deploy, this folder layout is created automatically; copy media from backup or production as needed.

| Folder | Typical content |
|--------|-----------------|
| `model_3d/` | Bridge GLB library + `models.json` (catalog is in Git) |
| `inspection_3d_assets/{inspectionId}/` | Per-inspection GLB and panorama JPEGs |
| `threed_panoramas/` | Processed panorama tiles |
| `bridge_images/` | Bridge registration photos |
| `foundation/`, `approaches/`, `substructure/`, etc. | Component inspection images |
| `download/` | Generated PDFs and exports |

Only `.gitkeep`, `model_3d/models.json`, and `model_3d/README.md` are tracked in Git.
