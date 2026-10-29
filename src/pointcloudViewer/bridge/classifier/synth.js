/**
 * Labelled synthetic bridges for validating the generic classifier.
 * Every generator returns a point set (same shape as sampleOctree) plus `truth`
 * (class code per point). Layout is built in a bridge-local frame (u along the
 * road, v across, z up), then rotated/translated like a real survey so nothing
 * depends on axis alignment or coordinate magnitude.
 *
 *   node scripts/bridge/classifier/synth.js [--seeds 3]
 */
const { classify } = require("./classify");
const { CLASSES, C } = require("./classes");
const { estimateBridgeType, assessQuality } = require("./summary");

function rng(seed) {
	let s = seed >>> 0 || 1;
	return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
function gauss(r) { return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()); }

class Builder {
	constructor(seed, spacing = 0.08, noise = 0.012) {
		this.r = rng(seed); this.sp = spacing; this.noise = noise; this.pts = [];
	}
	push(u, v, z, label, rgb) { const n = this.noise; this.pts.push([u + gauss(this.r) * n, v + gauss(this.r) * n, z + gauss(this.r) * n, label, rgb]); }
	/** axis-aligned rectangle patch in (a,b) at fixed c; plane = "z" (a=u,b=v) | "u" (a=v,b=z) | "v" (a=u,b=z) */
	rect(plane, c, a0, a1, b0, b1, label, rgb, sp = this.sp) {
		for (let a = a0; a <= a1; a += sp) for (let b = b0; b <= b1; b += sp) {
			const ja = a + (this.r() - 0.5) * sp, jb = b + (this.r() - 0.5) * sp;
			if (plane === "z") this.push(ja, jb, c, label, rgb);
			else if (plane === "u") this.push(c, ja, jb, label, rgb);
			else this.push(ja, c, jb, label, rgb);
		}
	}
	box(u0, u1, v0, v1, z0, z1, label, rgb, sp = this.sp) {
		this.rect("z", z1, u0, u1, v0, v1, label, rgb, sp);
		this.rect("u", u0, v0, v1, z0, z1, label, rgb, sp); this.rect("u", u1, v0, v1, z0, z1, label, rgb, sp);
		this.rect("v", v0, u0, u1, z0, z1, label, rgb, sp); this.rect("v", v1, u0, u1, z0, z1, label, rgb, sp);
	}
	/** terrain: gentle slope + roughness, skipping a footprint */
	terrain(u0, u1, v0, v1, zf, skip, label = C.GROUND, sp = 0.09) {
		for (let u = u0; u <= u1; u += sp) for (let v = v0; v <= v1; v += sp) {
			if (skip && skip(u, v)) continue;
			this.push(u + (this.r() - 0.5) * sp, v + (this.r() - 0.5) * sp, zf(u, v) + gauss(this.r) * 0.03, label, [120, 100, 80]);
		}
	}
	vegetation(cu, cv, z0, radius, height, count) {
		for (let k = 0; k < count; k++) {
			const a = this.r() * 6.283, d = Math.sqrt(this.r()) * radius, h = this.r() * height;
			this.push(cu + Math.cos(a) * d, cv + Math.sin(a) * d, z0 + h, C.VEGETATION, [40 + this.r() * 40, 90 + this.r() * 70, 40]);
		}
	}
	finish(opts = {}) {
		const { angle = 0, shift = [253000, 3023000], dropout = 0 } = opts;
		const ca = Math.cos(angle), sa = Math.sin(angle);
		const kept = this.pts.filter(() => this.r() >= dropout);
		const n = kept.length, x = new Float32Array(n), y = new Float32Array(n), z = new Float32Array(n);
		const r = new Uint8Array(n), g = new Uint8Array(n), b = new Uint8Array(n), inten = new Uint8Array(n), truth = new Uint8Array(n);
		kept.forEach((p, i) => {
			x[i] = p[0] * ca - p[1] * sa; y[i] = p[0] * sa + p[1] * ca; z[i] = p[2];
			[r[i], g[i], b[i]] = p[4] || [150, 150, 150]; inten[i] = 100; truth[i] = p[3];
		});
		return { n, x, y, z, r, g, b, i: inten, origin: [shift[0], shift[1], 0], truth, meta: { totalPoints: n, maxLevel: 0, spacing: this.sp } };
	}
}

const AMBIG = 250;
const GREY = [150, 150, 155], DARK = [90, 90, 95];

/** Road-level furniture: vehicles, cones, noise above/at the deck. */
function traffic(b, u0, u1, vRoad0, vRoad1, zDeck, n = { vehicles: 2, cones: 6, noise: 150 }) {
	for (let k = 0; k < n.vehicles; k++) {
		const u = u0 + (u1 - u0) * (0.2 + 0.6 * b.r()), v = vRoad0 + (vRoad1 - vRoad0) * (0.25 + 0.5 * b.r());
		b.box(u, u + 4.2, v, v + 1.8, zDeck, zDeck + 1.5, C.OTHER, [200, 40, 40], 0.1);
	}
	for (let k = 0; k < n.cones; k++) {
		const u = u0 + (u1 - u0) * b.r(), v = vRoad0 + (vRoad1 - vRoad0) * b.r();
		b.box(u, u + 0.35, v, v + 0.35, zDeck, zDeck + 0.7, C.OTHER, [255, 120, 20], 0.05);
	}
	for (let k = 0; k < n.noise; k++) { const cu = u0 + (u1 - u0) * b.r(), cv = vRoad0 + (vRoad1 - vRoad0) * b.r(); for (let j = 0; j < 12; j++) b.push(cu + gauss(b.r) * 0.25, cv + gauss(b.r) * 0.25, zDeck + 0.1 + b.r() * 0.18, C.ROAD_NOISE, GREY); }
}

/** Beam/slab bridge on abutments over a channel. options: spans, median, wing */
function slabBridge(seed, o = {}) {
	const { length = 30, width = 12, zDeck = 7, thick = 0.7, median = false, wing = true, spans = 1, veg = true } = o;
	const b = new Builder(seed);
	const u0 = 0, u1 = length, v0 = 0, v1 = width;
	b.rect("z", zDeck, u0, u1, v0, v1, C.CARRIAGEWAY, GREY);
	b.rect("z", zDeck - thick, u0, u1, v0, v1, C.TOPSLAB, DARK);
	b.rect("v", v0, u0, u1, zDeck - thick, zDeck, C.TOPSLAB, DARK, 0.1); b.rect("v", v1, u0, u1, zDeck - thick, zDeck, C.TOPSLAB, DARK, 0.1);
	for (const v of [v0 + 0.15, v1 - 0.15]) b.box(u0, u1, v - 0.15, v + 0.15, zDeck, zDeck + 1.0, C.PARAPET, [170, 170, 170], 0.08);
	if (median) b.box(u0, u1, width / 2 - 0.6, width / 2 + 0.6, zDeck, zDeck + 0.45, C.MEDIAN, [190, 190, 190], 0.07);
	// abutments / piers: full-width walls under the deck at the span ends
	const stations = [u0 + 1.2]; for (let s = 1; s < spans; s++) stations.push(u0 + (length * s) / spans); stations.push(u1 - 1.2);
	stations.forEach((u, i) => {
		const end = i === 0 || i === stations.length - 1;
		b.rect("u", u, v0 + 0.2, v1 - 0.2, 0, zDeck - thick, end ? C.HEADWALL : C.MIDWALL, [160, 160, 150], 0.09); // abutments sit at the ends of the long axis = headwalls; interior piers = middle walls
	});
	// channel bed / embankment
	const zg = (u, v) => 0 + (u < 4 ? (4 - u) * 0.35 : 0) + (u > length - 4 ? (u - (length - 4)) * 0.35 : 0);
	b.terrain(-18, length + 18, -14, width + 14, zg, (u, v) => u > u0 && u < u1 && v > v0 && v < v1);
	b.terrain(u0, u1, v0, v1, zg, null, AMBIG); // bed under the soffit: channel bed or culvert floor, indistinguishable from the surface alone
	if (wing) for (const v of [v0 - 0.2, v1 + 0.2]) for (const [ua, ub] of [[u0 - 7, u0 + 1.2], [u1 - 1.2, u1 + 7]]) b.rect("v", v, ua, ub, 0, Math.min(zDeck - 0.5, 3.5), C.HEADWALL, [160, 160, 150], 0.1);
	// approach road on the embankment at deck level
	for (const [ua, ub] of [[-18, u0], [u1, length + 18]]) b.rect("z", zDeck - 0.02, ua, ub, v0, v1, C.CARRIAGEWAY, GREY, 0.09);
	traffic(b, u0 + 2, u1 - 2, v0 + 1, v1 - 1, zDeck);
	if (veg) for (let k = 0; k < 14; k++) b.vegetation((b.r() - 0.5) * (length + 36) + length / 2, (b.r() < 0.5 ? -1 : 1) * (width / 2 + 5 + b.r() * 6) + width / 2, 0.2, 2, 3.5, 5000);
	return b;
}

/** Box culvert: roof slab with road on top, barrel walls/partition/floor, headwalls at both ends, embankment. */
function boxCulvert(seed, o = {}) {
	const { cells = 2, cellW = 2.6, h = 2.4, roof = 0.45, veg = true } = o;
	const b = new Builder(seed);
	const W = cells * cellW + (cells + 1) * 0.4, zRoad = h + roof + 0.5;
	const barrelLen = o.barrelLen || 12, u0 = -barrelLen / 2, u1 = barrelLen / 2, v0 = 0, v1 = W;
	const inChannel = (v) => v > v0 - 1 && v < v1 + 1;
	// the road runs along v on top of the fill; the barrel crosses under it along u
	b.rect("z", zRoad, u0, u1, v0 - 14, v1 + 14, C.CARRIAGEWAY, GREY, 0.09);
	b.rect("z", 0, u0, u1, v0, v1, C.FLOOR, DARK);
	b.rect("z", h, u0, u1, v0, v1, C.TOPSLAB, DARK);
	for (let c = 0; c <= cells; c++) {
		const v = v0 + 0.2 + c * (cellW + 0.4);
		b.rect("v", v, u0, u1, 0, h, c === 0 || c === cells ? C.WALL : C.MIDWALL, [160, 160, 150], 0.08);
	}
	for (const u of [u0, u1]) b.rect("u", u, v0 - 1, v1 + 1, 0, zRoad, C.HEADWALL, [160, 160, 150], 0.1);
	for (const sgn of [-1, 1]) for (const v of [v0 - 1, v1 + 1]) b.rect("v", v, sgn * barrelLen / 2, sgn * (barrelLen / 2 + 3.5), 0, zRoad, C.HEADWALL, [160, 160, 150], 0.1);
	// embankment: slopes down from the road edge; a channel is open in front of both headwalls
	const zg = (u, v) => (inChannel(v) ? 0 : Math.max(0, zRoad - (Math.abs(u) - barrelLen / 2) * 0.8));
	b.terrain(-22, 22, v0 - 16, v1 + 16, zg, (u, v) => Math.abs(u) <= barrelLen / 2 + 0.01);
	traffic(b, u0 + 1, u1 - 1, v0 - 10, v1 + 10, zRoad, { vehicles: 1, cones: 4, noise: 60 });
	if (veg) for (let k = 0; k < 6; k++) b.vegetation((b.r() - 0.5) * 36, (b.r() < 0.5 ? -1 : 1) * (W / 2 + 9 + b.r() * 4) + W / 2, 0.5, 2, 3, 4000);
	return b;
}

/** Elevated flyover: deck on piers over a road; no walls/wing walls. */
function flyover(seed, o = {}) {
	const { length = 60, width = 14, zDeck = 9, thick = 1.2, piers = 4 } = o;
	const b = new Builder(seed, 0.08);
	b.rect("z", zDeck, 0, length, 0, width, C.CARRIAGEWAY, GREY);
	b.rect("z", zDeck - thick, 0, length, 0, width, C.TOPSLAB, DARK);
	b.rect("v", 0, 0, length, zDeck - thick, zDeck, C.TOPSLAB, DARK, 0.1); b.rect("v", width, 0, length, zDeck - thick, zDeck, C.TOPSLAB, DARK, 0.1);
	for (const v of [0.2, width - 0.2]) b.box(0, length, v - 0.15, v + 0.15, zDeck, zDeck + 1.1, C.PARAPET, [170, 170, 170], 0.08);
	b.box(0, length, width / 2 - 0.6, width / 2 + 0.6, zDeck, zDeck + 0.5, C.MEDIAN, [190, 190, 190], 0.07);
	for (let k = 0; k < piers; k++) { const u = 4 + (length - 8) * k / (piers - 1); b.box(u - 0.5, u + 0.5, width / 2 - 0.5, width / 2 + 0.5, 0, zDeck - thick, C.MIDWALL, [160, 160, 150], 0.08); }
	b.terrain(-20, length + 20, -16, width + 16, () => 0, null);
	traffic(b, 3, length - 3, 1, width - 1, zDeck, { vehicles: 3, cones: 8, noise: 200 });
	for (let k = 0; k < 10; k++) b.vegetation((b.r() - 0.5) * (length + 30) + length / 2, (b.r() < 0.5 ? -1 : 1) * (width / 2 + 9 + b.r() * 6) + width / 2, 0, 2.5, 4, 5000);
	return b;
}

const SUITE = [
	["slab, 1 span", (s) => slabBridge(s), { angle: 0.0 }],
	["slab, skewed 28°", (s) => slabBridge(s), { angle: 0.49 }],
	["slab, rotated 117°, with median", (s) => slabBridge(s, { median: true }), { angle: 2.04 }],
	["multi-span (3), no wing walls", (s) => slabBridge(s, { spans: 3, wing: false, length: 45 }), { angle: 1.1 }],
	["wide slab, heavy vegetation", (s) => slabBridge(s, { width: 18, median: true }), { angle: 3.6 }],
	["box culvert, 2 cells", (s) => boxCulvert(s), { angle: 0.8 }],
	["box culvert, 3 cells, rotated", (s) => boxCulvert(s, { cells: 3, barrelLen: 16 }), { angle: 2.6 }],
	["flyover on piers", (s) => flyover(s), { angle: 0.3 }],
	["slab with 25% dropout (occlusion)", (s) => slabBridge(s), { angle: 0.7, dropout: 0.25 }]
];

function evaluate(name, P) {
	const res = classify(P);
	const n = P.n, g = res.grid;
	// per-point prediction through the voxel class volume (as classify-octree does)
	const vol = new Uint8Array(g.nx * g.ny * g.nz).fill(255);
	for (let idx = 0; idx < g.dense.length; idx++) { const o = g.dense[idx]; if (o >= 0) vol[idx] = res.cls[o]; }
	const pred = new Uint8Array(n);
	const inv = 1 / g.v;
	for (let i = 0; i < n; i++) {
		const ix = Math.floor((P.x[i] - g.lo[0]) * inv), iy = Math.floor((P.y[i] - g.lo[1]) * inv), iz = Math.floor((P.z[i] - g.lo[2]) * inv);
		if (ix < 0 || iy < 0 || iz < 0 || ix >= g.nx || iy >= g.ny || iz >= g.nz) continue;
		const c = vol[(iz * g.ny + iy) * g.nx + ix]; pred[i] = c === 255 ? 0 : c;
	}
	const tp = new Float64Array(256), fp = new Float64Array(256), fn = new Float64Array(256), tcount = new Float64Array(256);
	for (let i = 0; i < n; i++) { let t = P.truth[i]; const p = pred[i]; if (t === AMBIG) t = p === C.FLOOR || p === C.GROUND ? p : C.GROUND; tcount[t]++; if (t === p) tp[t]++; else { fn[t]++; fp[p]++; } }
	const rows = [];
	let correct = 0; for (let k = 0; k < 256; k++) correct += tp[k];
	for (const c of CLASSES) {
		if (c.code === 0) continue;
		if (!tcount[c.code] && !fp[c.code]) continue;
		rows.push({ label: c.label, truth: tcount[c.code], recall: tcount[c.code] ? tp[c.code] / tcount[c.code] : null, precision: tp[c.code] + fp[c.code] ? tp[c.code] / (tp[c.code] + fp[c.code]) : null, extra: tcount[c.code] ? 0 : fp[c.code] });
	}
	let unc = 0; for (let i = 0; i < n; i++) if (pred[i] === 0) unc++;
	const cnt = new Float64Array(256); for (let i = 0; i < n; i++) cnt[pred[i]]++;
	const type = estimateBridgeType(res, cnt, n);
	return { name, n, deck: !!res.deck, acc: correct / n, unclassified: unc / n, rows, type: type.label };
}

function main() {
	const seeds = Number(process.argv[process.argv.indexOf("--seeds") + 1]) || 1;
	const summary = [];
	for (const [name, make, opts] of SUITE) {
		for (let s = 1; s <= seeds; s++) {
			const t0 = Date.now();
			const P = make(1000 + s * 17).finish(opts);
			const r = evaluate(name + (seeds > 1 ? ` #${s}` : ""), P);
			summary.push(r);
			console.log(`\n${r.name}  (${r.n.toLocaleString()} pts, deck ${r.deck ? "found" : "NOT FOUND"}, accuracy ${(100 * r.acc).toFixed(1)}%, unclassified ${(100 * r.unclassified).toFixed(1)}%, ${((Date.now() - t0) / 1000).toFixed(1)}s)  -> estimated type: ${r.type}`);
			for (const x of r.rows) console.log("  " + x.label.padEnd(40) + (x.recall == null ? "  (absent in truth)  falsely labelled: " + x.extra : `recall ${(100 * x.recall).toFixed(0).padStart(3)}%  precision ${x.precision == null ? "  — " : (100 * x.precision).toFixed(0).padStart(3) + "%"}`) + `  n=${x.truth}`);
		}
	}
	const mean = summary.reduce((a, r) => a + r.acc, 0) / summary.length;
	console.log(`\nmean overall accuracy ${(100 * mean).toFixed(1)}% over ${summary.length} runs; decks found ${summary.filter((r) => r.deck).length}/${summary.length}`);
}

if (require.main === module) main();
module.exports = { SUITE, evaluate, slabBridge, boxCulvert, flyover };
