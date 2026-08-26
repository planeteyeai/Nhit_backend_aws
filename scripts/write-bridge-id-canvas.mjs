import fs from 'fs'

const src = JSON.parse(fs.readFileSync('backups/bridge-id-map-database_Bms.json', 'utf8'))
const rows = src.rows.map((r) => ({
  s: r.source === 'railway' ? 'r' : 'o',
  o: r.original_bridge_id,
  n: r.database_bms_bridge_id,
  c: r.chainage,
  side: r.bridge_side,
  no: r.bridge_no,
}))

const dataLiteral = JSON.stringify(rows)

const canvas = `import {
  Callout,
  Grid,
  H1,
  H2,
  Row,
  Select,
  Stack,
  Stat,
  Table,
  Text,
  TextInput,
  useCanvasState,
} from "cursor/canvas";

/** Compact map: s o=old_dump r=railway; o original id; n database_Bms id */
const ROWS: Array<{ s: "o" | "r"; o: number; n: number; c: string; side: string; no: string }> = ${dataLiteral};

export default function BridgeIdMap() {
  const [q, setQ] = useCanvasState("q", "");
  const [src, setSrc] = useCanvasState("src", "all");

  const query = q.trim().toLowerCase();
  const filtered = ROWS.filter((r) => {
    if (src === "old" && r.s !== "o") return false;
    if (src === "railway" && r.s !== "r") return false;
    if (!query) return true;
    return (
      String(r.o).includes(query) ||
      String(r.n).includes(query) ||
      r.c.toLowerCase().includes(query) ||
      r.side.toLowerCase().includes(query) ||
      r.no.toLowerCase().includes(query)
    );
  });
  const shown = filtered.slice(0, 250);
  const oldN = ROWS.filter((r) => r.s === "o").length;
  const railN = ROWS.filter((r) => r.s === "r").length;

  return (
    <Stack gap={20}>
      <Stack gap={6}>
        <H1>database_Bms bridge_id map</H1>
        <Text tone="secondary">
          Old dump IDs stay the same. Railway IDs become original + 10000. Search original id, new id, chainage, side, or bridge no.
        </Text>
      </Stack>

      <Grid columns={3} gap={12}>
        <Stat value={String(oldN)} label="Old dump (same id)" />
        <Stat value={String(railN)} label="Railway (id + 10000)" />
        <Stat value={String(ROWS.length)} label="Total in database_Bms" />
      </Grid>

      <Callout tone="info" title="How to read IDs">
        Old dump example: original 6 → database_Bms 6. Railway example: original 2 → database_Bms 10002.
      </Callout>

      <H2>Lookup</H2>
      <Row gap={12} align="center">
        <TextInput value={q} onChange={setQ} placeholder="Search id, chainage, side, bridge no" />
        <Select
          value={src}
          onChange={setSrc}
          options={[
            { value: "all", label: "All sources" },
            { value: "old", label: "Old dump only" },
            { value: "railway", label: "Railway only" },
          ]}
        />
      </Row>
      <Text tone="tertiary">
        Showing {shown.length} of {filtered.length} matches
        {filtered.length > 250 ? " (first 250)" : ""}
      </Text>

      <Table
        stickyHeader
        striped
        headers={[
          "Source",
          "Original bridge_id",
          "database_Bms bridge_id",
          "Chainage",
          "bridge_side",
          "bridge_no",
        ]}
        columnAlign={["left", "right", "right", "left", "left", "left"]}
        rows={shown.map((r) => [
          r.s === "r" ? "railway (live)" : "old dump",
          String(r.o),
          String(r.n),
          r.c,
          r.side,
          r.no,
        ])}
      />
    </Stack>
  );
}
`

const dest = 'C:/Users/Vishal.Bhor/.cursor/projects/c-Users-Vishal-Bhor-Desktop-BMS-2/canvases/bridge-id-map.canvas.tsx'
fs.writeFileSync(dest, canvas)
console.log('canvas bytes', canvas.length, dest)
