-- Bridge Step 15: dropdown fields for superstructure type and material.
-- Safe to re-run only on databases that do not yet have these columns.

ALTER TABLE superstructure_bridge
  ADD COLUMN types_of_superstructure varchar(100) NULL AFTER check_steel_members;

ALTER TABLE superstructure_bridge
  ADD COLUMN type_of_material varchar(100) NULL AFTER types_of_superstructure;

UPDATE superstructure_bridge
SET types_of_superstructure = reinforced_concrete_and_prestressed_concrete_members
WHERE (types_of_superstructure IS NULL OR types_of_superstructure = '')
  AND reinforced_concrete_and_prestressed_concrete_members <> '';

UPDATE superstructure_bridge
SET type_of_material = check_steel_members
WHERE (type_of_material IS NULL OR type_of_material = '')
  AND check_steel_members <> '';
