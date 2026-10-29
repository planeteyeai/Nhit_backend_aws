/**
 * Horizontal surface regions: connected sets of horizontal-planar voxels
 * (26-neighbourhood). A road deck, a bridge floor, a parking lot and a lawn all
 * show up as regions; later stages decide which of them is the bridge deck from
 * measured shape/smoothness, not from fixed coordinates.
 */
const { T } = require("./voxel");

class UnionFind {
	constructor(n) { this.p = new Int32Array(n); for (let i = 0; i < n; i++) this.p[i] = i; }
	find(a) { while (this.p[a] !== a) { this.p[a] = this.p[this.p[a]]; a = this.p[a]; } return a; }
	union(a, b) { a = this.find(a); b = this.find(b); if (a !== b) this.p[Math.max(a, b)] = Math.min(a, b); }
}

/**
 * @returns {{ label: Int32Array, regions: object[] }} label[o] = region index or -1 (per occupied voxel)
 */
function horizontalRegions(g, { typeSet = [T.HORIZ], dzSteps = 1 } = {}) {
	const { occ, nx, ny, nz, dense, ix, iy, iz, type, v } = g;
	const ok = new Uint8Array(occ);
	for (let o = 0; o < occ; o++) ok[o] = typeSet.includes(type[o]) ? 1 : 0;
	const uf = new UnionFind(occ);
	for (let o = 0; o < occ; o++) {
		if (!ok[o]) continue;
		const x0 = ix[o], y0 = iy[o], z0 = iz[o];
		// only look "forward" so each pair is visited once
		for (let dz = -dzSteps; dz <= dzSteps; dz++) {
			const z1 = z0 + dz; if (z1 < 0 || z1 >= nz) continue;
			for (let dy = -1; dy <= 1; dy++) {
				const y1 = y0 + dy; if (y1 < 0 || y1 >= ny) continue;
				for (let dx = -1; dx <= 1; dx++) {
					if (!dx && !dy && !dz) continue;
					const x1 = x0 + dx; if (x1 < 0 || x1 >= nx) continue;
					const k = dense[(z1 * ny + y1) * nx + x1];
					if (k > o && ok[k]) uf.union(o, k);
				}
			}
		}
	}
	const label = new Int32Array(occ).fill(-1);
	const map = new Map();
	const regions = [];
	for (let o = 0; o < occ; o++) {
		if (!ok[o]) continue;
		const root = uf.find(o);
		let id = map.get(root);
		if (id === undefined) {
			id = regions.length; map.set(root, id);
			regions.push({ id, voxels: 0, cols: new Set(), sumZ: 0, minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity, sigmaSum: 0, planarSum: 0 });
		}
		label[o] = id;
		const r = regions[id];
		r.voxels++; r.cols.add(iy[o] * nx + ix[o]);
		r.sumZ += g.mz[o]; r.sigmaSum += g.sigma[o]; r.planarSum += g.planar[o];
		if (ix[o] < r.minX) r.minX = ix[o]; if (ix[o] > r.maxX) r.maxX = ix[o];
		if (iy[o] < r.minY) r.minY = iy[o]; if (iy[o] > r.maxY) r.maxY = iy[o];
		if (g.mz[o] < r.minZ) r.minZ = g.mz[o]; if (g.mz[o] > r.maxZ) r.maxZ = g.mz[o];
	}
	for (const r of regions) {
		r.areaM2 = r.cols.size * v * v;
		r.meanZ = r.sumZ / r.voxels;
		r.meanSigma = r.sigmaSum / r.voxels;
		r.meanPlanar = r.planarSum / r.voxels;
		r.zSpread = r.maxZ - r.minZ;
	}
	return { label, regions };
}

module.exports = { horizontalRegions, UnionFind };
