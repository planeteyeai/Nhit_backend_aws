/**
 * Generic bridge component classifier (voxel level).
 *
 *   points -> voxel features -> horizontal surface regions -> DECK (chosen from
 *   measured shape/smoothness/elevation) -> bridge FRAME (axes, deck height map,
 *   footprint) -> SUBSTRUCTURE axis (from the enclosed surfaces under the deck)
 *   -> hierarchical labelling relative to those frames -> confidence.
 *
 * Nothing here knows about a particular bridge: every threshold is a ratio, or a
 * fraction of the measured deck length/width, or a multiple of the voxel size /
 * measured noise. If no deck can be established, only the environment classes
 * (ground / vegetation) are produced and everything else stays Unclassified.
 */
const { buildGrid, T } = require("./voxel");
const { horizontalRegions, UnionFind } = require("./regions");
const { chamferNearest, closing, orientedBox } = require("./plan2d");
const { C } = require("./classes");

function median(arr) {
	if (!arr.length) return NaN;
	const s = Float64Array.from(arr).sort();
	return s[s.length >> 1];
}
function quantile(sorted, p) { return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))]; }

/* ------------------------------------------------------------------------ deck */

function describeRegion(g, r) {
	const xs = [], ys = [];
	for (const c of r.cols) { xs.push(c % g.nx); ys.push(Math.floor(c / g.nx)); }
	const box = orientedBox(xs, ys);
	r.box = box;
	r.solidity = box.fill;
	r.elongation = box.elongation;
	r.lengthM = box.length * g.v;
	r.widthM = box.width * g.v;
}

function selectDeck(g, hr) {
	const { regions } = hr;
	const v = g.v;
	const big = regions.filter((r) => r.areaM2 >= Math.max(10, 80 * v * v));
	if (!big.length) return null;
	for (const r of big) describeRegion(g, r);

	// "ground level" = lowest area-weighted surface among the large horizontal regions
	const byZ = [...big].sort((a, b) => a.meanZ - b.meanZ);
	const totalA = byZ.reduce((s, r) => s + r.areaM2, 0);
	let acc = 0, zLow = byZ[0].meanZ;
	for (const r of byZ) { acc += r.areaM2; if (acc >= 0.12 * totalA) { zLow = r.meanZ; break; } }

	// share of a region's columns that have another large horizontal surface 0.3-8 m below (soffit, floor): a deck spans a void, terrain does not
	const supportOf = (r) => {
		let best = 0;
		for (const q of big) {
			if (q === r || q.meanZ >= r.meanZ - 0.3 || q.meanZ < r.meanZ - 8) continue;
			let n = 0; for (const c of q.cols) if (r.cols.has(c)) n++;
			best = Math.max(best, n / Math.min(q.cols.size, r.cols.size));
		}
		return best;
	};
	for (const r of big) r.support = supportOf(r);
	const score = (r, requireElevated) => {
		if (r.solidity < 0.5) return 0;
		const smooth = Math.min(1, Math.max(0.25, 1.3 - 8 * (r.meanSigma / v)));
		const shape = r.elongation >= 1.5 ? 1 : 0.7;
		const elev = r.meanZ - zLow;
		if (requireElevated && elev < Math.max(1.0, 5 * v)) return 0;
		return r.areaM2 * r.solidity * r.solidity * smooth * shape * (1 + 0.6 * r.support);
	};
	let cands = big.map((r) => ({ r, s: score(r, true) })).filter((c) => c.s > 0).sort((a, b) => b.s - a.s);
	let elevated = true;
	if (!cands.length) {
		elevated = false;
		cands = big.map((r) => ({ r, s: score(r, false) })).filter((c) => c.s > 0).sort((a, b) => b.s - a.s);
	}
	if (!cands.length) return null;
	let primary = cands[0].r;
	// roadway above soffit: when a comparable horizontal surface lies directly ABOVE the chosen one (deck thickness), the upper one is the carriageway
	for (let guard = 0; guard < 2; guard++) {
		const ups = [];
		for (const r of big) {
			if (r === primary || r.solidity < 0.3 || r.areaM2 < 0.15 * primary.areaM2) continue;
			const dz = r.meanZ - primary.meanZ;
			if (dz < 0.3 || dz > Math.max(2.0, 0.08 * primary.lengthM)) continue;
			let n = 0; for (const c of r.cols) if (primary.cols.has(c)) n++;
			if (n >= 0.5 * Math.min(r.cols.size, primary.cols.size)) { r.sharedM2 = n * v * v; ups.push(r); } // lies over the primary (a carriageway split by median / parapets / vehicles counts as several)
		}
		const total = ups.reduce((acc, r) => acc + r.sharedM2, 0);
		if (!ups.length || total < 0.6 * primary.areaM2) break;
		primary = ups.sort((x, y) => y.areaM2 - x.areaM2)[0];
	}
	const pb = primary.box;
	const chosen = [primary];
	// Companions: other carriageways BESIDE the primary (parallel, overlapping along the axis, not stacked under it).
	// A fragmented companion (vehicles / vegetation punch holes in it) may have low solidity if it is long, thin and parallel.
	const companion = (r) => {
		if (r === primary || r.areaM2 < 0.15 * primary.areaM2 || r.solidity < 0.3) return false;
		if (elevated && r.meanZ - zLow < Math.max(1.0, 5 * v)) return false; // terrain at ground level is never a second carriageway
		if (r.solidity < 0.5 && r.elongation < 3) return false;
		if (r.elongation >= 2.5) {
			const ang = Math.abs(Math.atan2(r.box.uy, r.box.ux) - Math.atan2(pb.uy, pb.ux));
			if (Math.min(ang % Math.PI, Math.PI - (ang % Math.PI)) > (12 * Math.PI) / 180) return false;
		}
		const dx = r.box.cx - pb.cx, dy = r.box.cy - pb.cy;
		const along = (dx * pb.ux + dy * pb.uy) * v, across = (dx * pb.wx + dy * pb.wy) * v;
		if (Math.abs(across) > 2.5 * primary.widthM + r.widthM) return false;
		if (Math.abs(along) > 0.8 * (primary.lengthM + r.lengthM)) return false;
		if (Math.abs(r.meanZ - primary.meanZ) > Math.max(4, 0.35 * primary.lengthM)) return false;
		// stacked under/over the primary (soffit, parapet top...) is not a second carriageway
		let overlap = 0;
		for (const c of r.cols) if (primary.cols.has(c)) overlap++;
		return overlap < 0.3 * r.cols.size;
	};
	const pool = regions.filter((r) => r.areaM2 >= Math.max(10, 80 * v * v) && r.box);
	for (const r of pool) { if (r.solidity === undefined) describeRegion(g, r); }
	for (const r of pool) if (companion(r)) chosen.push(r);
	return { primary, chosen, zLow, elevated, candidates: cands.length };
}

function buildFrame(g, deck, hr) {
	const { nx, ny, v, lo } = g;
	const mask = new Uint8Array(nx * ny);
	const xs = [], ys = [];
	for (const r of deck.chosen) for (const c of r.cols) { mask[c] = 1; xs.push(c % nx); ys.push(Math.floor(c / nx)); }
	const box = orientedBox(xs, ys);
	const lengthM = box.length * v, widthM = box.width * v;
	const closeR = Math.min(4.0, Math.max(1.0, 0.1 * widthM)); // carriageway gaps are bridged, not hard-coded
	const footprint = closing(mask, nx, ny, v, closeR);
	const zoneR = Math.max(2.0, 0.08 * widthM);
	const toFp = chamferNearest(footprint, nx, ny, v).dist;
	const inv = new Uint8Array(nx * ny);
	for (let i = 0; i < inv.length; i++) inv[i] = footprint[i] ? 0 : 1;
	const dEdge = chamferNearest(inv, nx, ny, v).dist;
	const chosenIds = new Set(deck.chosen.map((r) => r.id));
	const colZ = new Map();
	for (let o = 0; o < g.occ; o++) {
		const id = hr.label[o];
		if (id < 0 || !chosenIds.has(id)) continue;
		const c = g.iy[o] * nx + g.ix[o];
		let a = colZ.get(c); if (!a) colZ.set(c, a = []);
		a.push(g.mz[o]);
	}
	const deckH = new Float32Array(nx * ny).fill(NaN);
	for (const [c, a] of colZ) deckH[c] = median(a);
	const nearestDeck = chamferNearest(mask, nx, ny, v);
	const H = new Float32Array(nx * ny);
	for (let c = 0; c < H.length; c++) { const s = nearestDeck.src[c]; H[c] = s >= 0 ? deckH[s] : NaN; }
	const res = [];
	for (let o = 0; o < g.occ; o++) {
		const id = hr.label[o];
		if (id < 0 || !chosenIds.has(id)) continue;
		res.push(Math.abs(g.mz[o] - H[g.iy[o] * nx + g.ix[o]]));
		if (res.length > 400000) break;
	}
	res.sort((a, b) => a - b);
	const sigma = res.length ? 1.4826 * quantile(res, 0.5) : v * 0.3;
	const tol = Math.max(0.6 * v, 3 * sigma, 0.08);
	const cxw = lo[0] + (box.cx + 0.5) * v, cyw = lo[1] + (box.cy + 0.5) * v;
	return {
		axis: [box.ux, box.uy], normal: [box.wx, box.wy], centre: [cxw, cyw],
		lengthM, widthM, tMin: box.uMin * v, tMax: box.uMax * v, dMin: box.wMin * v, dMax: box.wMax * v,
		closeR, zoneR, tol, sigma, footprint, dEdge, toFp, H, deckMask: mask
	};
}

/* ----------------------------------------------------------------- labelling */

function labelVoxels(g, deck, frame, hr) {
	const { occ, nx, ny, nz, v, dense } = g;
	const cls = new Uint8Array(occ);
	const conf = new Uint8Array(occ);
	const done = new Uint8Array(occ);
	const set = (o, c, k) => { cls[o] = c; conf[o] = Math.max(0, Math.min(100, Math.round(k))); done[o] = 1; };
	const [ux, uy] = frame.axis, [wx, wy] = frame.normal;
	const [cx, cy] = frame.centre;
	const tol = frame.tol;
	const L = frame.lengthM, W = frame.widthM;
	const edgeBand = Math.max(1.5, 0.12 * W);
	const chosenIds = new Set(deck.chosen.map((r) => r.id));
	const isDeckVox = new Uint8Array(occ);
	for (let o = 0; o < occ; o++) if (hr.label[o] >= 0 && chosenIds.has(hr.label[o])) isDeckVox[o] = 1;

	const col = (o) => g.iy[o] * nx + g.ix[o];
	const tOf = (o) => (g.mx[o] - cx) * ux + (g.my[o] - cy) * uy;
	const dOf = (o) => (g.mx[o] - cx) * wx + (g.my[o] - cy) * wy;
	const quality = (o) => Math.min(1, g.nAgg[o] / 15);
	const green = (o) => g.rgbI.g[o] > g.rgbI.r[o] + 6 && g.rgbI.g[o] > g.rgbI.b[o] + 6;
	const inZone = (c) => frame.toFp[c] <= frame.zoneR;
	const hasH = (c) => frame.H[c] === frame.H[c];
	const rOf = (o) => g.mz[o] - frame.H[col(o)];

	// ---- ground surface (lowest planar surface per column, robustly smoothed)
	const gMin = new Float32Array(nx * ny).fill(Infinity);
	for (let o = 0; o < occ; o++) {
		const t = g.type[o];
		if ((t === T.HORIZ || t === T.SLOPE) && g.mz[o] < gMin[col(o)]) gMin[col(o)] = g.mz[o];
	}
	const have = new Uint8Array(nx * ny);
	for (let c = 0; c < gMin.length; c++) have[c] = gMin[c] < Infinity ? 1 : 0;
	const near = chamferNearest(have, nx, ny, v);
	const G0 = new Float32Array(nx * ny);
	for (let c = 0; c < G0.length; c++) G0[c] = near.src[c] >= 0 ? gMin[near.src[c]] : 0;
	const G = new Float32Array(nx * ny);
	const win = [];
	for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
		win.length = 0;
		for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
			const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= nx || yy >= ny) continue;
			win.push(G0[yy * nx + xx]);
		}
		win.sort((a, b) => a - b);
		G[y * nx + x] = win[Math.floor(win.length * 0.35)];
	}

	/* ---------- 1. above the deck surface: barriers, objects, noise ---------- */
	const above = new Uint8Array(occ);
	for (let o = 0; o < occ; o++) {
		if (isDeckVox[o]) continue;
		const c = col(o);
		if (!inZone(c) || !hasH(c)) continue;
		const r = rOf(o);
		if (r > tol && r < 7) above[o] = 1;
	}
	const uf = new UnionFind(occ);
	for (let o = 0; o < occ; o++) {
		if (!above[o]) continue;
		const x0 = g.ix[o], y0 = g.iy[o], z0 = g.iz[o];
		for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
			if (!dx && !dy && !dz) continue;
			const xx = x0 + dx, yy = y0 + dy, zz = z0 + dz;
			if (xx < 0 || yy < 0 || zz < 0 || xx >= nx || yy >= ny || zz >= nz) continue;
			const k = dense[(zz * ny + yy) * nx + xx];
			if (k > o && above[k]) uf.union(o, k);
		}
	}
	const comps = new Map();
	for (let o = 0; o < occ; o++) {
		if (!above[o]) continue;
		const root = uf.find(o);
		let s = comps.get(root);
		if (!s) comps.set(root, s = []);
		s.push(o);
	}
	const BIN = 0.5;
	// a median has carriageway on BOTH sides, a parapet only on the outer one (independent of the footprint outline)
	const deckCol = new Uint8Array(nx * ny);
	for (let o = 0; o < occ; o++) if (isDeckVox[o]) deckCol[col(o)] = 1;
	const bothSidesDeck = (voxels, lenD) => {
		const step = Math.max(1, Math.floor(voxels.length / 300));
		const reach = lenD / 2 + 1.0;
		let both = 0, n = 0;
		const has = (x, y) => {
			const ix = Math.floor((x - g.lo[0]) / v), iy = Math.floor((y - g.lo[1]) / v);
			for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = ix + dx, yy = iy + dy; if (xx >= 0 && yy >= 0 && xx < nx && yy < ny && deckCol[yy * nx + xx]) return true; }
			return false;
		};
		for (let i = 0; i < voxels.length; i += step) {
			const o = voxels[i], d0 = dOf(o);
			const px = g.mx[o] - d0 * wx, py = g.my[o] - d0 * wy; // point on the strip's t-position, d = 0 line
			const a = has(px + (d0 + reach) * wx, py + (d0 + reach) * wy), b = has(px + (d0 - reach) * wx, py + (d0 - reach) * wy);
			n++; if (a && b) both++;
		}
		return n ? both / n : 0;
	};
	// geometry of one connected set of above-deck voxels
	const describe = (voxels) => {
		const s = { n: voxels.length, tMin: Infinity, tMax: -Infinity, dMin: Infinity, dMax: -Infinity, rMin: Infinity, rMax: -Infinity, planar: 0, scatter: 0, edge: [], voxels };
		for (const o of voxels) {
			const t = tOf(o), d = dOf(o), r = rOf(o);
			if (t < s.tMin) s.tMin = t; if (t > s.tMax) s.tMax = t;
			if (d < s.dMin) s.dMin = d; if (d > s.dMax) s.dMax = d;
			if (r < s.rMin) s.rMin = r; if (r > s.rMax) s.rMax = r;
			if (g.type[o] === T.HORIZ || g.type[o] === T.VERT) s.planar++;
			if (g.type[o] === T.SCATTER || g.type[o] === T.SPARSE) s.scatter++;
			s.edge.push(frame.dEdge[col(o)]);
		}
		s.lenT = s.tMax - s.tMin + v; s.lenD = s.dMax - s.dMin + v; s.height = s.rMax - s.rMin + v;
		s.planarFrac = s.planar / s.n; s.scatterFrac = s.scatter / s.n;
		s.edge.sort((x, y) => x - y);
		s.edgeMed = s.edge[s.edge.length >> 1];
		const nb = Math.max(1, Math.ceil(s.lenT / BIN));
		const binD = new Float64Array(nb), binN = new Uint32Array(nb);
		for (const o of voxels) { const bi = Math.min(nb - 1, Math.floor((tOf(o) - s.tMin) / BIN)); binD[bi] += dOf(o); binN[bi]++; }
		let occBins = 0, mean = 0;
		for (let bi = 0; bi < nb; bi++) if (binN[bi]) { occBins++; binD[bi] /= binN[bi]; mean += binD[bi]; }
		mean /= Math.max(1, occBins);
		let varD = 0; for (let bi = 0; bi < nb; bi++) if (binN[bi]) varD += (binD[bi] - mean) ** 2;
		s.spreadD = Math.sqrt(varD / Math.max(1, occBins));
		s.continuity = occBins / nb;
		s.strip = s.lenD <= Math.min(3.5, 0.25 * W) && s.height >= 0.15 && s.spreadD <= Math.max(0.4, 0.5 * s.lenD);
		return s;
	};
	const stripKind = (s) => (bothSidesDeck(s.voxels, s.lenD) >= 0.5 ? C.MEDIAN : C.PARAPET);
	const kindOf = (s, allowObjects = true) => {
		const { lenT, lenD, height, planarFrac, scatterFrac, continuity, edgeMed } = s;
		if (s.rMax <= 0.4 && (s.n <= 30 || scatterFrac >= 0.6)) return [C.ROAD_NOISE, 70];
		if (s.strip && lenT >= Math.max(6, 0.45 * L) && continuity >= 0.6) return [stripKind(s), 55 + 35 * Math.min(1, lenT / L) * continuity];
		if (s.strip && lenT >= 4 && lenT / Math.max(lenD, v) >= 6 && continuity >= 0.5) return [stripKind(s), 50];
		if (lenT <= 14 && lenD <= 14 && height <= 5 && s.n >= 2) return [C.OTHER, 60 + 20 * planarFrac];
		if (scatterFrac >= 0.5) return [C.VEGETATION, 50];
		return [C.UNCLASSIFIED, 20];
	};
	// A long strip (median / parapet) that touches vehicles or cones is one connected blob: peel the strip off first.
	const peelStrips = (s) => {
		const nb = Math.max(1, Math.ceil(s.lenT / BIN));
		const nd = Math.max(1, Math.ceil(s.lenD / v));
		const cover = Array.from({ length: nd }, () => new Set());
		const dBin = (o) => Math.min(nd - 1, Math.floor((dOf(o) - s.dMin) / v));
		for (const o of s.voxels) cover[dBin(o)].add(Math.min(nb - 1, Math.floor((tOf(o) - s.tMin) / BIN)));
		const isStripBin = cover.map((c) => c.size >= 0.7 * nb);
		const bands = [];
		for (let i = 0; i < nd; i++) if (isStripBin[i]) { let j = i; while (j + 1 < nd && isStripBin[j + 1]) j++; bands.push([i, j]); i = j; }
		const rest = [];
		const stripVox = bands.map(() => []);
		for (const o of s.voxels) {
			const di = dBin(o);
			const bi = bands.findIndex(([x, y]) => di >= x - 1 && di <= y + 1);
			if (bi >= 0 && (bands[bi][1] - bands[bi][0] + 1) * v <= Math.min(3.5, 0.25 * W)) stripVox[bi].push(o); else rest.push(o);
		}
		return { stripVox: stripVox.filter((x) => x.length), rest };
	};
	const labelComp = (voxels, allowPeel) => {
		const s = describe(voxels);
		let [klass, k] = kindOf(s);
		if (allowPeel && klass !== C.PARAPET && klass !== C.MEDIAN && s.lenT >= Math.max(6, 0.45 * L)) {
			const { stripVox, rest } = peelStrips(s);
			if (stripVox.length) {
				for (const sv of stripVox) { const sd = describe(sv); const [kk, kc] = kindOf(sd); const cl = kk === C.PARAPET || kk === C.MEDIAN ? kk : stripKind(sd); for (const o of sv) set(o, cl, (kk === cl ? kc : 50) * (0.7 + 0.3 * quality(o))); }
				if (rest.length) {
					const local = new Map(rest.map((o, i) => [o, i]));
					const luf = new UnionFind(rest.length);
					for (const o of rest) {
						const x0 = g.ix[o], y0 = g.iy[o], z0 = g.iz[o];
						for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
							if (!dx && !dy && !dz) continue;
							const xx = x0 + dx, yy = y0 + dy, zz = z0 + dz;
							if (xx < 0 || yy < 0 || zz < 0 || xx >= nx || yy >= ny || zz >= nz) continue;
							const kk = dense[(zz * ny + yy) * nx + xx];
							const li = kk >= 0 ? local.get(kk) : undefined;
							if (li !== undefined) luf.union(local.get(o), li);
						}
					}
					const groups = new Map();
					for (const o of rest) { const rt = luf.find(local.get(o)); let a = groups.get(rt); if (!a) groups.set(rt, a = []); a.push(o); }
					for (const list of groups.values()) labelComp(list, false);
				}
				return;
			}
		}
		for (const o of voxels) set(o, klass, k * (0.7 + 0.3 * quality(o)));
	};
	for (const voxels of comps.values()) labelComp(voxels, true);

	/* ---------- 2. substructure axis from the enclosed surfaces under the deck ---------- */
	const regSide = new Map();
	for (let o = 0; o < occ; o++) {
		const id = hr.label[o]; if (id < 0) continue;
		let s = regSide.get(id); if (!s) regSide.set(id, s = { inside: 0, outside: 0 });
		if (inZone(col(o))) s.inside++; else s.outside++;
	}
	const enclosed = (o) => { const s = regSide.get(hr.label[o]); return !!s && s.outside <= 0.25 * s.inside; };
	// candidate enclosed surfaces under the deck, per region; only the substantial ones define the substructure axis
	const underByRegion = new Map();
	for (let o = 0; o < occ; o++) {
		if (isDeckVox[o] || g.type[o] !== T.HORIZ || hr.label[o] < 0) continue;
		const c = col(o);
		if (!inZone(c) || !hasH(c) || rOf(o) >= -tol || !enclosed(o)) continue;
		let s = underByRegion.get(hr.label[o]); if (!s) underByRegion.set(hr.label[o], s = { cols: new Set(), vox: [] });
		s.cols.add(c); s.vox.push(o);
	}
	let biggest = 0;
	for (const s of underByRegion.values()) biggest = Math.max(biggest, s.cols.size);
	const underCols = new Set();
	const underVox = [];
	for (const s of underByRegion.values()) {
		if (s.cols.size < Math.max(0.2 * biggest, 25)) continue;
		for (const c of s.cols) underCols.add(c);
		for (const o of s.vox) underVox.push(o);
	}
	const soffitCols = underCols; // columns that have an enclosed soffit: the surface far below them is a floor, not terrain
	let encl;
	if (underCols.size >= 12) {
		const xs = [], ys = [];
		for (const c of underCols) { xs.push(c % nx); ys.push(Math.floor(c / nx)); }
		const b = orientedBox(xs, ys);
		encl = { found: true, a: [b.ux, b.uy], p: [b.wx, b.wy], c: [g.lo[0] + (b.cx + 0.5) * v, g.lo[1] + (b.cy + 0.5) * v], aMin: b.uMin * v, aMax: b.uMax * v, pMin: b.wMin * v, pMax: b.wMax * v, lengthM: b.length * v, widthM: b.width * v };
	} else {
		encl = { found: false, a: frame.axis, p: frame.normal, c: frame.centre, aMin: frame.tMin, aMax: frame.tMax, pMin: frame.dMin, pMax: frame.dMax, lengthM: L, widthM: W };
	}
	const alpha = (o) => (g.mx[o] - encl.c[0]) * encl.a[0] + (g.my[o] - encl.c[1]) * encl.a[1];
	const beta = (o) => (g.mx[o] - encl.c[0]) * encl.p[0] + (g.my[o] - encl.c[1]) * encl.p[1];
	const endBand = Math.max(1.0, 0.2 * encl.lengthM);
	const sideBand = Math.max(1.0, 0.2 * encl.widthM);
	// per-column horizontal layers (top = soffit, bottom = floor) among enclosed under-deck surfaces
	const layer = new Map();
	for (const o of underVox) { const c = col(o); let a = layer.get(c); if (!a) layer.set(c, a = { zMin: Infinity, zMax: -Infinity }); a.zMin = Math.min(a.zMin, g.mz[o]); a.zMax = Math.max(a.zMax, g.mz[o]); }
	const slabMax = Math.max(3.0, 0.05 * L);

	/* ---------- 3. everything else ---------- */
	for (let o = 0; o < occ; o++) {
		if (done[o]) continue;
		const c = col(o), type = g.type[o], q = quality(o);
		if (isDeckVox[o]) { set(o, C.CARRIAGEWAY, 92 * (0.8 + 0.2 * q)); continue; }
		if (inZone(c) && hasH(c)) {
			const r = rOf(o);
			if (Math.abs(r) <= tol) {
				if (type === T.HORIZ || type === T.SLOPE) set(o, C.CARRIAGEWAY, 75 * q);
				else if (type === T.SCATTER || type === T.SPARSE) set(o, C.ROAD_NOISE, 55);
				else set(o, C.UNCLASSIFIED, 10);
				continue;
			}
			if (r > tol) { set(o, C.UNCLASSIFIED, 10); continue; }
			// ---- below the deck surface, inside the bridge zone
			if (type === T.VERT) {
				const nxv = g.nrm[o * 3], nyv = g.nrm[o * 3 + 1];
				const na = Math.abs(nxv * encl.a[0] + nyv * encl.a[1]), np = Math.abs(nxv * encl.p[0] + nyv * encl.p[1]);
				const al = alpha(o), be = beta(o);
				const atEnd = al < encl.aMin + endBand || al > encl.aMax - endBand;
				const sideEdge = be < encl.pMin + sideBand || be > encl.pMax - sideBand;
				if (na >= 0.7) set(o, atEnd ? C.HEADWALL : C.MIDWALL, 70 * q);
				else if (np >= 0.7) set(o, sideEdge ? C.WALL : C.MIDWALL, 70 * q);
				else set(o, atEnd ? C.HEADWALL : sideEdge ? C.WALL : C.MIDWALL, 45 * q);
			} else if (type === T.HORIZ) {
				const s = regSide.get(hr.label[o]) || { inside: 1, outside: 0 };
				if (s.outside > 0.25 * s.inside) {
					// continues into the surroundings: channel bed / terrain, unless it is the floor of an enclosed cell
					if (soffitCols.has(c)) set(o, C.FLOOR, 66 * q); else set(o, C.GROUND, 72 * q);
				} else {
					const lay = layer.get(c);
					const depth = -r;
					const multi = lay && lay.zMax - lay.zMin > 0.6;
					const topLayer = multi ? g.mz[o] > lay.zMax - 0.4 : depth <= slabMax;
					set(o, topLayer ? C.TOPSLAB : C.FLOOR, 70 * q);
				}
			} else if (type === T.SLOPE) set(o, C.GROUND, 55 * q);
			else if (type === T.SCATTER && green(o) && !(frame.footprint[c] === 1)) set(o, C.VEGETATION, 55);
			else set(o, C.UNCLASSIFIED, 15);
			continue;
		}
		// ---- environment (outside the bridge zone)
		const h = g.mz[o] - G[c];
		if (type === T.HORIZ || type === T.SLOPE) {
			if (h <= Math.max(0.5, 2.5 * v)) set(o, C.GROUND, 82 * q);
			else set(o, h < 3 ? C.GROUND : C.UNCLASSIFIED, 35);
		} else if (type === T.SCATTER) {
			if (h >= 0.3 && h <= 30) set(o, C.VEGETATION, 55 + (green(o) ? 30 : 0) + 10 * Math.min(1, g.scatter[o] / 0.15));
			else if (h < 0.3) set(o, C.GROUND, 55);
			else set(o, C.UNCLASSIFIED, 20);
		} else if (type === T.VERT) set(o, h >= 0.4 ? C.UNCLASSIFIED : C.GROUND, 30);
		else if (type === T.LINEAR) set(o, C.UNCLASSIFIED, 40);
		else set(o, C.UNCLASSIFIED, 15);
	}

	/* ---------- 4. wing walls: vertical surfaces continuous with bridge walls ---------- */
	const seed = new Uint8Array(occ), queue = [];
	for (let o = 0; o < occ; o++) if (cls[o] === C.HEADWALL || cls[o] === C.WALL) { seed[o] = 1; queue.push(o); }
	const reach = Math.max(10, 0.8 * W);
	while (queue.length) {
		const o = queue.pop();
		const x0 = g.ix[o], y0 = g.iy[o], z0 = g.iz[o];
		for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
			if (!dx && !dy && !dz) continue;
			const xx = x0 + dx, yy = y0 + dy, zz = z0 + dz;
			if (xx < 0 || yy < 0 || zz < 0 || xx >= nx || yy >= ny || zz >= nz) continue;
			const k = dense[(zz * ny + yy) * nx + xx];
			if (k < 0 || seed[k] || g.type[k] !== T.VERT) continue;
			if (!(cls[k] === C.UNCLASSIFIED || cls[k] === C.GROUND || cls[k] === C.VEGETATION)) continue;
			if (frame.toFp[col(k)] > reach) continue;
			set(k, C.HEADWALL, 55 * quality(k));
			seed[k] = 1; queue.push(k);
		}
	}

	/* ---------- 5. neighbour vote: fill speckles inside the bridge zone with the surrounding structure class ---------- */
	const STRUCT = new Set([C.TOPSLAB, C.WALL, C.MIDWALL, C.FLOOR, C.HEADWALL, C.CARRIAGEWAY]);
	const votes = new Uint16Array(32);
	for (let pass = 0; pass < 2; pass++) {
		const fill = [];
		for (let o = 0; o < occ; o++) {
			if (cls[o] !== C.UNCLASSIFIED || !inZone(col(o))) continue;
			const x0 = g.ix[o], y0 = g.iy[o], z0 = g.iz[o];
			votes.fill(0);
			for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
				if (!dx && !dy && !dz) continue;
				const xx = x0 + dx, yy = y0 + dy, zz = z0 + dz;
				if (xx < 0 || yy < 0 || zz < 0 || xx >= nx || yy >= ny || zz >= nz) continue;
				const k = dense[(zz * ny + yy) * nx + xx];
				if (k >= 0 && STRUCT.has(cls[k]) && conf[k] >= 40) votes[cls[k] % 32]++;
			}
			let best = 0, bc = 0, total = 0;
			for (let c = 1; c < 32; c++) { total += votes[c]; if (votes[c] > bc) { bc = votes[c]; best = c; } }
			if (bc >= 3 && bc >= 0.6 * total) fill.push(o, best);
		}
		for (let i = 0; i < fill.length; i += 2) set(fill[i], fill[i + 1], 45);
		if (!fill.length) break;
	}

	// low confidence never names a component
	for (let o = 0; o < occ; o++) if (conf[o] < 25 && cls[o] !== C.UNCLASSIFIED) cls[o] = C.UNCLASSIFIED;
	return { cls, conf, ground: G, enclosure: { found: encl.found, axis: encl.a, lengthM: encl.lengthM, widthM: encl.widthM, columns: underCols.size } };
}

/* -------------------------------------------------------------------- driver */

function classify(P, opts = {}) {
	const g = buildGrid(P, opts);
	const hr = horizontalRegions(g);
	const deck = selectDeck(g, hr);
	if (!deck) return { grid: g, hr, deck: null, frame: null, ...environmentOnly(g) };
	const frame = buildFrame(g, deck, hr);
	const out = labelVoxels(g, deck, frame, hr);
	return { grid: g, hr, deck, frame, ...out };
}

function environmentOnly(g) {
	const { occ, nx, ny } = g;
	const cls = new Uint8Array(occ), conf = new Uint8Array(occ);
	const gMin = new Float32Array(nx * ny).fill(Infinity);
	for (let o = 0; o < occ; o++) { const t = g.type[o]; const c = g.iy[o] * nx + g.ix[o]; if ((t === T.HORIZ || t === T.SLOPE) && g.mz[o] < gMin[c]) gMin[c] = g.mz[o]; }
	for (let o = 0; o < occ; o++) {
		const c = g.iy[o] * nx + g.ix[o]; const h = gMin[c] < Infinity ? g.mz[o] - gMin[c] : 0;
		const t = g.type[o];
		if (t === T.HORIZ || t === T.SLOPE) { cls[o] = C.GROUND; conf[o] = 60; }
		else if (t === T.SCATTER && h >= 0.3) { cls[o] = C.VEGETATION; conf[o] = 50; }
		else { cls[o] = C.UNCLASSIFIED; conf[o] = 20; }
	}
	return { cls, conf };
}

module.exports = { classify };
