-- Separate span names for Abutment A1 / A2 on inspection substructure.
ALTER TABLE substructure
  ADD COLUMN substructure_span_name_a1 VARCHAR(256) NULL AFTER substructure_name,
  ADD COLUMN substructure_span_name_a2 VARCHAR(256) NULL AFTER substructure_span_name_a1;
