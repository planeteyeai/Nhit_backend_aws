-- Structural distress: store comma-separated image filenames per row.
-- Run once; startup also adds the column via ensureBridgeInspectionDistressColumns.
ALTER TABLE bridge_inspection_distress ADD COLUMN images TEXT NULL;
