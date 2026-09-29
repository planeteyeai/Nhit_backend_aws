const s3 = require("../../lib/s3");
const { send, readJson } = require("../../lib/http");

module.exports = async function handler(req, res) {
	if (req.method === "OPTIONS") return send(res, 204, {});
	if (req.method !== "POST") return send(res, 405, { error: "POST only" });

	try {
		const body = await readJson(req);
		const { name, prefix, files } = body;
		if (!name || !prefix || !Array.isArray(files) || !files.length) {
			return send(res, 400, { error: "name, prefix, files required" });
		}

		const completed = [];
		for (const file of files) {
			if (file.mode === "multipart") {
				await s3.completeMultipart({
					key: file.key,
					uploadId: file.uploadId,
					parts: file.parts || []
				});
			}
			completed.push({
				filename: file.filename,
				key: file.key,
				publicUrl: file.publicUrl
			});
		}

		const item = await s3.saveCloudFromUpload(
			{ name, prefix, files: completed },
			s3.getViewerOrigin()
		);
		return send(res, 200, item);
	} catch (err) {
		console.error(err);
		return send(res, err.status || 500, { error: err.message || "Failed to complete upload" });
	}
};
