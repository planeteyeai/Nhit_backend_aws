/**
 * Bridge-level summary derived from the classifier's own evidence: estimated structure type and point-cloud quality.
 * Nothing here is bridge-specific: every statement is computed from the class volume and measured geometry, and the
 * result always carries the evidence it was based on. These are indicators, not certified findings.
 */
const { C } = require("./classes");

/**
 * Parallel lines formed by points (u = position across, w = position along the line). A cluster counts only if it extends over
 * at least `minExtent` along the line, so scattered mislabelled voxels do not create phantom walls / piers.
 */
function lineClusters(us, ws, gap, minExtent) {
	if (!us.length) return 0;
	const idx = Array.from(us.keys()).sort((x, y) => us[x] - us[y]);
	let n = 0, lo = Infinity, hi = -Infinity, prev = null;
	const flush = () => { if (prev !== null && hi - lo >= minExtent) n++; lo = Infinity; hi = -Infinity; };
	for (const i of idx) {
		if (prev !== null && us[i] - prev > gap) flush();
		prev = us[i]; lo = Math.min(lo, ws[i]); hi = Math.max(hi, ws[i]);
	}
	flush();
	return n;
}

function medianZ(res, code) {
	const g = res.grid, z = [];
	for (let o = 0; o < g.occ; o++) if (res.cls[o] === code) z.push(g.mz[o]);
	if (!z.length) return null;
	z.sort((a, b) => a - b);
	return z[z.length >> 1];
}

/** fraction of the floor class lying within `r` metres of a wall voxel: a real enclosure's floor is bounded by walls, a channel bed under a slab is not */
function floorBoundedByWalls(res, r) {
	const g = res.grid, cell = r;
	const key = (x, y) => Math.floor(x / cell) + "," + Math.floor(y / cell);
	const walls = new Set();
	for (let o = 0; o < g.occ; o++) { const c = res.cls[o]; if (c === C.WALL || c === C.MIDWALL || c === C.HEADWALL) walls.add(key(g.mx[o], g.my[o])); }
	let n = 0, near = 0;
	for (let o = 0; o < g.occ; o += 3) {
		if (res.cls[o] !== C.FLOOR) continue;
		n++;
		const cx = Math.floor(g.mx[o] / cell), cy = Math.floor(g.my[o] / cell);
		let hit = false;
		for (let dy = -1; dy <= 1 && !hit; dy++) for (let dx = -1; dx <= 1; dx++) if (walls.has((cx + dx) + "," + (cy + dy))) { hit = true; break; }
		if (hit) near++;
	}
	return n ? near / n : 0;
}

function share(counts, code, total) { return total ? (counts[code] || 0) / total : 0; }

function estimateBridgeType(res, counts, total) {
	const evidence = [];
	if (!res.deck) {
		return { label: "Structure not identified", kind: "unknown", confidence: 0, evidence: ["no deck-like elevated surface was found"] };
	}
	const g = res.grid, f = res.frame;
	const elevated = !!res.deck.elevated;
	const floor = share(counts, C.FLOOR, total), mid = share(counts, C.MIDWALL, total), wall = share(counts, C.WALL, total), head = share(counts, C.HEADWALL, total);
	const enclosed = !!(res.enclosure && res.enclosure.found);
	const twin = res.deck.chosen.length > 1;
	const L = f.lengthM, W = f.widthM;
	evidence.push(`${elevated ? "elevated" : "ground-level"} deck ${L.toFixed(0)} m x ${W.toFixed(0)} m`);
	if (twin) evidence.push(`${res.deck.chosen.length} separate carriageway surfaces`);

	// interior wall / pier lines
	const mx = [], my = [];
	for (let o = 0; o < g.occ; o++) if (res.cls[o] === C.MIDWALL) { mx.push(g.mx[o]); my.push(g.my[o]); }
	let uncertain = false, cells = 0, spans = 0, kind = "slab", label;
	let skewDeg = 0, bounded = 0, clearance = null, sideWalls = 0;
	if (enclosed) {
		const a = res.enclosure.axis; // barrel axis
		const dot = Math.abs(a[0] * f.axis[0] + a[1] * f.axis[1]);
		skewDeg = Math.round(Math.acos(Math.min(1, dot)) * 180 / Math.PI);
		const across = [], along = [];
		for (let i = 0; i < mx.length; i++) { across.push(-mx[i] * a[1] + my[i] * a[0]); along.push(mx[i] * a[0] + my[i] * a[1]); }
		const lines = lineClusters(across, along, Math.max(1.0, 4 * g.v), 0.5 * res.enclosure.lengthM);
		cells = lines + 1;
		// a culvert has continuous side walls on BOTH sides running most of the barrel length; wing-wall stubs do not
		const wa = [], wl = [];
		for (let o = 0; o < g.occ; o++) if (res.cls[o] === C.WALL) { wa.push(-g.mx[o] * a[1] + g.my[o] * a[0]); wl.push(g.mx[o] * a[0] + g.my[o] * a[1]); }
		sideWalls = lineClusters(wa, wl, Math.max(1.0, 4 * g.v), 0.6 * res.enclosure.lengthM);
		bounded = floorBoundedByWalls(res, Math.max(1.5, 0.25 * Math.min(res.enclosure.widthM, res.enclosure.lengthM)));
		const zs = medianZ(res, C.TOPSLAB), zf = medianZ(res, C.FLOOR);
		clearance = zs != null && zf != null ? zs - zf : null;
		evidence.push(`enclosed under-deck space ${res.enclosure.lengthM.toFixed(0)} m x ${res.enclosure.widthM.toFixed(0)} m`);
		evidence.push(`${(100 * floor).toFixed(1)}% floor (${(100 * bounded).toFixed(0)}% of it bounded by walls), ${(100 * (wall + head)).toFixed(1)}% walls`);
	}
	// a culvert is a low, wide opening: clearance is a fraction of its width. Tall openings are piers/abutments over open ground.
	const lowOpening = clearance != null && clearance < 0.35 * Math.max(res.enclosure.widthM, res.enclosure.lengthM);
	if (clearance != null) evidence.push(`clear height about ${clearance.toFixed(1)} m (${lowOpening ? "low opening" : "tall opening"})`);
	if (enclosed && floor > 0.02 && bounded >= 0.6 && lowOpening && (wall + head) >= 0.03) {
		kind = "culvert";
		label = cells > 1 ? `Box culvert / multi-cell enclosure (${cells} cells)` : "Box culvert / single-cell enclosure";
		evidence.push(`${cells} cell(s) from ${cells - 1} interior wall line(s)`);
	} else if (elevated && mid > 0.004) {
		const along = mx.map((x, i) => x * f.axis[0] + my[i] * f.axis[1]), across = mx.map((x, i) => -x * f.axis[1] + my[i] * f.axis[0]);
		const lines = lineClusters(along, across, Math.max(1.5, 4 * g.v), Math.max(0.5, 0.08 * f.widthM));
		spans = lines + 1;
		kind = "pier";
		label = lines ? (lines > 4 ? "Pier- or wall-supported bridge (support count uncertain)" : `Pier-supported bridge / viaduct (about ${spans} spans)`) : "Elevated deck on interior walls";
		if (lines > 4) uncertain = true;
		evidence.push(`${lines} interior support line(s) under the deck`);
	} else if (elevated && L > 4 * W && W < 25) {
		kind = "elevated";
		label = "Elevated single-structure deck (flyover / long bridge)";
	} else if (elevated) {
		kind = "slab";
		label = "Slab or girder bridge on abutments";
		if (head > 0.01) evidence.push("end walls / abutments present");
	} else {
		kind = "at-grade";
		label = "Culvert or at-grade structure";
	}
	if (skewDeg >= 10) evidence.push(`substructure axis is ${skewDeg}° off the deck axis (skewed)`);
	// confidence: how many independent, measured features agree with the chosen label
	const confidence = Math.round(Math.min(uncertain ? 40 : 70, 30 + 8 * evidence.length));
	return { label, kind, cells: cells || undefined, spans: spans || undefined, skewDegrees: skewDeg || undefined, estimated: true, confidence, evidence };
}

function assessQuality(P, res, counts, confSum, total, meta) {
	const g = res.grid, f = res.frame;
	const unclassified = share(counts, C.UNCLASSIFIED, total);
	let cs = 0, cn = 0;
	for (let c = 1; c < 256; c++) if (counts[c]) { cs += confSum[c]; cn += counts[c]; }
	const meanConf = cn ? cs / cn : 0;
	const deckArea = res.deck ? res.deck.chosen.reduce((s, r) => s + r.areaM2, 0) : 0;
	const solidity = res.deck ? res.deck.chosen.reduce((s, r) => s + r.solidity * r.areaM2, 0) / Math.max(1e-9, deckArea) : 0;
	// resolution relative to the structure: how many voxels span the narrow dimension
	const rel = f ? Math.min(f.lengthM, f.widthM) / g.v : 0;
	const issues = [];
	if (g.medianPoints < 6) issues.push("sparse points per voxel");
	if (unclassified > 0.25) issues.push(`${(100 * unclassified).toFixed(0)}% of points unclassified`);
	if (meanConf < 45) issues.push(`low mean confidence (${meanConf.toFixed(0)}%)`);
	if (res.deck && solidity < 0.6) issues.push(`deck coverage incomplete (${(100 * solidity).toFixed(0)}% filled)`);
	if (rel < 25) issues.push("structure only a few voxels wide at the analysis resolution");
	let grade = "GOOD";
	if (issues.length >= 3 || !res.deck) grade = "LOW";
	else if (issues.length >= 1) grade = "FAIR";
	return {
		grade,
		carriagewayPointsPerM2: deckArea ? Math.round((counts[C.CARRIAGEWAY] || 0) / deckArea) : null,
		analysisVoxelM: +g.v.toFixed(3),
		medianPointsPerVoxel: g.medianPoints,
		unclassifiedShare: +unclassified.toFixed(3),
		meanConfidence: +meanConf.toFixed(1),
		deckCoverage: +solidity.toFixed(2),
		issues
	};
}

module.exports = { estimateBridgeType, assessQuality };
