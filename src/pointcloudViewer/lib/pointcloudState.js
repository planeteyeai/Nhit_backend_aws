const fs = require("fs");
const path = require("path");
const { GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const s3 = require("./s3");
const mongo = require("./mongodb");

const STATE_PREFIX = "catalog/pointcloud-state/";
const LOCAL_ROOT = path.join(__dirname, "..", "..", "..", "data", "pointcloud-state");
const MAX_BSON_BYTES = 16 * 1024 * 1024;
const BSON_HEADROOM = 512 * 1024;

function sanitizeId(id) {
	const safe = String(id || "")
		.trim()
		.replace(/[^a-zA-Z0-9._-]+/g, "-")
		.slice(0, 200);
	if (!safe) {
		const err = new Error("Invalid point cloud id");
		err.status = 400;
		throw err;
	}
	return safe;
}

function stateKey(id) {
	return `${STATE_PREFIX}${sanitizeId(id)}.json`;
}

function localPath(id) {
	return path.join(LOCAL_ROOT, `${sanitizeId(id)}.json`);
}

function normalizePayload(payload = {}) {
	const project = payload.project && typeof payload.project === "object" ? payload.project : null;
	const imageAnnotations = Array.isArray(payload.imageAnnotations) ? payload.imageAnnotations : [];
	if (!project && !imageAnnotations.length) {
		const err = new Error("project or imageAnnotations is required");
		err.status = 400;
		throw err;
	}
	return { project, imageAnnotations };
}

function estimateDocBytes(doc) {
	return Buffer.byteLength(JSON.stringify(doc), "utf8");
}

function assertDocumentSize(doc) {
	const bytes = estimateDocBytes(doc);
	if (bytes > MAX_BSON_BYTES - BSON_HEADROOM) {
		const err = new Error(
			`Saved state is too large (${Math.round(bytes / 1024 / 1024 * 10) / 10} MB). ` +
			"Reduce image sizes or remove some image annotations."
		);
		err.status = 413;
		throw err;
	}
}

function toResponseDoc(id, stored) {
	if (!stored) return null;
	return {
		id,
		pointCloudId: stored.pointCloudId || id,
		project: stored.project || null,
		imageAnnotations: stored.imageAnnotations || [],
		updatedAt: stored.updatedAt || null
	};
}

async function readLocal(id) {
	const filePath = localPath(id);
	try {
		const text = await fs.promises.readFile(filePath, "utf8");
		return JSON.parse(text);
	} catch (err) {
		if (err.code === "ENOENT") return null;
		throw err;
	}
}

async function writeLocal(id, doc) {
	await fs.promises.mkdir(LOCAL_ROOT, { recursive: true });
	await fs.promises.writeFile(localPath(id), JSON.stringify(doc, null, 2), "utf8");
}

async function readS3(id) {
	const { client, bucket } = s3.getClient();
	try {
		const out = await client.send(new GetObjectCommand({
			Bucket: bucket,
			Key: stateKey(id)
		}));
		const chunks = [];
		for await (const chunk of out.Body) {
			chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
		}
		return JSON.parse(Buffer.concat(chunks).toString("utf8"));
	} catch (err) {
		if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
			return null;
		}
		throw err;
	}
}

async function writeS3(id, doc) {
	const { client, bucket } = s3.getClient();
	await client.send(new PutObjectCommand({
		Bucket: bucket,
		Key: stateKey(id),
		Body: JSON.stringify(doc, null, 2),
		ContentType: "application/json"
	}));
}

async function readMongo(id) {
	const collection = await mongo.getCollection();
	if (!collection) return null;
	const doc = await collection.findOne({ pointCloudId: id });
	return doc || null;
}

async function writeMongo(id, doc) {
	const collection = await mongo.getCollection();
	if (!collection) return;
	await collection.updateOne(
		{ pointCloudId: id },
		{ $set: doc },
		{ upsert: true }
	);
}

async function getState(id) {
	const safeId = sanitizeId(id);

	if (mongo.isConfigured()) {
		return toResponseDoc(safeId, await readMongo(safeId));
	}

	let stored = null;
	if (s3.isConfigured()) {
		stored = await readS3(safeId);
	} else {
		stored = await readLocal(safeId);
	}

	return toResponseDoc(safeId, stored);
}

async function putState(id, payload) {
	const safeId = sanitizeId(id);
	let { project, imageAnnotations } = normalizePayload(payload);

	const existing = await getState(safeId);
	if (!project && existing?.project) {
		project = existing.project;
	}
	if (payload.imageAnnotations === undefined && existing?.imageAnnotations) {
		imageAnnotations = existing.imageAnnotations;
	}

	const updatedAt = new Date().toISOString();

	const doc = {
		pointCloudId: safeId,
		project,
		imageAnnotations,
		updatedAt
	};

	assertDocumentSize(doc);

	if (mongo.isConfigured()) {
		await writeMongo(safeId, doc);
	} else if (s3.isConfigured()) {
		await writeS3(safeId, { id: safeId, ...doc });
	} else {
		await writeLocal(safeId, { id: safeId, ...doc });
	}

	return {
		id: safeId,
		pointCloudId: safeId,
		project,
		imageAnnotations,
		updatedAt
	};
}

module.exports = {
	sanitizeId,
	getState,
	putState
};
