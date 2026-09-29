const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const s3 = require("./s3");

const PACKAGE_ROOT = path.join(__dirname, "..", "..", "..");
const ROOT = PACKAGE_ROOT;
const TMP_ROOT = path.join(ROOT, "tmp", "convert");
const DEFAULT_CONVERTER = path.join(PACKAGE_ROOT, "tools", "PotreeConverter", "PotreeConverter.exe");

/** @type {Map<string, object>} */
const jobs = new Map();

function stripQuotes(value) {
	if (!value) return "";
	return String(value).trim().replace(/^["']|["']$/g, "");
}

function getConverterPath() {
	const configured = stripQuotes(process.env.POTREE_CONVERTER_PATH);
	const p = configured
		? (path.isAbsolute(configured) ? configured : path.join(ROOT, configured))
		: DEFAULT_CONVERTER;
	return p;
}

function converterStatus() {
	const converterPath = getConverterPath();
	return {
		ok: fs.existsSync(converterPath),
		path: converterPath
	};
}

function mapPhasePercent(phase, phaseRatio) {
	const r = Math.max(0, Math.min(1, phaseRatio || 0));
	if (phase === "receiving") return Math.round(r * 15);
	if (phase === "converting") return 15 + Math.round(r * 40);
	if (phase === "uploading") return 55 + Math.round(r * 40);
	if (phase === "finalizing") return 95 + Math.round(r * 4);
	if (phase === "done") return 100;
	if (phase === "failed") return Math.round(r * 100);
	return 0;
}

function createJob({ id, name }) {
	const job = {
		id,
		name,
		phase: "receiving",
		percent: 0,
		message: "Receiving file...",
		uploadedBytes: 0,
		totalBytes: 0,
		speedBps: 0,
		etaSeconds: null,
		viewerUrl: null,
		s3: null,
		error: null,
		createdAt: Date.now(),
		updatedAt: Date.now(),
		_listeners: new Set(),
		_startedAt: Date.now(),
		_lastSampleAt: Date.now(),
		_lastSampleBytes: 0
	};
	jobs.set(id, job);
	return job;
}

function getJob(id) {
	return jobs.get(id) || null;
}

function publicJob(job) {
	if (!job) return null;
	return {
		id: job.id,
		name: job.name,
		phase: job.phase,
		percent: job.percent,
		message: job.message,
		uploadedBytes: job.uploadedBytes,
		totalBytes: job.totalBytes,
		speedBps: job.speedBps,
		etaSeconds: job.etaSeconds,
		viewerUrl: job.viewerUrl,
		s3: job.s3,
		error: job.error,
		createdAt: job.createdAt,
		updatedAt: job.updatedAt
	};
}

function updateSpeed(job) {
	const now = Date.now();
	const sampleMs = now - job._lastSampleAt;
	if (sampleMs >= 400) {
		const delta = Math.max(0, (job.uploadedBytes || 0) - (job._lastSampleBytes || 0));
		const instant = (delta / sampleMs) * 1000;
		job.speedBps = job.speedBps ? job.speedBps * 0.6 + instant * 0.4 : instant;
		job._lastSampleAt = now;
		job._lastSampleBytes = job.uploadedBytes || 0;
	}
	const remaining = Math.max(0, (job.totalBytes || 0) - (job.uploadedBytes || 0));
	if (job.speedBps > 1024 && remaining > 0 && job.percent < 100) {
		job.etaSeconds = remaining / job.speedBps;
	} else if (job.percent >= 100 || remaining <= 0) {
		job.etaSeconds = 0;
	} else {
		job.etaSeconds = null;
	}
}

function emit(job) {
	job.updatedAt = Date.now();
	updateSpeed(job);
	const payload = publicJob(job);
	for (const listener of job._listeners) {
		try {
			listener(payload);
		} catch {
			/* ignore */
		}
	}
}

function notify(job) {
	emit(job);
}

function subscribe(id, listener) {
	const job = jobs.get(id);
	if (!job) return () => {};
	job._listeners.add(listener);
	listener(publicJob(job));
	return () => job._listeners.delete(listener);
}

function setJobProgress(job, patch) {
	Object.assign(job, patch);
	if (patch.phase != null && patch.phaseRatio != null) {
		job.percent = mapPhasePercent(patch.phase, patch.phaseRatio);
	} else if (patch.percent != null) {
		job.percent = patch.percent;
	}
	emit(job);
}

function rmDirSafe(dir) {
	try {
		fs.rmSync(dir, { recursive: true, force: true });
	} catch {
		/* ignore */
	}
}

function findOutputDir(outDir) {
	const required = ["metadata.json", "octree.bin", "hierarchy.bin"];
	const hasAll = (dir) => required.every((f) => fs.existsSync(path.join(dir, f)));
	if (hasAll(outDir)) return outDir;
	const kids = fs.readdirSync(outDir, { withFileTypes: true }).filter((d) => d.isDirectory());
	for (const kid of kids) {
		const nested = path.join(outDir, kid.name);
		if (hasAll(nested)) return nested;
	}
	throw new Error(`Conversion output missing required files under ${outDir}`);
}

function isAbortError(err) {
	return err && (err.code === "ABORTED" || /aborted/i.test(String(err.message || "")));
}

function checkAbort(job, shouldAbort) {
	if (job?._aborted || (shouldAbort && shouldAbort())) {
		const err = new Error("Aborted by user");
		err.code = "ABORTED";
		throw err;
	}
}

function runConverter(converterPath, inputFile, outDir, onTick, job) {
	return new Promise((resolve, reject) => {
		const args = [inputFile, "-o", outDir];
		console.log(`[local-convert] ${converterPath} ${args.join(" ")}`);
		const child = spawn(converterPath, args, {
			windowsHide: true,
			stdio: ["ignore", "pipe", "pipe"]
		});
		if (job) job._child = child;
		const started = Date.now();
		let stderr = "";
		const timer = setInterval(() => {
			if (job?._aborted) return;
			const elapsed = (Date.now() - started) / 1000;
			const soft = 1 - Math.exp(-elapsed / 90);
			if (onTick) onTick(Math.min(0.95, soft));
		}, 1000);
		child.stdout.on("data", (chunk) => process.stdout.write(chunk));
		child.stderr.on("data", (chunk) => {
			stderr += chunk;
			process.stderr.write(chunk);
		});
		child.on("error", (err) => {
			clearInterval(timer);
			if (job) job._child = null;
			reject(err);
		});
		child.on("close", (code) => {
			clearInterval(timer);
			if (job) job._child = null;
			if (job?._aborted) {
				reject(Object.assign(new Error("Aborted by user"), { code: "ABORTED" }));
				return;
			}
			if (code === 0) resolve();
			else reject(new Error(`PotreeConverter exited with code ${code}${stderr ? ": " + stderr.slice(-400) : ""}`));
		});
	});
}

function abortJob(id) {
	const job = jobs.get(id);
	if (!job) return false;
	job._aborted = true;
	if (job._child) {
		try {
			job._child.kill();
		} catch {
			/* ignore */
		}
		job._child = null;
	}
	job.phase = "aborted";
	job.error = "Aborted by user";
	job.message = "Aborted";
	job.etaSeconds = 0;
	emit(job);
	return true;
}

/**
 * After multer saved the LAS file, run convert → S3 → catalog.
 */
async function processLocalJob({ id, name, inputPath, origin, sourceKey, shouldAbort }) {
	const job = jobs.get(id);
	if (!job) return;

	const workDir = path.join(TMP_ROOT, id);
	const outDir = path.join(workDir, "out");
	fs.mkdirSync(outDir, { recursive: true });
	const prefix = s3.potreePrefixForId(id);
	const abortIfNeeded = () => checkAbort(job, shouldAbort);
	let uploadedToS3 = false;

	try {
		const conv = converterStatus();
		if (!conv.ok) {
			throw new Error(`PotreeConverter not found at ${conv.path}`);
		}

		abortIfNeeded();
		setJobProgress(job, {
			phase: "converting",
			phaseRatio: 0,
			message: "Converting with PotreeConverter...",
			uploadedBytes: 0,
			totalBytes: 0,
			etaSeconds: null
		});

		await runConverter(conv.path, inputPath, outDir, (ratio) => {
			setJobProgress(job, {
				phase: "converting",
				phaseRatio: ratio,
				message: "Converting with PotreeConverter..."
			});
		}, job);

		abortIfNeeded();
		const potreeDir = findOutputDir(outDir);
		setJobProgress(job, {
			phase: "converting",
			phaseRatio: 1,
			message: "Conversion finished"
		});

		abortIfNeeded();
		setJobProgress(job, {
			phase: "uploading",
			phaseRatio: 0,
			message: "Uploading to S3...",
			uploadedBytes: 0,
			totalBytes: 0
		});

		const uploaded = await s3.uploadDirectoryWithProgress(potreeDir, prefix, (p) => {
			setJobProgress(job, {
				phase: "uploading",
				phaseRatio: p.overallLoaded / (p.overallTotal || 1),
				message: `Uploading ${p.filename} to S3...`,
				uploadedBytes: p.overallLoaded,
				totalBytes: p.overallTotal
			});
		}, { shouldAbort: () => job._aborted || (shouldAbort && shouldAbort()) });
		uploadedToS3 = uploaded.length > 0;

		abortIfNeeded();
		const metadata = uploaded.find((f) => /metadata\.json$/i.test(f.filename));
		if (!metadata) throw new Error("metadata.json missing after conversion upload");

		setJobProgress(job, {
			phase: "finalizing",
			phaseRatio: 0.5,
			message: "Updating catalog...",
			etaSeconds: 0
		});

		const item = await s3.saveCloudFromUploadWithRetry(
			{ name, prefix, files: uploaded, sourceKey: sourceKey || null },
			s3.getViewerOrigin(),
			3
		);

		abortIfNeeded();
		job.phase = "done";
		job.percent = 100;
		job.message = "Done";
		job.s3 = item.s3;
		job.viewerUrl = item.viewerUrl;
		job.error = null;
		job.etaSeconds = 0;
		emit(job);
	} catch (err) {
		if (isAbortError(err) || job._aborted) {
			console.log(`[local-convert] aborted ${id}`);
			job.phase = "aborted";
			job.error = "Aborted by user";
			job.message = "Aborted";
			job.etaSeconds = 0;
			emit(job);
			if (uploadedToS3) {
				try {
					await s3.deleteObjectsUnderPrefix(prefix);
				} catch (cleanupErr) {
					console.warn(`[local-convert] S3 cleanup failed for ${prefix}:`, cleanupErr.message);
				}
			}
		} else {
			console.error(`[local-convert] failed ${id}:`, err);
			job.phase = "failed";
			job.error = err.message || String(err);
			job.message = job.error;
			emit(job);
		}
	} finally {
		job._child = null;
		rmDirSafe(workDir);
	}
}

function markReceiving(job, { loaded, total }) {
	const t = total || job.totalBytes || 1;
	setJobProgress(job, {
		phase: "receiving",
		phaseRatio: loaded / t,
		message: "Receiving LAS file...",
		uploadedBytes: loaded,
		totalBytes: t
	});
}

module.exports = {
	TMP_ROOT,
	getConverterPath,
	converterStatus,
	createJob,
	getJob,
	publicJob,
	subscribe,
	markReceiving,
	processLocalJob,
	mapPhasePercent,
	notify,
	abortJob,
	isAbortError
};
