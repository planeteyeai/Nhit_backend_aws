/**
 * Component classes. `code` is the value written into each point's LAS/Potree
 * `classification` byte; `id`/`label`/`color` are what the sidebar shows (the
 * existing ids and colours are kept so engineers see the same palette).
 * 0 = unclassified: used whenever confidence is too low to name a component.
 */
const CLASSES = [
	{ id: "unclassified", code: 0, label: "Unclassified / Unknown", color: "7d8794", group: "unknown" },
	{ id: "carriageway", code: 10, label: "Carriageway (Road Surface)", color: "a7b0ba", group: "structure" },
	{ id: "median", code: 11, label: "Central Median", color: "9b7bff", group: "structure" },
	{ id: "parapet", code: 12, label: "Parapets", color: "38d6f0", group: "structure" },
	{ id: "topslab", code: 13, label: "Top Slab (Deck Soffit)", color: "ff9a2e", group: "structure" },
	{ id: "wall", code: 14, label: "Outer Walls", color: "ff4d4d", group: "structure" },
	{ id: "midwall", code: 15, label: "Middle Wall", color: "ffd93b", group: "structure" },
	{ id: "floor", code: 16, label: "Bottom Slab (Floor)", color: "ff6fb5", group: "structure" },
	{ id: "headwall", code: 17, label: "Headwalls & Wing Walls", color: "4f8cff", group: "structure" },
	{ id: "other", code: 20, label: "Vehicles, People, Cones & Barricades", color: "ffffff", group: "traffic" },
	{ id: "road_noise", code: 21, label: "Road Surface Noise", color: "ff6b4a", group: "artifact" },
	{ id: "vegetation", code: 30, label: "Vegetation", color: "3fd05a", group: "environment" },
	{ id: "ground", code: 31, label: "Embankment & Channel Bed", color: "8a6a4a", group: "environment" }
];

const BY_ID = Object.fromEntries(CLASSES.map((c) => [c.id, c]));
const BY_CODE = Object.fromEntries(CLASSES.map((c) => [c.code, c]));
const C = Object.fromEntries(CLASSES.map((c) => [c.id.toUpperCase(), c.code]));

module.exports = { CLASSES, BY_ID, BY_CODE, C };
