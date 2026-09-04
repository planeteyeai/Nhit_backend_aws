-- Allow multiple entity rows per Potree folder and optional inspection linkage.
-- Applied automatically by ensurePointCloudDataSchema() on first API use; this file documents the change.

ALTER TABLE point_cloud_data DROP INDEX uk_point_cloud_id;
CREATE INDEX idx_pcd_bridge_cloud ON point_cloud_data (bridge_id, point_cloud_id);

ALTER TABLE point_cloud_data DROP FOREIGN KEY fk_point_cloud_data_bridge_inspection;
ALTER TABLE point_cloud_data MODIFY COLUMN bridge_inspection_id INT NULL;
ALTER TABLE point_cloud_data
  ADD CONSTRAINT fk_point_cloud_data_bridge_inspection
  FOREIGN KEY (bridge_inspection_id) REFERENCES bridge_inspection (bridge_inspection_id)
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Base64 data-URL for image annotations placed on the point cloud
ALTER TABLE point_cloud_data ADD COLUMN images LONGTEXT NULL;
