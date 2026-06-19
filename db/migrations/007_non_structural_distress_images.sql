-- Non-structural distress: store comma-separated image filenames per row.
-- Run once; startup also adds the column via ensureNonStructuralDistressColumns.
ALTER TABLE non_structural_distress ADD COLUMN images TEXT NULL;
