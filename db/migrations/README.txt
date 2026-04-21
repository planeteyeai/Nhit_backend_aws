BMS database migrations (manual / DBA-run)

Order
  1) Apply schema baseline from ../schema-from-pdf.sql on empty DB (or diff against live DB).
  2) Run 001_span_arrangement_legacy_fix.sql only if you use the legacy table name `sapn_arrangment` and need PK/AI/FK alignment.
     - If statements fail (duplicate key, existing PK), skip the corresponding ALTER or adjust for your live schema.
  3) Runtime guards: some routes call ensureSpanArrangementSchema() in bmsRoutes.js during transition.

Notes
  - Prefer staging first; backup before ALTER on production.
  - Idempotent SQL for every legacy table will be added here incrementally; see MIGRATION_MATRIX.json for screen-to-table mapping.
