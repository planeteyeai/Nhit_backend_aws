/**
 * Classify a Potree octree and write the result INTO the point data.
 *
 *   node src/pointcloudViewer/bridge/classify-octree.js <pointcloud dir> [--sample N] [--dry] [--reset]
 *
 * 1. samples the octree uniformly (coarse levels), runs the generic classifier
 * 2. builds a class volume and assigns every point of every node a class
 *    (`classification` byte) and a confidence (`user data` byte, 0-100)
 * 3. writes classification.json (class table, counts, confidence, frame, label
 *    anchors) and classification.vol.z (zlib class volume for hover/selection)
 *
 * The viewer then hides/shows a class entirely on the GPU (Potree's own
 * classification filter), so toggling never touches point data.
 * --reset zeroes both bytes again (the files contained no classification before).
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { loadMetadata, loadNodes, readNode } = require("./lib/octree");
const { sampleOctree } = require("./classifier/points");
const { classify } = require("./classifier/classify");
const { CLASSES } = require("./classifier/classes");
const { estimateBridgeType, assessQuality } = require("./classifier/summary");
const crypto = require("crypto");

const CLASSIFICATION_VERSION = "2";

function arg(name, def) { const i = process.argv.indexOf(name); return i < 0 ? def : (process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : true); }

function buildVolume(res) {
	const g = res.grid;
	const vol = new Uint8Array(g.nx * g.ny * g.nz).fill(255);
	const conf = new Uint8Array(vol.length);
	for (let idx = 0; idx < g.dense.length; idx++) {
		const o = g.dense[idx];
		if (o >= 0) { vol[idx] = res.cls[o]; conf[idx] = res.conf[o]; }
	}
	return { vol, conf };
}

/** Label anchors: one per detected class, on a real voxel of that class (not an empty-space centroid). */
function anchors(res) {
	const g = res.grid;
	const acc = new Map();
	for (let o = 0; o < g.occ; o++) {
		const c = res.cls[o]; if (c === 0) continue;
		let s = acc.get(c); if (!s) acc.set(c, s = { n: 0, sx: 0, sy: 0, sz: 0, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], voxels: [] });
		const w = g.counts[o];
		s.n += w; s.sx += g.mx[o] * w; s.sy += g.my[o] * w; s.sz += g.mz[o] * w;
		s.min[0] = Math.min(s.min[0], g.mx[o]); s.max[0] = Math.max(s.max[0], g.mx[o]);
		s.min[1] = Math.min(s.min[1], g.my[o]); s.max[1] = Math.max(s.max[1], g.my[o]);
		s.min[2] = Math.min(s.min[2], g.mz[o]); s.max[2] = Math.max(s.max[2], g.mz[o]);
		s.voxels.push(o);
	}
	const out = {};
	for (const [code, s] of acc) {
		const cx = s.sx / s.n, cy = s.sy / s.n, cz = s.sz / s.n;
		// the class voxel nearest the centroid, preferring the upper surface
		let best = -1, bd = Infinity;
		for (const o of s.voxels) {
			if (res.conf[o] < 50) continue;
			const d = (g.mx[o] - cx) ** 2 + (g.my[o] - cy) ** 2 + 0.25 * (g.mz[o] - cz) ** 2;
			if (d < bd) { bd = d; best = o; }
		}
		if (best < 0) continue;
		out[code] = { anchor: [g.mx[best], g.my[best], g.mz[best]], centroid: [cx, cy, cz], min: s.min, max: s.max };
	}
	return out;
}

function main() {
	const dir = process.argv[2];
	if (!dir || !fs.existsSync(path.join(dir, "metadata.json"))) {
		console.error("usage: node src/pointcloudViewer/bridge/classify-octree.js <pointcloud dir> [--sample N] [--dry] [--reset]");
		process.exit(1);
	}
	const meta = loadMetadata(dir);
	const nodes = loadNodes(dir, meta);
	const clsOff = meta.attr.classification.offset;
	const udOff = meta.attr["user data"] ? meta.attr["user data"].offset : -1;
	const S = meta.stride;
	const dry = !!arg("--dry", false);
	const fd = fs.openSync(path.join(dir, "octree.bin"), dry ? "r" : "r+");

	if (arg("--reset", false)) {
		for (const n of nodes) {
			const buf = readNode(fd, meta, n);
			for (let i = 0; i < n.numPoints; i++) { buf[i * S + clsOff] = 0; if (udOff >= 0) buf[i * S + udOff] = 0; }
			fs.writeSync(fd, buf, 0, buf.length, n.byteOffset);
		}
		fs.closeSync(fd);
		for (const f of ["classification.json", "classification.vol.z"]) fs.rmSync(path.join(dir, f), { force: true });
		console.log("classification reset to 0");
		return;
	}

	// cache: same dataset + same algorithm version => the stored classification is still valid
	const sidecarPath = path.join(dir, "classification.json");
	if (!dry && !arg("--force", false) && fs.existsSync(sidecarPath)) {
		try {
			const prev = JSON.parse(fs.readFileSync(sidecarPath, "utf8"));
			const ver = crypto.createHash("sha1").update(fs.readFileSync(path.join(dir, "metadata.json"))).update(String(meta.points)).digest("hex").slice(0, 16);
			if (prev.classificationVersion === CLASSIFICATION_VERSION && prev.datasetVersion === ver) {
				console.log(`classification is up to date (version ${CLASSIFICATION_VERSION}, dataset ${ver}); use --force to recompute`);
				fs.closeSync(fd);
				return;
			}
		} catch { /* recompute */ }
	}
	const t0 = Date.now();
	const target = Number(arg("--sample", 12e6));
	const P = sampleOctree(dir, target);
	console.log(`sampled ${P.n.toLocaleString()} of ${meta.points.toLocaleString()} points (levels <= ${P.meta.maxLevel})`);
	const res = classify(P);
	const g = res.grid;
	console.log(`classified ${g.occ.toLocaleString()} voxels (size ${g.v.toFixed(3)} m) in ${((Date.now() - t0) / 1000).toFixed(1)} s; deck ${res.deck ? "found" : "NOT found"}`);
	const { vol, conf } = buildVolume(res);
	const { nx, ny, nz, v, lo } = g;
	const origin = P.origin;
	const [sx, sy, sz] = meta.scale, [ox, oy, oz] = meta.offset;

	// ---- per-point assignment
	const counts = new Float64Array(256), confSum = new Float64Array(256);
	let outside = 0, filled = 0, total = 0;
	const inv = 1 / v;
	const t1 = Date.now();
	for (let ni = 0; ni < nodes.length; ni++) {
		const n = nodes[ni];
		const buf = readNode(fd, meta, n);
		const px = meta.attr.position.offset;
		for (let i = 0; i < n.numPoints; i++) {
			const b = i * S;
			const x = buf.readInt32LE(b + px) * sx + ox - origin[0], y = buf.readInt32LE(b + px + 4) * sy + oy - origin[1], z = buf.readInt32LE(b + px + 8) * sz + oz - origin[2];
			const ix = Math.floor((x - lo[0]) * inv), iy = Math.floor((y - lo[1]) * inv), iz = Math.floor((z - lo[2]) * inv);
			let code = 0, cf = 0;
			if (ix >= 0 && iy >= 0 && iz >= 0 && ix < nx && iy < ny && iz < nz) {
				const idx = (iz * ny + iy) * nx + ix;
				if (vol[idx] !== 255) { code = vol[idx]; cf = conf[idx]; }
				else {
					// voxel not occupied in the sample: take the confident majority of its neighbours
					let best = 0, bw = 0, bc = 0; const votes = new Map();
					for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
						const xx = ix + dx, yy = iy + dy, zz = iz + dz;
						if (xx < 0 || yy < 0 || zz < 0 || xx >= nx || yy >= ny || zz >= nz) continue;
						const k = (zz * ny + yy) * nx + xx;
						if (vol[k] === 255) continue;
						const w = 1 + conf[k] / 100;
						const sc = (votes.get(vol[k]) || 0) + w; votes.set(vol[k], sc);
						if (sc > bw) { bw = sc; best = vol[k]; bc = conf[k]; }
					}
					if (bw > 0) { code = best; cf = Math.round(bc * 0.8); filled++; }
				}
			} else outside++;
			buf[b + clsOff] = code;
			if (udOff >= 0) buf[b + udOff] = cf;
			counts[code]++; confSum[code] += cf; total++;
		}
		if (!dry) fs.writeSync(fd, buf, 0, buf.length, n.byteOffset);
		if (ni % 4000 === 0 && ni > 0) console.log(`  node ${ni}/${nodes.length}`);
	}
	fs.closeSync(fd);
	console.log(`assigned ${total.toLocaleString()} points in ${((Date.now() - t1) / 1000).toFixed(1)} s (${filled.toLocaleString()} via neighbour fill, ${outside.toLocaleString()} outside the analysed volume)${dry ? " [dry run: nothing written]" : ""}`);

	// ---- sidecar
	const an = anchors(res);
	const classes = CLASSES.map((c) => ({
		id: c.id, code: c.code, label: c.label, color: c.color,
		points: counts[c.code] || 0,
		confidence: counts[c.code] ? +(confSum[c.code] / counts[c.code]).toFixed(1) : null,
		detected: (counts[c.code] || 0) > 0 && c.code !== 0 ? true : c.code === 0 ? (counts[0] || 0) > 0 : false,
		anchor: an[c.code]?.anchor || null,
		bounds: an[c.code] ? { min: an[c.code].min, max: an[c.code].max } : null
	}));
	const f = res.frame;
	const sidecar = {
		version: 2,
		classificationVersion: CLASSIFICATION_VERSION,
		// cache key: the same dataset + algorithm version means the stored result is still valid
		datasetVersion: crypto.createHash("sha1").update(fs.readFileSync(path.join(dir, "metadata.json"))).update(String(meta.points)).digest("hex").slice(0, 16),
		generatedAt: new Date().toISOString(),
		algorithm: "generic-bridge-classifier/1",
		totalPoints: total,
		sampledPoints: P.n,
		origin,
		volume: { file: "classification.vol.z", dims: [nx, ny, nz], voxel: v, lo, empty: 255, byteLength: vol.length },
		structure: res.deck ? {
			detected: true,
			elevated: res.deck.elevated,
			deckRegions: res.deck.chosen.length,
			deckAreaM2: +res.deck.chosen.reduce((s, r) => s + r.areaM2, 0).toFixed(1),
			frame: { axis: f.axis, normal: f.normal, centre: f.centre, lengthM: +f.lengthM.toFixed(2), widthM: +f.widthM.toFixed(2), toleranceM: +f.tol.toFixed(3) },
			substructure: res.enclosure ? { found: res.enclosure.found, axis: res.enclosure.axis, lengthM: +res.enclosure.lengthM.toFixed(2), widthM: +res.enclosure.widthM.toFixed(2) } : null
		} : { detected: false },
		bridge: {
			type: estimateBridgeType(res, counts, total),
			quality: assessQuality(P, res, counts, confSum, total, meta)
		},
		classes
	};
	if (res.deck) {
		// deck height map (float16-ish: millimetres, int16) over the column grid, for deck-relative measurements in the viewer
		const H = new Int16Array(nx * ny);
		for (let c = 0; c < H.length; c++) { const h = f.toFp[c] <= f.zoneR ? f.H[c] : NaN; H[c] = h === h ? Math.max(-32000, Math.min(32000, Math.round(h * 1000))) : -32768; }
		sidecar.deckHeight = { file: "classification.vol.z", encoding: "int16 mm, appended after the class volume; -32768 = none", dims: [nx, ny] };
		const packed = Buffer.concat([Buffer.from(vol.buffer, vol.byteOffset, vol.byteLength), Buffer.from(H.buffer, H.byteOffset, H.byteLength)]);
		if (!dry) fs.writeFileSync(path.join(dir, "classification.vol.z"), zlib.deflateSync(packed, { level: 9 }));
	} else if (!dry) fs.writeFileSync(path.join(dir, "classification.vol.z"), zlib.deflateSync(Buffer.from(vol.buffer, vol.byteOffset, vol.byteLength), { level: 9 }));
	if (!dry) fs.writeFileSync(path.join(dir, "classification.json"), JSON.stringify(sidecar, null, 1));
	console.log(`
type: ${sidecar.bridge.type.label} (${sidecar.bridge.type.confidence}%, estimated)
quality: ${sidecar.bridge.quality.grade}${sidecar.bridge.quality.issues.length ? " - " + sidecar.bridge.quality.issues.join("; ") : ""}`);
	console.log("\nclass".padEnd(42) + "points".padStart(12) + "  share   conf");
	for (const c of classes) console.log(c.label.padEnd(41) + String(c.points).padStart(12) + `  ${(100 * c.points / total).toFixed(1).padStart(5)}%  ${c.confidence ?? "—"}`);
}

main();
