# Upload directory structure

Runtime uploads (images, PDFs, panoramas) are **not** committed to Git.

| Folder | Typical content |
|--------|-----------------|
| `model_3d/` | LAS sources by project (S3); local folder is a marker only |
| `inspection_3d_assets/{inspectionId}/` | Per-inspection 3D uploads and panorama JPEGs |
| `threed_panoramas/` | Processed panorama tiles |
| `bridge_images/` | Bridge registration photos |
| `foundation/`, `approaches/`, `substructure/`, etc. | Component inspection images |
| `download/` | Generated PDFs and exports |

Tracked in Git: `.gitkeep` markers and `model_3d/README.md` only.
