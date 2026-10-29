/**
 * 2-D helpers on the plan-view column grid (one cell per voxel column):
 * chamfer distance transform with nearest-source tracking, and oriented
 * bounding box fitting.
 */

/** Two-pass 3x3 chamfer distance (metres) to the nearest set cell; also returns the nearest source index. */
function chamferNearest(mask, nx, ny, cell, maxDist = Infinity) {
	const n = nx * ny;
	const dist = new Float32Array(n).fill(Infinity);
	const src = new Int32Array(n).fill(-1);
	for (let i = 0; i < n; i++) if (mask[i]) { dist[i] = 0; src[i] = i; }
	const d1 = cell, d2 = cell * Math.SQRT2;
	const relax = (i, j, w) => {
		const nd = dist[j] + w;
		if (nd < dist[i]) { dist[i] = nd; src[i] = src[j]; }
	};
	for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
		const i = y * nx + x;
		if (x > 0) relax(i, i - 1, d1);
		if (y > 0) {
			relax(i, i - nx, d1);
			if (x > 0) relax(i, i - nx - 1, d2);
			if (x < nx - 1) relax(i, i - nx + 1, d2);
		}
	}
	for (let y = ny - 1; y >= 0; y--) for (let x = nx - 1; x >= 0; x--) {
		const i = y * nx + x;
		if (x < nx - 1) relax(i, i + 1, d1);
		if (y < ny - 1) {
			relax(i, i + nx, d1);
			if (x < nx - 1) relax(i, i + nx + 1, d2);
			if (x > 0) relax(i, i + nx - 1, d2);
		}
	}
	if (maxDist < Infinity) for (let i = 0; i < n; i++) if (dist[i] > maxDist) { dist[i] = Infinity; src[i] = -1; }
	return { dist, src };
}

/** Morphological closing: dilate by r then erode by r (metres). Returns a Uint8 mask. */
function closing(mask, nx, ny, cell, r) {
	const n = nx * ny;
	const dil = chamferNearest(mask, nx, ny, cell).dist;
	const dilated = new Uint8Array(n);
	for (let i = 0; i < n; i++) dilated[i] = dil[i] <= r ? 1 : 0;
	const inv = new Uint8Array(n);
	for (let i = 0; i < n; i++) inv[i] = dilated[i] ? 0 : 1;
	// pad: cells beyond the grid count as background so the erosion starts at the border
	const ero = chamferNearest(inv, nx, ny, cell).dist;
	const out = new Uint8Array(n);
	for (let i = 0; i < n; i++) out[i] = dilated[i] && ero[i] > r ? 1 : 0;
	return out;
}

/**
 * Minimum-area oriented box of a set of cell centres (x[i], y[i] in cells).
 * Returns the long-axis unit vector u, its normal w, extents (cells) and fill ratio.
 */
function orientedBox(xs, ys) {
	const n = xs.length;
	let mx = 0, my = 0;
	for (let i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
	mx /= n; my /= n;
	let cxx = 0, cxy = 0, cyy = 0;
	for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; cxx += dx * dx; cxy += dx * dy; cyy += dy * dy; }
	const theta0 = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
	let best = null;
	for (let deg = -30; deg <= 30; deg += 1) {
		const th = theta0 + (deg * Math.PI) / 180;
		const ux = Math.cos(th), uy = Math.sin(th);
		let u0 = Infinity, u1 = -Infinity, w0 = Infinity, w1 = -Infinity;
		for (let i = 0; i < n; i++) {
			const dx = xs[i] - mx, dy = ys[i] - my;
			const u = dx * ux + dy * uy, w = -dx * uy + dy * ux;
			if (u < u0) u0 = u; if (u > u1) u1 = u; if (w < w0) w0 = w; if (w > w1) w1 = w;
		}
		const lu = u1 - u0 + 1, lw = w1 - w0 + 1, area = lu * lw;
		if (!best || area < best.area) best = { th, ux, uy, u0, u1, w0, w1, lu, lw, area };
	}
	// long side becomes the longitudinal axis
	let { ux, uy, lu, lw } = best;
	let uMin = best.u0, uMax = best.u1, wMin = best.w0, wMax = best.w1;
	if (lw > lu) { [ux, uy] = [-uy, ux]; [lu, lw] = [lw, lu]; [uMin, uMax, wMin, wMax] = [wMin, wMax, uMin, uMax]; }
	return { cx: mx, cy: my, ux, uy, wx: -uy, wy: ux, length: lu, width: lw, uMin, uMax, wMin, wMax, fill: n / (lu * lw), elongation: lu / lw };
}

module.exports = { chamferNearest, closing, orientedBox };
