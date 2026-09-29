const fs = require("fs");
const path = require("path");
const { pipeline } = require("stream/promises");
const { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectsCommand, ListObjectsV2Command, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

function stripQuotes(value) {
	if (!value) return "";
	return String(value).trim().replace(/^["']|["']$/g, "");
}

function getConfig() {
	const region = stripQuotes(process.env.AWS_S3_REGION_NAME || process.env.AWS_REGION);
	const bucket = stripQuotes(process.env.AWS_STORAGE_BUCKET_NAME);
	const accessKeyId = stripQuotes(process.env.AWS_ACCESS_KEY_ID);
	const secretAccessKey = stripQuotes(process.env.AWS_SECRET_ACCESS_KEY);
	return { region, bucket, accessKeyId, secretAccessKey };
}

function isConfigured() {
	const c = getConfig();
	return Boolean(c.region && c.bucket && c.accessKeyId && c.secretAccessKey);
}

function getClient() {
	const { region, bucket, accessKeyId, secretAccessKey } = getConfig();
	if (!region || !bucket || !accessKeyId || !secretAccessKey) {
		const err = new Error("Missing AWS credentials. Set AWS_* env vars.");
		err.status = 500;
		throw err;
	}
	return {
		client: new S3Client({
			region,
			credentials: { accessKeyId, secretAccessKey }
		}),
		bucket,
		region
	};
}

function publicUrl(bucket, region, key) {
	return `https://${bucket}.s3.${region}.amazonaws.com/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function slugify(name) {
	const base = String(name || "cloud")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 40) || "cloud";
	return `${Date.now()}-${base}`;
}

const CATALOG_KEY = "catalog/clouds.json";
const JOBS_PREFIX = "jobs/";
const DEFAULT_SOURCE_LAS_PREFIX = "upload/model_3d/";
const DEFAULT_POTREE_OUTPUT_PREFIX = "upload/potree/";

function normalizePrefix(value, fallback) {
	const raw = stripQuotes(value) || fallback;
	const cleaned = String(raw).replace(/^\/*/, "");
	return cleaned.endsWith("/") ? cleaned : `${cleaned}/`;
}

/** LAS/LAZ source prefix for bulk list + publish (env: SOURCE_LAS_PREFIX, legacy: BULK_LAS_PREFIX). */
function getSourceLasPrefix() {
	const configured =
		stripQuotes(process.env.SOURCE_LAS_PREFIX) ||
		stripQuotes(process.env.BULK_LAS_PREFIX);
	return normalizePrefix(configured, DEFAULT_SOURCE_LAS_PREFIX);
}

/** Root prefix for new Potree output uploads (env: POTREE_OUTPUT_PREFIX). */
function getPotreeOutputRoot() {
	const configured = stripQuotes(process.env.POTREE_OUTPUT_PREFIX);
	return normalizePrefix(configured, DEFAULT_POTREE_OUTPUT_PREFIX);
}

/** Full S3 prefix for one cloud, e.g. upload/potree/{id} */
function potreePrefixForId(id) {
	const root = getPotreeOutputRoot().replace(/\/$/, "");
	return `${root}/${id}`;
}

function isLasFilename(filename) {
	return /\.(las|laz)$/i.test(String(filename || ""));
}

function jobKey(id) {
	return `${JOBS_PREFIX}${id}.json`;
}

async function streamToString(stream) {
	const chunks = [];
	for await (const chunk of stream) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	return Buffer.concat(chunks).toString("utf8");
}

async function readCatalog() {
	const { client, bucket } = getClient();
	try {
		const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: CATALOG_KEY }));
		const text = await streamToString(out.Body);
		return JSON.parse(text);
	} catch (err) {
		if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
			return [];
		}
		throw err;
	}
}

async function writeCatalog(items) {
	const { client, bucket } = getClient();
	await client.send(new PutObjectCommand({
		Bucket: bucket,
		Key: CATALOG_KEY,
		Body: JSON.stringify(items, null, 2),
		ContentType: "application/json"
	}));
}

function viewerUrl(origin, s3Url, name, id) {
	const base = origin.replace(/\/$/, "");
	const pathPrefix = (stripQuotes(process.env.PUBLIC_VIEWER_PATH) || "/pointcloud-viewer").replace(/\/$/, "");
	// When origin already ends with /pointcloud-viewer, don't double-prefix.
	const hasViewer = /\/pointcloud-viewer$/i.test(base);
	const u = new URL(hasViewer ? `${base}/tnmy/view.html` : `${base}${pathPrefix}/tnmy/view.html`);
	u.searchParams.set("url", s3Url);
	if (name) u.searchParams.set("name", name);
	if (id) u.searchParams.set("id", id);
	return u.toString();
}

function contentTypeFor(filename) {
	const ext = String(filename).split(".").pop().toLowerCase();
	if (ext === "json") return "application/json";
	if (ext === "js") return "application/javascript";
	return "application/octet-stream";
}

const PART_SIZE = 16 * 1024 * 1024; // 16 MB
const SINGLE_PUT_MAX = 8 * 1024 * 1024; // small files use single PUT; large → multipart

async function createUploadSession({ name, files }) {
	const { client, bucket, region } = getClient();
	const id = slugify(name);
	const prefix = potreePrefixForId(id);
	const sessionFiles = [];

	for (const file of files) {
		const filename = String(file.filename || "").replace(/\\/g, "/").split("/").pop();
		if (!filename) continue;
		const size = Number(file.size) || 0;
		const key = `${prefix}/${filename}`;
		const contentType = file.contentType || contentTypeFor(filename);

		if (size > 0 && size <= SINGLE_PUT_MAX) {
			const url = await getSignedUrl(
				client,
				new PutObjectCommand({
					Bucket: bucket,
					Key: key,
					ContentType: contentType
				}),
				{ expiresIn: 3600 }
			);
			sessionFiles.push({
				filename,
				key,
				size,
				mode: "put",
				contentType,
				url,
				publicUrl: publicUrl(bucket, region, key)
			});
		} else {
			const created = await client.send(new CreateMultipartUploadCommand({
				Bucket: bucket,
				Key: key,
				ContentType: contentType
			}));
			const partCount = Math.max(1, Math.ceil(size / PART_SIZE) || 1);
			sessionFiles.push({
				filename,
				key,
				size,
				mode: "multipart",
				contentType,
				uploadId: created.UploadId,
				partSize: PART_SIZE,
				partCount,
				publicUrl: publicUrl(bucket, region, key)
			});
		}
	}

	return { id, name, prefix, files: sessionFiles, partSize: PART_SIZE };
}

async function createRawUploadSession({ name, filename, size, contentType }) {
	const cleanName = String(filename || "").replace(/\\/g, "/").split("/").pop();
	if (!isLasFilename(cleanName)) {
		const err = new Error("Only .las or .laz files are allowed");
		err.status = 400;
		throw err;
	}
	const id = slugify(name);
	const key = `raw/${id}/${cleanName}`;
	const fileSize = Number(size) || 0;
	const type = contentType || contentTypeFor(cleanName);
	const { client, bucket, region } = getClient();

	let fileMeta;
	if (fileSize > 0 && fileSize <= SINGLE_PUT_MAX) {
		const url = await getSignedUrl(
			client,
			new PutObjectCommand({
				Bucket: bucket,
				Key: key,
				ContentType: type
			}),
			{ expiresIn: 3600 }
		);
		fileMeta = {
			filename: cleanName,
			key,
			size: fileSize,
			mode: "put",
			contentType: type,
			url,
			publicUrl: publicUrl(bucket, region, key)
		};
	} else {
		const created = await client.send(new CreateMultipartUploadCommand({
			Bucket: bucket,
			Key: key,
			ContentType: type
		}));
		const partCount = Math.max(1, Math.ceil(fileSize / PART_SIZE) || 1);
		fileMeta = {
			filename: cleanName,
			key,
			size: fileSize,
			mode: "multipart",
			contentType: type,
			uploadId: created.UploadId,
			partSize: PART_SIZE,
			partCount,
			publicUrl: publicUrl(bucket, region, key)
		};
	}

	return {
		id,
		name,
		rawKey: key,
		prefix: potreePrefixForId(id),
		file: fileMeta,
		partSize: PART_SIZE
	};
}

async function readJob(id) {
	const { client, bucket } = getClient();
	try {
		const out = await client.send(new GetObjectCommand({
			Bucket: bucket,
			Key: jobKey(id)
		}));
		return JSON.parse(await streamToString(out.Body));
	} catch (err) {
		if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
			const e = new Error("Job not found");
			e.status = 404;
			throw e;
		}
		throw err;
	}
}

async function writeJob(job) {
	const { client, bucket } = getClient();
	const body = {
		...job,
		updatedAt: Date.now()
	};
	await client.send(new PutObjectCommand({
		Bucket: bucket,
		Key: jobKey(job.id),
		Body: JSON.stringify(body, null, 2),
		ContentType: "application/json"
	}));
	return body;
}

async function enqueueLasJob({ id, name, rawKey, prefix }) {
	const now = Date.now();
	return writeJob({
		id,
		name,
		status: "queued",
		rawKey,
		prefix,
		s3: null,
		error: null,
		createdAt: now,
		updatedAt: now
	});
}

async function claimJobById(id) {
	const job = await readJob(id);
	if (job.status !== "queued" && job.status !== "processing") {
		return null;
	}
	job.status = "processing";
	job.error = null;
	return writeJob(job);
}

async function claimNextQueuedJob() {
	const { client, bucket } = getClient();
	const listed = await client.send(new ListObjectsV2Command({
		Bucket: bucket,
		Prefix: JOBS_PREFIX,
		MaxKeys: 100
	}));
	const keys = (listed.Contents || [])
		.map((o) => o.Key)
		.filter((k) => k && k.endsWith(".json"));

	for (const key of keys) {
		let job;
		try {
			const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
			job = JSON.parse(await streamToString(out.Body));
		} catch {
			continue;
		}
		if (job.status !== "queued") continue;
		job.status = "processing";
		job.error = null;
		return writeJob(job);
	}
	return null;
}

async function downloadObjectToFile(key, destPath, opts = {}) {
	const shouldAbort = opts.shouldAbort || (() => false);
	const onProgress = opts.onProgress || null;
	const { client, bucket } = getClient();
	fs.mkdirSync(path.dirname(destPath), { recursive: true });
	const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
	const totalBytes = Number(out.ContentLength) || 0;
	let loadedBytes = 0;
	const writeStream = fs.createWriteStream(destPath);
	try {
		for await (const chunk of out.Body) {
			if (shouldAbort()) {
				writeStream.destroy();
				const err = new Error("Aborted by user");
				err.code = "ABORTED";
				throw err;
			}
			if (!writeStream.write(chunk)) {
				await new Promise((resolve) => writeStream.once("drain", resolve));
			}
			loadedBytes += chunk.length;
			if (onProgress) {
				onProgress({ loaded: loadedBytes, total: totalBytes });
			}
		}
		writeStream.end();
		await new Promise((resolve, reject) => {
			writeStream.on("finish", resolve);
			writeStream.on("error", reject);
		});
	} catch (err) {
		try {
			writeStream.destroy();
			fs.unlinkSync(destPath);
		} catch {
			/* ignore */
		}
		throw err;
	}
}

async function uploadDirectoryToPrefix(localDir, prefix) {
	return uploadDirectoryWithProgress(localDir, prefix);
}

/**
 * Upload all files in localDir to S3 prefix.
 * onProgress({ filename, fileLoaded, fileTotal, overallLoaded, overallTotal })
 */
async function uploadDirectoryWithProgress(localDir, prefix, onProgress, opts = {}) {
	const shouldAbort = opts.shouldAbort || (() => false);
	const { client, bucket, region } = getClient();
	const entries = fs.readdirSync(localDir, { withFileTypes: true }).filter((e) => e.isFile());
	const files = entries.map((entry) => {
		const localPath = path.join(localDir, entry.name);
		const stat = fs.statSync(localPath);
		return { filename: entry.name, localPath, size: stat.size };
	});
	const overallTotal = files.reduce((sum, f) => sum + f.size, 0) || 1;
	let overallLoaded = 0;
	const uploaded = [];

	for (const file of files) {
		if (shouldAbort()) {
			const err = new Error("Aborted by user");
			err.code = "ABORTED";
			throw err;
		}
		const key = `${prefix.replace(/\/$/, "")}/${file.filename}`;
		const contentType = contentTypeFor(file.filename);
		const body = fs.createReadStream(file.localPath);

		const upload = new Upload({
			client,
			params: {
				Bucket: bucket,
				Key: key,
				Body: body,
				ContentType: contentType
			}
		});

		upload.on("httpUploadProgress", (p) => {
			const fileLoaded = Math.min(Number(p.loaded) || 0, file.size);
			if (onProgress) {
				onProgress({
					filename: file.filename,
					fileLoaded,
					fileTotal: file.size,
					overallLoaded: overallLoaded + fileLoaded,
					overallTotal
				});
			}
		});

		await upload.done();
		overallLoaded += file.size;
		if (onProgress) {
			onProgress({
				filename: file.filename,
				fileLoaded: file.size,
				fileTotal: file.size,
				overallLoaded,
				overallTotal
			});
		}
		uploaded.push({
			filename: file.filename,
			key,
			publicUrl: publicUrl(bucket, region, key)
		});
	}

	return uploaded;
}

async function saveCloudFromUploadWithRetry({ name, prefix, files, sourceKey }, origin, retries = 3) {
	let lastErr;
	for (let attempt = 1; attempt <= retries; attempt++) {
		try {
			return await saveCloudFromUpload({ name, prefix, files, sourceKey }, origin);
		} catch (err) {
			lastErr = err;
			if (attempt < retries) {
				await new Promise((r) => setTimeout(r, 500 * attempt));
			}
		}
	}
	const err = new Error(
		`Catalog write failed after ${retries} tries (files at ${prefix}): ${lastErr?.message || lastErr}`
	);
	err.status = 500;
	err.prefix = prefix;
	throw err;
}

async function signPart({ key, uploadId, partNumber }) {
	const { client, bucket } = getClient();
	const url = await getSignedUrl(
		client,
		new UploadPartCommand({
			Bucket: bucket,
			Key: key,
			UploadId: uploadId,
			PartNumber: Number(partNumber)
		}),
		{ expiresIn: 3600 }
	);
	return { url };
}

async function completeMultipart({ key, uploadId, parts }) {
	const { client, bucket, region } = getClient();
	await client.send(new CompleteMultipartUploadCommand({
		Bucket: bucket,
		Key: key,
		UploadId: uploadId,
		MultipartUpload: {
			Parts: parts
				.map((p) => ({
					ETag: p.ETag || p.etag,
					PartNumber: Number(p.PartNumber || p.partNumber)
				}))
				.sort((a, b) => a.PartNumber - b.PartNumber)
		}
	}));
	return { url: publicUrl(bucket, region, key) };
}

async function abortMultipart({ key, uploadId }) {
	const { client, bucket } = getClient();
	await client.send(new AbortMultipartUploadCommand({
		Bucket: bucket,
		Key: key,
		UploadId: uploadId
	}));
}

function pickViewerUrl(files) {
	const metadata = files.find((f) => /metadata\.json$/i.test(f.filename));
	const cloudJs = files.find((f) => /cloud\.js$/i.test(f.filename));
	const any = files[0];
	return (metadata || cloudJs || any)?.publicUrl || (metadata || cloudJs || any)?.url;
}

async function saveCloudFromUpload({ name, prefix, files, sourceKey }, origin) {
	const s3Url = pickViewerUrl(files);
	const item = {
		id: prefix.split("/").pop(),
		name,
		s3: s3Url,
		prefix,
		files: files.map((f) => f.filename),
		sourceKey: sourceKey || null,
		createdAt: Date.now()
	};
	const catalog = await readCatalog();
	catalog.unshift(item);
	await writeCatalog(catalog);
	return {
		...item,
		viewerUrl: viewerUrl(origin, item.s3, item.name, item.id)
	};
}

async function listClouds(origin) {
	const items = await readCatalog();
	return items.map((item) => ({
		...item,
		viewerUrl: viewerUrl(origin, item.s3, item.name, item.id)
	}));
}

async function addCloudLink({ name, s3 }, origin) {
	let url = String(s3 || "").trim();
	if (url && !/metadata\.json|cloud\.js|ept\.json|\.copc\.laz$/i.test(url)) {
		if (!url.endsWith("/")) url += "/";
		url += "metadata.json";
	}
	const item = {
		id: slugify(name),
		name: String(name || "").trim(),
		s3: url,
		prefix: null,
		files: [],
		createdAt: Date.now()
	};
	const catalog = await readCatalog();
	catalog.unshift(item);
	await writeCatalog(catalog);
	return { ...item, viewerUrl: viewerUrl(origin, item.s3, item.name, item.id) };
}

async function deleteCloud(id) {
	const catalog = await readCatalog();
	const index = catalog.findIndex((item) => item.id === id);
	if (index === -1) {
		const err = new Error("Not found");
		err.status = 404;
		throw err;
	}
	const [removed] = catalog.splice(index, 1);
	if (removed.prefix) {
		await deleteObjectsUnderPrefix(removed.prefix);
	}
	await writeCatalog(catalog);
	return { ok: true };
}

/** Delete all objects under an S3 prefix (used for cleanup on abort/delete). */
async function deleteObjectsUnderPrefix(prefix) {
	if (!prefix) return { deleted: 0 };
	const normalized = String(prefix).replace(/^\/*/, "");
	const { client, bucket } = getClient();
	let deleted = 0;
	let token;
	do {
		const listed = await client.send(new ListObjectsV2Command({
			Bucket: bucket,
			Prefix: normalized,
			ContinuationToken: token
		}));
		const keys = (listed.Contents || []).map((obj) => ({ Key: obj.Key }));
		if (keys.length) {
			await client.send(new DeleteObjectsCommand({
				Bucket: bucket,
				Delete: { Objects: keys }
			}));
			deleted += keys.length;
		}
		token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
	} while (token);
	return { deleted };
}

function getOrigin(req) {
	const proto = req.headers["x-forwarded-proto"] || "http";
	const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:5173";
	return `${proto}://${host}`;
}

async function listLasObjects(prefix) {
	const { client, bucket, region } = getClient();
	const normalized = normalizePrefix(prefix, getSourceLasPrefix());
	const catalog = await readCatalog();
	const catalogBySource = new Map(
		catalog.filter((item) => item.sourceKey).map((item) => [item.sourceKey, item])
	);
	const viewerOrigin = getViewerOrigin();
	const items = [];
	let token;
	do {
		const out = await client.send(new ListObjectsV2Command({
			Bucket: bucket,
			Prefix: normalized,
			ContinuationToken: token
		}));
		for (const obj of out.Contents || []) {
			if (!/\.(las|laz)$/i.test(obj.Key)) continue;
			const basename = obj.Key.split("/").pop();
			const name = basename.replace(/\.(las|laz)$/i, "");
			const catalogItem = catalogBySource.get(obj.Key);
			items.push({
				key: obj.Key,
				name,
				size: obj.Size || 0,
				url: publicUrl(bucket, region, obj.Key),
				published: Boolean(catalogItem),
				viewerUrl: catalogItem
					? viewerUrl(viewerOrigin, catalogItem.s3, catalogItem.name, catalogItem.id)
					: null
			});
		}
		token = out.IsTruncated ? out.NextContinuationToken : undefined;
	} while (token);
	items.sort((a, b) => a.key.localeCompare(b.key));
	return { prefix: normalized, items };
}

/** Local default — set PUBLIC_VIEWER_ORIGIN on Vercel/production if needed. */
function getViewerOrigin() {
	const configured = stripQuotes(process.env.PUBLIC_VIEWER_ORIGIN);
	if (configured) return configured.replace(/\/$/, "");
	const corsFirst = stripQuotes(process.env.CORS_ORIGIN).split(",")[0].trim();
	return (corsFirst || "http://localhost:5173").replace(/\/$/, "");
}

module.exports = {
	isConfigured,
	getConfig,
	createUploadSession,
	createRawUploadSession,
	isLasFilename,
	readJob,
	writeJob,
	enqueueLasJob,
	claimJobById,
	claimNextQueuedJob,
	downloadObjectToFile,
	uploadDirectoryToPrefix,
	uploadDirectoryWithProgress,
	saveCloudFromUpload,
	saveCloudFromUploadWithRetry,
	listLasObjects,
	viewerUrl,
	publicUrl,
	signPart,
	completeMultipart,
	abortMultipart,
	listClouds,
	addCloudLink,
	deleteCloud,
	getOrigin,
	getViewerOrigin,
	getSourceLasPrefix,
	getPotreeOutputRoot,
	potreePrefixForId,
	deleteObjectsUnderPrefix,
	getClient,
	slugify,
	PART_SIZE,
	SINGLE_PUT_MAX
};
