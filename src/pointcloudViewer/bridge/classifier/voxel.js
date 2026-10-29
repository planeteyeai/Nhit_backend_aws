/**
 * Sparse voxel grid + local geometry features.
 *
 * All thresholds downstream are ratios (eigenvalue ratios, fractions of the
 * measured deck size), and the voxel size is derived from the cloud's own
 * density, so nothing here is specific to one bridge.
 */

const T = { SPARSE: 0, HORIZ: 1, VERT: 2, SLOPE: 3, LINEAR: 4, SCATTER: 5 };

function percentileOf(sorted, p) {
	return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))];
}

/** Robust AOI: ignore the far outliers (wires, birds, stray returns) that stretch real bounding boxes. */
function robustBounds(P, frac = 0.0005, step = Math.max(1, Math.floor(P.n / 400000))) {
	const m = Math.floor(P.n / step);
	const out = {};
	for (const [k, arr] of [["x", P.x], ["y", P.y], ["z", P.z]]) {
		const s = new Float32Array(m);
		for (let i = 0; i < m; i++) s[i] = arr[i * step];
		s.sort();
		out[k] = [percentileOf(s, frac), percentileOf(s, 1 - frac)];
	}
	return out;
}

/** Cyclic Jacobi eigen-decomposition of a symmetric 3x3 [xx,xy,xz,yy,yz,zz]. Returns values (desc) and vectors (rows). */
function eigen3(c, out) {
	let a00 = c[0], a01 = c[1], a02 = c[2], a11 = c[3], a12 = c[4], a22 = c[5];
	let v = [1, 0, 0, 0, 1, 0, 0, 0, 1]; // columns accumulate
	for (let sweep = 0; sweep < 6; sweep++) {
		const off = Math.abs(a01) + Math.abs(a02) + Math.abs(a12);
		if (off < 1e-18) break;
		for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
			const apq = p === 0 && q === 1 ? a01 : p === 0 && q === 2 ? a02 : a12;
			if (Math.abs(apq) < 1e-30) continue;
			const app = p === 0 ? a00 : p === 1 ? a11 : a22;
			const aqq = q === 1 ? a11 : a22;
			const theta = (aqq - app) / (2 * apq);
			const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
			const cs = 1 / Math.sqrt(t * t + 1), sn = t * cs;
			// rotate matrix
			const m = [[a00, a01, a02], [a01, a11, a12], [a02, a12, a22]];
			for (let k = 0; k < 3; k++) {
				const mkp = m[k][p], mkq = m[k][q];
				m[k][p] = cs * mkp - sn * mkq;
				m[k][q] = sn * mkp + cs * mkq;
			}
			for (let k = 0; k < 3; k++) {
				const mpk = m[p][k], mqk = m[q][k];
				m[p][k] = cs * mpk - sn * mqk;
				m[q][k] = sn * mpk + cs * mqk;
			}
			a00 = m[0][0]; a01 = m[0][1]; a02 = m[0][2]; a11 = m[1][1]; a12 = m[1][2]; a22 = m[2][2];
			for (let k = 0; k < 3; k++) {
				const vkp = v[k * 3 + p], vkq = v[k * 3 + q];
				v[k * 3 + p] = cs * vkp - sn * vkq;
				v[k * 3 + q] = sn * vkp + cs * vkq;
			}
		}
	}
	const ev = [a00, a11, a22];
	const order = [0, 1, 2].sort((i, j) => ev[j] - ev[i]);
	for (let r = 0; r < 3; r++) {
		out.val[r] = Math.max(0, ev[order[r]]);
		out.vec[r * 3] = v[order[r]];
		out.vec[r * 3 + 1] = v[3 + order[r]];
		out.vec[r * 3 + 2] = v[6 + order[r]];
	}
}

/**
 * Voxelise and compute features. Returns the grid object described below.
 * opts: { voxel?, maxCells=40e6, minMedianPoints=6 }
 */
function buildGrid(P, opts = {}) {
	const bounds = robustBounds(P);
	const margin = 1.0;
	const lo = [bounds.x[0] - margin, bounds.y[0] - margin, bounds.z[0] - margin];
	const hi = [bounds.x[1] + margin, bounds.y[1] + margin, bounds.z[1] + margin];
	const maxCells = opts.maxCells || 40e6;
	let v = opts.voxel || 0.2;
	let grid = null;
	for (let attempt = 0; attempt < 6; attempt++) {
		let nx = Math.ceil((hi[0] - lo[0]) / v), ny = Math.ceil((hi[1] - lo[1]) / v), nz = Math.ceil((hi[2] - lo[2]) / v);
		while (nx * ny * nz > maxCells) { v *= 1.15; nx = Math.ceil((hi[0] - lo[0]) / v); ny = Math.ceil((hi[1] - lo[1]) / v); nz = Math.ceil((hi[2] - lo[2]) / v); }
		grid = occupancy(P, lo, v, nx, ny, nz);
		if (opts.voxel) break;
		// density check: surfaces need enough points per voxel for stable normals
		if (grid.medianPoints >= (opts.minMedianPoints || 6) || v > 0.55) break;
		v *= 1.35;
	}
	accumulate(P, grid);
	features(grid);
	return grid;
}

function occupancy(P, lo, v, nx, ny, nz) {
	const dense = new Int32Array(nx * ny * nz).fill(-1);
	const pv = new Int32Array(P.n).fill(-1);
	let occ = 0;
	const inv = 1 / v;
	for (let i = 0; i < P.n; i++) {
		const ix = Math.floor((P.x[i] - lo[0]) * inv), iy = Math.floor((P.y[i] - lo[1]) * inv), iz = Math.floor((P.z[i] - lo[2]) * inv);
		if (ix < 0 || iy < 0 || iz < 0 || ix >= nx || iy >= ny || iz >= nz) continue;
		const idx = (iz * ny + iy) * nx + ix;
		let o = dense[idx];
		if (o < 0) { o = occ++; dense[idx] = o; }
		pv[i] = o;
	}
	const counts = new Uint32Array(occ);
	for (let i = 0; i < P.n; i++) if (pv[i] >= 0) counts[pv[i]]++;
	const sample = Uint32Array.from(counts.length > 200000 ? counts.filter((_, k) => k % Math.ceil(counts.length / 200000) === 0) : counts).sort();
	return { v, lo, nx, ny, nz, dense, pv, occ, counts, medianPoints: sample.length ? sample[sample.length >> 1] : 0 };
}

function accumulate(P, g) {
	const { occ, v, lo, nx, ny, pv } = g;
	g.ix = new Int32Array(occ); g.iy = new Int32Array(occ); g.iz = new Int32Array(occ);
	for (let idx = 0; idx < g.dense.length; idx++) {
		const o = g.dense[idx];
		if (o < 0) continue;
		const ix = idx % nx, iy = Math.floor(idx / nx) % ny, iz = Math.floor(idx / (nx * ny));
		g.ix[o] = ix; g.iy[o] = iy; g.iz[o] = iz;
	}
	const sx = new Float64Array(occ), sy = new Float64Array(occ), sz = new Float64Array(occ);
	const sxx = new Float64Array(occ), sxy = new Float64Array(occ), sxz = new Float64Array(occ);
	const syy = new Float64Array(occ), syz = new Float64Array(occ), szz = new Float64Array(occ);
	const sr = new Float64Array(occ), sg = new Float64Array(occ), sb = new Float64Array(occ), si = new Float64Array(occ);
	g.zmin = new Float32Array(occ).fill(Infinity); g.zmax = new Float32Array(occ).fill(-Infinity);
	for (let i = 0; i < P.n; i++) {
		const o = pv[i];
		if (o < 0) continue;
		// offsets from the voxel's own corner: small numbers, good precision
		const dx = P.x[i] - (lo[0] + g.ix[o] * v), dy = P.y[i] - (lo[1] + g.iy[o] * v), dz = P.z[i] - (lo[2] + g.iz[o] * v);
		sx[o] += dx; sy[o] += dy; sz[o] += dz;
		sxx[o] += dx * dx; sxy[o] += dx * dy; sxz[o] += dx * dz; syy[o] += dy * dy; syz[o] += dy * dz; szz[o] += dz * dz;
		sr[o] += P.r[i]; sg[o] += P.g[i]; sb[o] += P.b[i]; si[o] += P.i[i];
		if (P.z[i] < g.zmin[o]) g.zmin[o] = P.z[i];
		if (P.z[i] > g.zmax[o]) g.zmax[o] = P.z[i];
	}
	g.sums = { sx, sy, sz, sxx, sxy, sxz, syy, syz, szz };
	g.rgbI = { r: new Float32Array(occ), g: new Float32Array(occ), b: new Float32Array(occ), i: new Float32Array(occ) };
	for (let o = 0; o < occ; o++) {
		const n = g.counts[o];
		g.rgbI.r[o] = sr[o] / n; g.rgbI.g[o] = sg[o] / n; g.rgbI.b[o] = sb[o] / n; g.rgbI.i[o] = si[o] / n;
	}
	// mean position (absolute, relative to the point-set origin)
	g.mx = new Float32Array(occ); g.my = new Float32Array(occ); g.mz = new Float32Array(occ);
	for (let o = 0; o < occ; o++) {
		const n = g.counts[o];
		g.mx[o] = lo[0] + g.ix[o] * v + sx[o] / n; g.my[o] = lo[1] + g.iy[o] * v + sy[o] / n; g.mz[o] = lo[2] + g.iz[o] * v + sz[o] / n;
	}
}

/** 3x3x3 neighbourhood PCA per occupied voxel. */
function features(g) {
	const { occ, nx, ny, nz, v, dense, counts, ix, iy, iz } = g;
	const { sx, sy, sz, sxx, sxy, sxz, syy, syz, szz } = g.sums;
	g.nrm = new Float32Array(occ * 3);
	g.planar = new Float32Array(occ); g.linear = new Float32Array(occ); g.scatter = new Float32Array(occ);
	g.sigma = new Float32Array(occ); g.nAgg = new Uint32Array(occ); g.type = new Uint8Array(occ);
	g.tan1 = new Float32Array(occ * 3);
	const e = { val: [0, 0, 0], vec: new Array(9).fill(0) };
	const cov = [0, 0, 0, 0, 0, 0];
	for (let o = 0; o < occ; o++) {
		const cx0 = ix[o], cy0 = iy[o], cz0 = iz[o];
		let N = 0, Mx = 0, My = 0, Mz = 0;
		// pass 1: total count and mean (in coordinates relative to the centre voxel's corner)
		for (let dz = -1; dz <= 1; dz++) {
			const z1 = cz0 + dz; if (z1 < 0 || z1 >= nz) continue;
			for (let dy = -1; dy <= 1; dy++) {
				const y1 = cy0 + dy; if (y1 < 0 || y1 >= ny) continue;
				for (let dx = -1; dx <= 1; dx++) {
					const x1 = cx0 + dx; if (x1 < 0 || x1 >= nx) continue;
					const k = dense[(z1 * ny + y1) * nx + x1];
					if (k < 0) continue;
					const n = counts[k];
					N += n; Mx += sx[k] + n * dx * v; My += sy[k] + n * dy * v; Mz += sz[k] + n * dz * v;
				}
			}
		}
		g.nAgg[o] = N;
		if (N < 8) { g.type[o] = T.SPARSE; continue; }
		Mx /= N; My /= N; Mz /= N;
		cov[0] = cov[1] = cov[2] = cov[3] = cov[4] = cov[5] = 0;
		for (let dz = -1; dz <= 1; dz++) {
			const z1 = cz0 + dz; if (z1 < 0 || z1 >= nz) continue;
			for (let dy = -1; dy <= 1; dy++) {
				const y1 = cy0 + dy; if (y1 < 0 || y1 >= ny) continue;
				for (let dx = -1; dx <= 1; dx++) {
					const x1 = cx0 + dx; if (x1 < 0 || x1 >= nx) continue;
					const k = dense[(z1 * ny + y1) * nx + x1];
					if (k < 0) continue;
					const ox = dx * v, oy = dy * v, oz = dz * v;
					// sum over points of (p - M)(p - M)^T with p = voxel-corner-relative + (ox,oy,oz)
					cov[0] += sxx[k] + 2 * ox * sx[k] + counts[k] * ox * ox - 2 * Mx * (sx[k] + counts[k] * ox) + counts[k] * Mx * Mx;
					cov[1] += sxy[k] + ox * sy[k] + oy * sx[k] + counts[k] * ox * oy - Mx * (sy[k] + counts[k] * oy) - My * (sx[k] + counts[k] * ox) + counts[k] * Mx * My;
					cov[2] += sxz[k] + ox * sz[k] + oz * sx[k] + counts[k] * ox * oz - Mx * (sz[k] + counts[k] * oz) - Mz * (sx[k] + counts[k] * ox) + counts[k] * Mx * Mz;
					cov[3] += syy[k] + 2 * oy * sy[k] + counts[k] * oy * oy - 2 * My * (sy[k] + counts[k] * oy) + counts[k] * My * My;
					cov[4] += syz[k] + oy * sz[k] + oz * sy[k] + counts[k] * oy * oz - My * (sz[k] + counts[k] * oz) - Mz * (sy[k] + counts[k] * oy) + counts[k] * My * Mz;
					cov[5] += szz[k] + 2 * oz * sz[k] + counts[k] * oz * oz - 2 * Mz * (sz[k] + counts[k] * oz) + counts[k] * Mz * Mz;
				}
			}
		}
		for (let q = 0; q < 6; q++) cov[q] /= N;
		eigen3(cov, e);
		const l1 = e.val[0], l2 = e.val[1], l3 = e.val[2];
		if (l1 <= 1e-12) { g.type[o] = T.SPARSE; continue; }
		const P = (l2 - l3) / l1, L = (l1 - l2) / l1, S = l3 / l1;
		let nxv = e.vec[6], nyv = e.vec[7], nzv = e.vec[8];
		if (nzv < 0) { nxv = -nxv; nyv = -nyv; nzv = -nzv; }
		g.nrm[o * 3] = nxv; g.nrm[o * 3 + 1] = nyv; g.nrm[o * 3 + 2] = nzv;
		g.tan1[o * 3] = e.vec[0]; g.tan1[o * 3 + 1] = e.vec[1]; g.tan1[o * 3 + 2] = e.vec[2];
		g.planar[o] = P; g.linear[o] = L; g.scatter[o] = S; g.sigma[o] = Math.sqrt(l3);
		let t;
		if (L > 0.75 && S < 0.08) t = T.LINEAR;
		else if (S <= 0.075 && P >= 0.2) {
			const az = Math.abs(nzv);
			t = az >= 0.9 ? T.HORIZ : az <= 0.35 ? T.VERT : T.SLOPE;
		} else if (S <= 0.14 && P >= 0.15 && Math.abs(nzv) <= 0.3) {
			// thin walls: both faces fall in one 3x3x3 patch, so they look slightly "thick" but are still vertical sheets
			t = T.VERT;
		} else t = T.SCATTER;
		g.type[o] = t;
	}
}

module.exports = { buildGrid, robustBounds, eigen3, T };
