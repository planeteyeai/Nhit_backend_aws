const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
require("dotenv").config({ path: path.join(__dirname, "..", "..", "..", ".env") });

const s3 = require("../lib/s3");

const POLL_MS = Number(process.env.WORKER_POLL_MS) || 5000;
const TMP_ROOT = path.join(__dirname, "..", "..", "..", "tmp", "convert");
const PACKAGE_ROOT = path.join(__dirname, "..", "..", "..");
const WIN_CONVERTER = path.join(PACKAGE_ROOT, "tools", "PotreeConverter", "PotreeConverter.exe");
const DEFAULT_CONVERTER = process.platform === "win32" ? WIN_CONVERTER : "/usr/local/bin/PotreeConverter";

function stripQuotes(value) {
	if (!value) return "";
	return String(value).trim().replace(/^["']|["']$/g, "");
}

function getConverterPath() {
	const configured = stripQuotes(process.env.POTREE_CONVERTER_PATH);
	const p = configured || (fs.existsSync(DEFAULT_CONVERTER) ? DEFAULT_CONVERTER : "");
	if (!p) {
		throw new Error(
			"PotreeConverter not found. Run the cloud Docker worker (POTREE_CONVERTER_PATH is set inside the image)."
		);
	}
	if (!fs.existsSync(p)) {
		throw new Error(`PotreeConverter not found at POTREE_CONVERTER_PATH=${p}`);
	}
	return p;
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function runConverter(converterPath, inputFile, outDir) {
	return new Promise((resolve, reject) => {
		const args = [inputFile, "-o", outDir];
		console.log(`[worker] ${converterPath} ${args.join(" ")}`);
		const child = spawn(converterPath, args, {
			windowsHide: true,
			stdio: ["ignore", "pipe", "pipe"]
		});
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
			process.stdout.write(chunk);
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk;
			process.stderr.write(chunk);
		});
		child.on("error", reject);
		child.on("close", (code) => {
			if (code === 0) resolve({ stdout, stderr });
			else reject(new Error(`PotreeConverter exited with code ${code}${stderr ? ": " + stderr.slice(-500) : ""}`));
		});
	});
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
	throw new Error(
		`Conversion output missing required files (${required.join(", ")}) under ${outDir}`
	);
}

function rmDirSafe(dir) {
	try {
		fs.rmSync(dir, { recursive: true, force: true });
	} catch {
		/* ignore */
	}
}

async function processJob(job) {
	const workDir = path.join(TMP_ROOT, job.id);
	const inDir = path.join(workDir, "in");
	const outDir = path.join(workDir, "out");
	rmDirSafe(workDir);
	fs.mkdirSync(inDir, { recursive: true });
	fs.mkdirSync(outDir, { recursive: true });

	const basename = path.basename(job.rawKey);
	const inputFile = path.join(inDir, basename);

	try {
		console.log(`[worker] downloading s3://${job.rawKey}`);
		await s3.downloadObjectToFile(job.rawKey, inputFile);

		const converterPath = getConverterPath();
		await runConverter(converterPath, inputFile, outDir);

		const potreeDir = findOutputDir(outDir);
		console.log(`[worker] uploading ${potreeDir} → ${job.prefix}`);
		const uploaded = await s3.uploadDirectoryToPrefix(potreeDir, job.prefix);

		const metadata = uploaded.find((f) => /metadata\.json$/i.test(f.filename));
		if (!metadata) {
			throw new Error("metadata.json missing after upload");
		}

		let catalogError = null;
		try {
			await s3.saveCloudFromUploadWithRetry(
				{ name: job.name, prefix: job.prefix, files: uploaded },
				s3.getViewerOrigin(),
				3
			);
		} catch (err) {
			catalogError = err.message;
			console.error("[worker] catalog write failed:", catalogError);
		}

		if (catalogError) {
			await s3.writeJob({
				...job,
				status: "failed",
				s3: metadata.publicUrl,
				error: `Converted files uploaded to ${job.prefix}, but catalog failed: ${catalogError}`
			});
			return;
		}

		await s3.writeJob({
			...job,
			status: "done",
			s3: metadata.publicUrl,
			error: null
		});
		console.log(`[worker] done ${job.id} → ${metadata.publicUrl}`);
	} catch (err) {
		console.error(`[worker] failed ${job.id}:`, err);
		await s3.writeJob({
			...job,
			status: "failed",
			error: err.message || String(err)
		});
	} finally {
		rmDirSafe(workDir);
	}
}

async function tick() {
	if (!s3.isConfigured()) {
		console.warn("[worker] AWS not configured; waiting...");
		return false;
	}
	const onceId = stripQuotes(process.env.WORKER_ONCE_JOB_ID);
	let job;
	if (onceId) {
		job = await s3.claimJobById(onceId);
		if (!job) {
			console.log(`[worker] job ${onceId} not claimable (missing or not queued)`);
			return false;
		}
	} else {
		job = await s3.claimNextQueuedJob();
		if (!job) return false;
	}
	console.log(`[worker] claimed ${job.id} (${job.name})`);
	await processJob(job);
	return true;
}

async function main() {
	getConverterPath();
	const onceId = stripQuotes(process.env.WORKER_ONCE_JOB_ID);
	console.log(`[worker] converter: ${getConverterPath()}`);
	if (onceId) {
		console.log(`[worker] one-shot mode for job ${onceId}`);
		await tick();
		return;
	}
	console.log(`[worker] cloud polling every ${POLL_MS}ms (not on your PC)`);
	for (;;) {
		try {
			await tick();
		} catch (err) {
			console.error("[worker] tick error:", err);
		}
		await sleep(POLL_MS);
	}
}

if (require.main === module) {
	main().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}

module.exports = { processJob, tick, getConverterPath };
