const s3 = require("../../lib/s3");
const ecs = require("../../lib/ecs");
const { send, readJson } = require("../../lib/http");

module.exports = async function handler(req, res) {
	if (req.method === "OPTIONS") return send(res, 204, {});
	if (req.method !== "POST") return send(res, 405, { error: "POST only" });

	try {
		const body = await readJson(req);
		const { id, name, rawKey, prefix, file } = body;
		if (!id || !name || !rawKey || !prefix || !file) {
			return send(res, 400, { error: "id, name, rawKey, prefix, and file are required" });
		}
		if (!s3.isLasFilename(file.filename || rawKey)) {
			return send(res, 400, { error: "Only .las or .laz files are allowed" });
		}

		if (file.mode === "multipart") {
			await s3.completeMultipart({
				key: file.key || rawKey,
				uploadId: file.uploadId,
				parts: file.parts || []
			});
		}

		const job = await s3.enqueueLasJob({ id, name, rawKey, prefix });

		let ecsRun = null;
		if (ecs.isEcsConfigured()) {
			try {
				ecsRun = await ecs.runConversionTask(job.id);
			} catch (err) {
				console.error("ECS trigger failed (job still queued for cloud worker):", err);
				ecsRun = { started: false, error: err.message };
			}
		}

		return send(res, 200, {
			id: job.id,
			name: job.name,
			status: job.status,
			rawKey: job.rawKey,
			prefix: job.prefix,
			ecs: ecsRun
		});
	} catch (err) {
		console.error(err);
		return send(res, err.status || 500, { error: err.message || "Failed to enqueue conversion job" });
	}
};
