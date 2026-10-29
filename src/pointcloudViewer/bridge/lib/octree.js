/**
 * Minimal Potree 2.0 octree reader/writer (encoding "DEFAULT", i.e. uncompressed).
 * Used offline to (a) read points for analysis and (b) write the per-point
 * `classification` byte in place, so the viewer can filter by class on the GPU.
 *
 * Layout: metadata.json describes the attributes (interleaved per point);
 * hierarchy.bin lists nodes (22 bytes each: type, childMask, numPoints, byteOffset, byteSize);
 * octree.bin holds the node payloads. Positions are int32 * scale + offset.
 */
const fs = require("fs");
const path = require("path");

function loadMetadata(dir) {
	const m = JSON.parse(fs.readFileSync(path.join(dir, "metadata.json"), "utf8"));
	if (m.encoding && m.encoding !== "DEFAULT") {
		throw new Error(`unsupported octree encoding "${m.encoding}" (only DEFAULT/uncompressed is supported)`);
	}
	let stride = 0;
	const attr = {};
	for (const a of m.attributes) {
		attr[a.name] = { offset: stride, size: a.size, type: a.type };
		stride += a.size;
	}
	for (const need of ["position", "classification"]) {
		if (!attr[need]) throw new Error(`octree has no "${need}" attribute`);
	}
	return { ...m, stride, attr };
}

/** Parse hierarchy.bin into a flat list of nodes with byte ranges in octree.bin. */
function loadNodes(dir, meta) {
	const buf = fs.readFileSync(path.join(dir, "hierarchy.bin"));
	const nodes = [];
	function parseChunk(offset, size, rootName, rootLevel) {
		const view = new DataView(buf.buffer, buf.byteOffset + offset, size);
		const count = size / 22;
		const list = [{ name: rootName, level: rootLevel }];
		for (let i = 0; i < count; i++) {
			const cur = list[i];
			const type = view.getUint8(i * 22);
			const mask = view.getUint8(i * 22 + 1);
			const numPoints = view.getUint32(i * 22 + 2, true);
			const byteOffset = Number(view.getBigInt64(i * 22 + 6, true));
			const byteSize = Number(view.getBigInt64(i * 22 + 14, true));
			if (type === 2) {
				// proxy: the subtree lives in another chunk of hierarchy.bin
				parseChunk(byteOffset, byteSize, cur.name, cur.level);
				continue;
			}
			cur.numPoints = byteSize === 0 ? 0 : numPoints;
			cur.byteOffset = byteOffset;
			cur.byteSize = byteSize;
			nodes.push(cur);
			for (let c = 0; c < 8; c++) {
				if (!(mask & (1 << c))) continue;
				list.push({ name: cur.name + c, level: cur.level + 1 });
			}
		}
	}
	parseChunk(0, meta.hierarchy.firstChunkSize, "r", 0);
	return nodes.filter((n) => n.numPoints > 0);
}

/**
 * Iterate nodes of a given max level (or all), calling fn(node, buffer, count).
 * `buffer` is the node's raw bytes (numPoints * stride).
 */
function readNode(fd, meta, node) {
	const buf = Buffer.allocUnsafe(node.byteSize);
	let got = 0;
	while (got < node.byteSize) {
		const n = fs.readSync(fd, buf, got, node.byteSize - got, node.byteOffset + got);
		if (n <= 0) throw new Error("short read in octree.bin");
		got += n;
	}
	return buf;
}

function pointReader(meta, buf) {
	const S = meta.stride;
	const pos = meta.attr.position.offset;
	const rgb = meta.attr.rgb ? meta.attr.rgb.offset : -1;
	const inten = meta.attr.intensity ? meta.attr.intensity.offset : -1;
	const cls = meta.attr.classification.offset;
	const [sx, sy, sz] = meta.scale;
	const [ox, oy, oz] = meta.offset;
	return {
		count: buf.length / S,
		x: (i) => buf.readInt32LE(i * S + pos) * sx + ox,
		y: (i) => buf.readInt32LE(i * S + pos + 4) * sy + oy,
		z: (i) => buf.readInt32LE(i * S + pos + 8) * sz + oz,
		r: (i) => (rgb < 0 ? 0 : buf.readUInt16LE(i * S + rgb) >> 8),
		g: (i) => (rgb < 0 ? 0 : buf.readUInt16LE(i * S + rgb + 2) >> 8),
		b: (i) => (rgb < 0 ? 0 : buf.readUInt16LE(i * S + rgb + 4) >> 8),
		intensity: (i) => (inten < 0 ? 0 : buf.readUInt16LE(i * S + inten)),
		cls: (i) => buf[i * S + cls],
		setCls: (i, v) => { buf[i * S + cls] = v; }
	};
}

module.exports = { loadMetadata, loadNodes, readNode, pointReader };
