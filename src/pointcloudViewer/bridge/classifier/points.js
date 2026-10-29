/**
 * Point sources for the classifier. A "point set" is plain typed arrays so the
 * same classifier runs on a real Potree octree sample or on synthetic bridges:
 *   { n, x, y, z (Float32, relative to `origin`), r, g, b (Uint8), i (Uint8), origin:[ox,oy,oz] }
 */
const fs = require("fs");
const path = require("path");
const { loadMetadata, loadNodes, readNode, pointReader } = require("../lib/octree");

/**
 * Uniform sub-sample of an octree: take whole nodes level by level until the
 * budget is reached (coarse levels are spatially uniform subsets of the cloud).
 */
function sampleOctree(dir, targetPoints = 10_000_000) {
	const meta = loadMetadata(dir);
	const nodes = loadNodes(dir, meta);
	const perLevel = new Map();
	for (const n of nodes) perLevel.set(n.level, (perLevel.get(n.level) || 0) + n.numPoints);
	let acc = 0, maxLevel = 0;
	for (const level of [...perLevel.keys()].sort((a, b) => a - b)) {
		if (acc + perLevel.get(level) > targetPoints && acc > 0) break;
		acc += perLevel.get(level);
		maxLevel = level;
	}
	const chosen = nodes.filter((n) => n.level <= maxLevel);
	const total = chosen.reduce((s, n) => s + n.numPoints, 0);
	const origin = [meta.offset[0], meta.offset[1], 0];
	const x = new Float32Array(total), y = new Float32Array(total), z = new Float32Array(total);
	const r = new Uint8Array(total), g = new Uint8Array(total), b = new Uint8Array(total), inten = new Uint8Array(total);
	const fd = fs.openSync(path.join(dir, "octree.bin"), "r");
	let k = 0;
	for (const node of chosen) {
		const p = pointReader(meta, readNode(fd, meta, node));
		for (let i = 0; i < p.count; i++, k++) {
			x[k] = p.x(i) - origin[0]; y[k] = p.y(i) - origin[1]; z[k] = p.z(i) - origin[2];
			r[k] = p.r(i); g[k] = p.g(i); b[k] = p.b(i); inten[k] = p.intensity(i) >> 8;
		}
	}
	fs.closeSync(fd);
	return { n: total, x, y, z, r, g, b, i: inten, origin, meta: { totalPoints: meta.points, maxLevel, spacing: meta.spacing } };
}

module.exports = { sampleOctree };
