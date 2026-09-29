const fs = require("fs");
const path = require("path");
const s3 = require("./s3");
const localConvert = require("./localConvert");

const ITEM_STEPS = [
	{ id: "downloading", label: "Download" },
	{ id: "converting", label: "Convert" },
	{ id: "uploading", label: "Upload S3" },
	{ id: "finalizing", label: "Finalize" }
];

function stripQuotes(value) {
	if (!value) return "";
	return String(value).trim().replace(/^["']|["']$/g, "");
}

function getDefaultPrefix() {
	return s3.getSourceLasPrefix();
}

async function cleanupPartialOutput(outputPrefix) {
	if (!outputPrefix) return;
	try {
		const result = await s3.deleteObjectsUnderPrefix(outputPrefix);
		if (result.deleted) {
			console.log(`[bulk] cleaned ${result.deleted} object(s) under ${outputPrefix}`);
		}
	} catch (err) {
		console.warn(`[bulk] cleanup failed for ${outputPrefix}:`, err.message);
	}
}

function isAbortRequested(batch) {
	return Boolean(batch?._abortCurrentRequested || batch?._abortOverallRequested);
}

function buildItemSteps(item) {
	const phase = item.phase || "downloading";
	const phaseIdx = ITEM_STEPS.findIndex((s) => s.id === phase);
	const terminal = item.status === "done" || item.status === "failed" || item.status === "aborted";

	return ITEM_STEPS.map((step, idx) => {
		let status = "pending";
		if (item.status === "done") {
			status = "done";
		} else if (terminal && idx < phaseIdx) {
			status = "done";
		} else if (terminal && idx === phaseIdx) {
			status = item.status === "aborted" ? "aborted" : item.status === "failed" ? "failed" : "done";
		} else if (item.status === "processing") {
			if (idx < phaseIdx) status = "done";
			else if (idx === phaseIdx) status = "active";
		}
		return { id: step.id, label: step.label, status };
	});
}

/** @type {object|null} */
let batch = null;

function publicBatch() {
	if (!batch) return null;

	const now = Date.now();
	const currentItem = batch.items.find((i) => i.status === "processing");
	const currentPercent = currentItem?.percent || 0;
	const finished = batch.done + batch.failed + batch.aborted;
	const remaining = Math.max(0, batch.total - finished - (currentItem ? 1 : 0));
	const overall = batch.total
		? Math.round(((finished + currentPercent / 100) / batch.total) * 100)
		: 0;

	const batchElapsedSeconds = Math.max(0, (now - batch.createdAt) / 1000);
	let batchEtaSeconds = null;
	const completedCount = batch.done + batch.failed + batch.aborted;
	if (completedCount > 0 && batch.status === "running") {
		const avgPerItem = batchElapsedSeconds / completedCount;
		const leftItems = remaining + (currentItem ? (1 - currentPercent / 100) : 0);
		batchEtaSeconds = avgPerItem * leftItems;
	} else if (batch.status !== "running") {
		batchEtaSeconds = 0;
	}

	const currentElapsedSeconds = currentItem?.startedAt
		? Math.max(0, (now - currentItem.startedAt) / 1000)
		: null;

	return {
		id: batch.id,
		status: batch.status,
		prefix: batch.prefix,
		total: batch.total,
		done: batch.done,
		failed: batch.failed,
		aborted: batch.aborted,
		remaining,
		currentKey: batch.currentKey,
		currentJobId: batch.currentJobId,
		currentName: currentItem?.name || null,
		currentPercent,
		currentDownloadPercent: currentItem?.downloadPercent ?? null,
		currentPhase: currentItem?.phase || null,
		currentMessage: currentItem?.message || null,
		currentSteps: currentItem ? buildItemSteps(currentItem) : [],
		speedBps: currentItem?.speedBps || 0,
		etaSeconds: currentItem?.etaSeconds ?? null,
		elapsedSeconds: currentElapsedSeconds,
		batchElapsedSeconds,
		batchEtaSeconds,
		overallPercent: Math.min(100, overall),
		canAbortCurrent: batch.status === "running" && Boolean(currentItem),
		canAbortOverall: batch.status === "running",
		items: batch.items.map((i) => ({
			key: i.key,
			name: i.name,
			size: i.size,
			status: i.status,
			phase: i.phase || null,
			percent: i.percent || 0,
			message: i.message || null,
			viewerUrl: i.viewerUrl || null,
			error: i.error || null
		})),
		createdAt: batch.createdAt,
		updatedAt: batch.updatedAt
	};
}

function emitBatch() {
	if (!batch) return;
	batch.updatedAt = Date.now();
	const payload = publicBatch();
	for (const listener of batch._listeners) {
		try {
			listener(payload);
		} catch {
			/* ignore */
		}
	}
}

function subscribe(listener) {
	if (!batch) {
		listener(null);
		return () => {};
	}
	batch._listeners.add(listener);
	listener(publicBatch());
	return () => batch?._listeners.delete(listener);
}

function getBatch() {
	return batch;
}

async function listLas(prefix) {
	return s3.listLasObjects(prefix || getDefaultPrefix());
}

function markPendingAborted() {
	if (!batch) return;
	for (const item of batch.items) {
		if (item.status === "pending") {
			item.status = "aborted";
			item.message = "Batch aborted";
			batch.aborted += 1;
		}
	}
}

function abortCurrent() {
	if (!batch || batch.status !== "running") {
		const err = new Error("No batch is running");
		err.status = 409;
		throw err;
	}
	const current = batch.items.find((i) => i.status === "processing");
	if (!current) {
		const err = new Error("No item is currently processing");
		err.status = 409;
		throw err;
	}
	batch._abortCurrentRequested = true;
	if (batch.currentJobId) {
		localConvert.abortJob(batch.currentJobId);
	}
	emitBatch();
	return publicBatch();
}

function abortOverall() {
	if (!batch || batch.status !== "running") {
		const err = new Error("No batch is running");
		err.status = 409;
		throw err;
	}
	batch._abortOverallRequested = true;
	batch._abortCurrentRequested = true;
	if (batch.currentJobId) {
		localConvert.abortJob(batch.currentJobId);
	}
	emitBatch();
	return publicBatch();
}

function startPublish({ keys, prefix }) {
	if (batch && batch.status === "running") {
		const err = new Error("A bulk job is already running");
		err.status = 409;
		throw err;
	}
	if (!Array.isArray(keys) || !keys.length) {
		const err = new Error("keys[] is required");
		err.status = 400;
		throw err;
	}
	const valid = keys.filter((k) => /\.(las|laz)$/i.test(String(k || "")));
	if (!valid.length) {
		const err = new Error("No valid .las or .laz keys");
		err.status = 400;
		throw err;
	}

	batch = {
		id: String(Date.now()),
		status: "running",
		prefix: prefix || getDefaultPrefix(),
		total: valid.length,
		done: 0,
		failed: 0,
		aborted: 0,
		currentKey: null,
		currentJobId: null,
		items: valid.map((key) => ({
			key,
			name: path.basename(key).replace(/\.(las|laz)$/i, ""),
			size: 0,
			status: "pending",
			phase: null,
			percent: 0,
			message: null,
			viewerUrl: null,
			error: null,
			startedAt: null,
			speedBps: 0,
			etaSeconds: null
		})),
		_listeners: new Set(),
		_processing: false,
		_abortCurrentRequested: false,
		_abortOverallRequested: false,
		createdAt: Date.now(),
		updatedAt: Date.now()
	};
	emitBatch();
	setImmediate(() => runBatch());
	return publicBatch();
}

async function runBatch() {
	if (!batch || batch._processing) return;
	batch._processing = true;

	try {
		for (const item of batch.items) {
		if (batch._abortOverallRequested) break;
		if (item.status !== "pending") continue;

		batch.currentKey = item.key;
		batch._abortCurrentRequested = false;
		item.status = "processing";
		item.phase = "downloading";
		item.message = "Downloading from S3...";
		item.percent = 0;
		item.startedAt = Date.now();
		emitBatch();

		const basename = path.basename(item.key);
		const name = item.name;
		const id = s3.slugify(name);
		const outputPrefix = s3.potreePrefixForId(id);
		item.outputPrefix = outputPrefix;
		batch.currentJobId = id;

		try {
			localConvert.createJob({ id, name });
			const job = localConvert.getJob(id);
			const inDir = path.join(localConvert.TMP_ROOT, id, "in");
			fs.mkdirSync(inDir, { recursive: true });
			const inputPath = path.join(inDir, basename);

			job.phase = "receiving";
			job.percent = 2;
			job.message = `Downloading ${basename}...`;
			localConvert.notify(job);

			await s3.downloadObjectToFile(item.key, inputPath, {
				shouldAbort: () => isAbortRequested(batch),
				onProgress: ({ loaded, total }) => {
					const t = total || item.size || 1;
					if (total) item.size = total;
					item.phase = "downloading";
					item.downloadPercent = Math.round((loaded / t) * 100);
					item.percent = Math.min(15, Math.round((loaded / t) * 15));
					const elapsed = item.startedAt ? (Date.now() - item.startedAt) / 1000 : 0;
					if (elapsed > 0.4 && loaded > 0) {
						item.speedBps = loaded / elapsed;
						if (total > loaded && item.speedBps > 0) {
							item.etaSeconds = (total - loaded) / item.speedBps;
						}
					}
					item.message = total
						? `Downloading ${basename} (${item.downloadPercent}%)`
						: `Downloading ${basename}...`;
					emitBatch();
				}
			});

			if (isAbortRequested(batch)) {
				throw Object.assign(new Error("Aborted by user"), { code: "ABORTED" });
			}

			const unsub = localConvert.subscribe(id, (payload) => {
				item.phase = payload.phase === "receiving" ? "downloading" : payload.phase;
				item.percent = payload.percent || 0;
				item.message = payload.message;
				item.speedBps = payload.speedBps || 0;
				item.etaSeconds = payload.etaSeconds ?? null;
				emitBatch();
			});

			await localConvert.processLocalJob({
				id,
				name,
				inputPath,
				sourceKey: item.key,
				shouldAbort: () => isAbortRequested(batch)
			});
			unsub();

			const finished = localConvert.getJob(id);
			if (isAbortRequested(batch)) {
				item.status = "aborted";
				item.phase = finished?.phase === "aborted" ? finished.phase : item.phase;
				item.error = "Aborted by user";
				item.message = "Aborted";
				item.percent = finished?.percent || item.percent;
				batch.aborted += 1;
				await cleanupPartialOutput(outputPrefix);
			} else if (finished?.phase === "done") {
				item.status = "done";
				item.phase = "finalizing";
				item.percent = 100;
				item.viewerUrl = finished.viewerUrl;
				item.message = "Published";
				batch.done += 1;
			} else if (finished?.phase === "aborted") {
				item.status = "aborted";
				item.error = finished.error || "Aborted by user";
				item.message = item.error;
				batch.aborted += 1;
				await cleanupPartialOutput(outputPrefix);
			} else {
				item.status = "failed";
				item.error = finished?.error || "Conversion failed";
				item.message = item.error;
				batch.failed += 1;
			}
		} catch (err) {
			if (localConvert.isAbortError(err) || isAbortRequested(batch)) {
				console.log(`[bulk] aborted ${item.key}`);
				item.status = "aborted";
				item.error = "Aborted by user";
				item.message = "Aborted";
				batch.aborted += 1;
				if (batch.currentJobId) localConvert.abortJob(batch.currentJobId);
				await cleanupPartialOutput(outputPrefix);
			} else {
				console.error(`[bulk] failed ${item.key}:`, err);
				item.status = "failed";
				item.error = err.message || String(err);
				item.message = item.error;
				batch.failed += 1;
			}
		}

		batch.currentKey = null;
		batch.currentJobId = null;
		batch._abortCurrentRequested = false;
		emitBatch();

		if (batch._abortOverallRequested) break;
	}

		if (batch._abortOverallRequested) {
			markPendingAborted();
			batch.status = "aborted";
		} else {
			batch.status = "done";
		}
	} catch (err) {
		console.error("[bulk] runBatch fatal:", err);
		if (batch) batch.status = "failed";
	} finally {
		if (batch) {
			batch._processing = false;
			batch.currentKey = null;
			batch.currentJobId = null;
			emitBatch();
		}
	}
}

module.exports = {
	getDefaultPrefix,
	listLas,
	startPublish,
	abortCurrent,
	abortOverall,
	getBatch,
	publicBatch,
	subscribe
};
