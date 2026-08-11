-- Add inventory Structural Form option: T Beam Slab
INSERT INTO structural_form (structural_form_code, structural_form_description)
SELECT '31', 'T Beam Slab'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM structural_form
  WHERE structural_form_code = '31'
     OR LOWER(structural_form_description) = LOWER('T Beam Slab')
);
