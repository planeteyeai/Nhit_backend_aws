/**
 * Persistent store for the viewer's Object Removal + Distress Highlighter records.
 *
 * One record set per point cloud (projectId = the viewer's pointCloudId, i.e. the same id used for
 * `pointcloud-state` / `point_cloud_data`):
 *
 *   <root>/<projectId>/inspection.json          project meta + ordered distress ids
 *   <root>/<projectId>/distress/<D-001>.json    one distress record each
 *   <root>/<projectId>/removals.json            non-destructive removal journal
 *
 * <root> is `catalog/pointcloud-inspection/` in the BMS S3 bucket when AWS is configured (durable, same
 * bucket the point-cloud state already uses), otherwise `data/pointcloud-inspection/` on local disk.
 * Override with POINTCLOUD_INSPECTION_STORE=local|s3. Source LAS / octree files are never touched.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
	GetObjectCommand,
	PutObjectCommand,
	DeleteObjectCommand,
	ListObjectsV2Command
} = require("@aws-sdk/client-s3");
const s3 = require("./s3");

const S3_ROOT = "catalog/pointcloud-inspection/";
const LOCAL_ROOT = path.join(__dirname, "..", "..", "..", "data", "pointcloud-inspection");
const MAX_POINT_SAMPLE = 250000;
const MAX_REMOVAL_POINTS_STORED = 100000;

function httpError(status, message) {
	return Object.assign(new Error(message), { status });
}

function safeId(value) {
	const safe = String(value || "").replace(/[^a-zA-Z0-9._+-]+/g, "_").slice(0, 200);
	if (!safe || /^\.+$/.test(safe)) throw httpError(400, "projectId required");
	return safe;
}

function safeDistressId(value) {
	const safe = String(value || "").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
	if (!safe || /^\.+$/.test(safe)) throw httpError(400, "distress id required");
	return safe;
}

// ---- storage backends -------------------------------------------------------------------------

function backendName() {
	const forced = String(process.env.POINTCLOUD_INSPECTION_STORE || "").trim().toLowerCase();
	if (forced === "local") return "local";
	if (forced === "s3") return "s3";
	return s3.isConfigured() ? "s3" : "local";
}

const localBackend = {
	file(key) {
		const target = path.resolve(LOCAL_ROOT, key);
		if (target !== LOCAL_ROOT && !target.startsWith(LOCAL_ROOT + path.sep)) throw httpError(400, "Invalid key");
		return target;
	},
	async read(key) {
		try {
			return JSON.parse(await fs.promises.readFile(this.file(key), "utf8"));
		} catch (err) {
			if (err.code === "ENOENT") return null;
			throw err;
		}
	},
	async write(key, data) {
		const f = this.file(key);
		await fs.promises.mkdir(path.dirname(f), { recursive: true });
		await fs.promises.writeFile(f, JSON.stringify(data), "utf8");
	},
	async remove(key) {
		await fs.promises.rm(this.file(key), { force: true });
	},
	async listProjectIds() {
		try {
			const entries = await fs.promises.readdir(LOCAL_ROOT, { withFileTypes: true });
			return entries.filter((e) => e.isDirectory()).map((e) => e.name);
		} catch (err) {
			if (err.code === "ENOENT") return [];
			throw err;
		}
	}
};

const s3Backend = {
	key(key) {
		return `${S3_ROOT}${key}`;
	},
	async read(key) {
		const { client, bucket } = s3.getClient();
		try {
			const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: this.key(key) }));
			const chunks = [];
			for await (const chunk of out.Body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
			return JSON.parse(Buffer.concat(chunks).toString("utf8"));
		} catch (err) {
			if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) return null;
			throw err;
		}
	},
	async write(key, data) {
		const { client, bucket } = s3.getClient();
		await client.send(new PutObjectCommand({
			Bucket: bucket,
			Key: this.key(key),
			Body: JSON.stringify(data),
			ContentType: "application/json"
		}));
	},
	async remove(key) {
		const { client, bucket } = s3.getClient();
		await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: this.key(key) }));
	},
	async listProjectIds() {
		const { client, bucket } = s3.getClient();
		const ids = [];
		let token;
		do {
			const out = await client.send(new ListObjectsV2Command({
				Bucket: bucket,
				Prefix: S3_ROOT,
				Delimiter: "/",
				ContinuationToken: token
			}));
			for (const p of out.CommonPrefixes || []) {
				const id = String(p.Prefix || "").slice(S3_ROOT.length).replace(/\/$/, "");
				if (id) ids.push(id);
			}
			token = out.IsTruncated ? out.NextContinuationToken : undefined;
		} while (token);
		return ids;
	}
};

function store() {
	return backendName() === "s3" ? s3Backend : localBackend;
}

// Serialise read-modify-write per project inside this process (inspection.json lists the distress ids).
const locks = new Map();
function withLock(projectId, fn) {
	const prev = locks.get(projectId) || Promise.resolve();
	const run = prev.catch(() => {}).then(fn);
	const tail = run.catch(() => {});
	locks.set(projectId, tail);
	tail.then(() => { if (locks.get(projectId) === tail) locks.delete(projectId); });
	return run;
}

const inspectionKey = (id) => `${id}/inspection.json`;
const distressKey = (id, did) => `${id}/distress/${did}.json`;
const removalsKey = (id) => `${id}/removals.json`;

// ---- operations --------------------------------------------------------------------------------

async function listProjects() {
	const st = store();
	const ids = await st.listProjectIds();
	const rows = await Promise.all(ids.map(async (id) => {
		const insp = (await st.read(inspectionKey(id)).catch(() => null)) || {};
		return {
			id,
			title: insp.title || id,
			sourceLas: insp.sourceLas || null,
			sourcePointCount: insp.sourcePointCount || null,
			distressCount: Array.isArray(insp.distressIds) ? insp.distressIds.length : 0,
			updatedAt: insp.updatedAt || null
		};
	}));
	return rows.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

async function getProject(projectId) {
	const id = safeId(projectId);
	const st = store();
	const insp = await st.read(inspectionKey(id));
	if (!insp) throw httpError(404, "Inspection project not found");
	const distress = [];
	for (const did of insp.distressIds || []) {
		const rec = await st.read(distressKey(id, safeDistressId(did)));
		if (rec) distress.push(rec);
	}
	return { ...insp, distress };
}

function createOrUpdateProject(body, user) {
	const { projectId, title, sourceLas, sourcePointCount, metadataUrl, localOrigin, cloudName } = body || {};
	const id = safeId(projectId || path.basename(String(sourceLas || "project"), path.extname(String(sourceLas || ""))));
	return withLock(id, async () => {
		const st = store();
		const existing = await st.read(inspectionKey(id));
		const now = new Date().toISOString();
		const insp = {
			id,
			title: title || existing?.title || id,
			sourceLas: sourceLas || existing?.sourceLas || null,
			sourceFileId: existing?.sourceFileId || crypto.createHash("sha1").update(String(sourceLas || id)).digest("hex").slice(0, 16),
			sourcePointCount: sourcePointCount ?? existing?.sourcePointCount ?? null,
			metadataUrl: metadataUrl || existing?.metadataUrl || null,
			localOrigin: localOrigin || existing?.localOrigin || [0, 0, 0],
			cloudName: cloudName || existing?.cloudName || id,
			distressIds: existing?.distressIds || [],
			createdAt: existing?.createdAt || now,
			createdBy: existing?.createdBy || user || null,
			updatedAt: now,
			updatedBy: user || existing?.updatedBy || null,
			version: 1
		};
		await st.write(inspectionKey(id), insp);
		return insp;
	});
}

function saveDistress(projectId, distress, user) {
	const id = safeId(projectId);
	return withLock(id, async () => {
		const st = store();
		const insp = await st.read(inspectionKey(id));
		if (!insp) throw httpError(404, "Create the inspection project first");
		insp.distressIds = Array.isArray(insp.distressIds) ? insp.distressIds : [];
		let did = distress?.id ? safeDistressId(distress.id) : null;
		if (!did) {
			let max = 0;
			for (const existingId of insp.distressIds) {
				const m = /^D-(\d+)$/i.exec(existingId);
				if (m) max = Math.max(max, Number(m[1]));
			}
			did = `D-${String(max + 1).padStart(3, "0")}`;
		}
		const now = new Date().toISOString();
		const existing = await st.read(distressKey(id, did));
		const record = {
			...existing,
			...distress,
			id: did,
			projectId: id,
			createdAt: existing?.createdAt || now,
			updatedAt: now,
			updatedBy: user || null
		};
		// Cap stored samples so records stay small; the spatial selection is the source of truth.
		if (Array.isArray(record.pointSample) && record.pointSample.length > MAX_POINT_SAMPLE) {
			record.pointSample = record.pointSample.slice(0, MAX_POINT_SAMPLE);
			record.pointSampleTruncated = true;
		}
		await st.write(distressKey(id, did), record);
		if (!insp.distressIds.includes(did)) insp.distressIds.push(did);
		insp.updatedAt = now;
		await st.write(inspectionKey(id), insp);
		return record;
	});
}

function deleteDistress(projectId, distressId) {
	const id = safeId(projectId);
	const did = safeDistressId(distressId);
	return withLock(id, async () => {
		const st = store();
		const insp = await st.read(inspectionKey(id));
		if (!insp) throw httpError(404, "Project not found");
		insp.distressIds = (insp.distressIds || []).filter((x) => x !== did);
		insp.updatedAt = new Date().toISOString();
		await st.write(inspectionKey(id), insp);
		await st.remove(distressKey(id, did));
		return { ok: true };
	});
}

async function getRemovals(projectId) {
	const id = safeId(projectId);
	return (await store().read(removalsKey(id))) || { version: 1, ops: [] };
}

function saveRemovals(projectId, removals, cloudName, user) {
	const id = safeId(projectId);
	return withLock(id, async () => {
		const st = store();
		let insp = await st.read(inspectionKey(id));
		const now = new Date().toISOString();
		if (!insp) {
			insp = {
				id,
				title: id,
				sourceLas: null,
				sourceFileId: crypto.createHash("sha1").update(id).digest("hex").slice(0, 16),
				sourcePointCount: null,
				metadataUrl: null,
				localOrigin: [0, 0, 0],
				cloudName: cloudName || id,
				distressIds: [],
				createdAt: now,
				createdBy: user || null,
				version: 1
			};
		}
		const payload = {
			version: 1,
			cloudName: cloudName || null,
			updatedAt: now,
			updatedBy: user || null,
			ops: Array.isArray(removals?.ops) ? removals.ops : [],
			history: Array.isArray(removals?.history) ? removals.history : []
		};
		// Cap points per op for file size; keep a stride sample + keys for re-matching.
		for (const op of payload.ops) {
			if (Array.isArray(op.points) && op.points.length > MAX_REMOVAL_POINTS_STORED + 20000) {
				const step = Math.ceil(op.points.length / MAX_REMOVAL_POINTS_STORED);
				op.points = op.points.filter((_, i) => i % step === 0).slice(0, MAX_REMOVAL_POINTS_STORED);
				op.pointsTruncated = true;
			}
		}
		await st.write(removalsKey(id), payload);
		insp.updatedAt = now;
		await st.write(inspectionKey(id), insp);
		return payload;
	});
}

async function exportCsv(projectId) {
	const project = await getProject(projectId);
	const rows = [
		["Distress ID", "Type", "Component", "Severity", "X", "Y", "Z", "Length", "Width", "Height", "Area", "PointCount", "Confidence", "Remarks"]
	];
	for (const d of project.distress || []) {
		const c = d.center || {};
		const m = d.measurements || {};
		rows.push([
			d.id, d.type || "", d.component || "", d.severity || "",
			c.x ?? "", c.y ?? "", c.z ?? "",
			m.length ?? "", m.width ?? "", m.height ?? "", m.area ?? "",
			d.pointCount ?? "", d.confidence || "",
			(d.description || "").replace(/[\r\n,]+/g, " ")
		]);
	}
	return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
}

module.exports = {
	backendName,
	listProjects,
	getProject,
	createOrUpdateProject,
	saveDistress,
	deleteDistress,
	getRemovals,
	saveRemovals,
	exportCsv
};
