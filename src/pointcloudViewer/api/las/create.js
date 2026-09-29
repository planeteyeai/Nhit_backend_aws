const s3 = require("../../lib/s3");
const { send, readJson } = require("../../lib/http");

module.exports = async function handler(req, res) {
	if (req.method === "OPTIONS") return send(res, 204, {});
	if (req.method !== "POST") return send(res, 405, { error: "POST only" });

	try {
		const body = await readJson(req);
		const name = String(body.name || "").trim();
		const filename = String(body.filename || "").trim();
		const size = Number(body.size) || 0;
		if (!name || !filename) {
			return send(res, 400, { error: "name and filename are required" });
		}
		if (!s3.isLasFilename(filename)) {
			return send(res, 400, { error: "Only .las or .laz files are allowed" });
		}
		const session = await s3.createRawUploadSession({
			name,
			filename,
			size,
			contentType: body.contentType
		});
		return send(res, 200, session);
	} catch (err) {
		console.error(err);
		return send(res, err.status || 500, { error: err.message || "Failed to create LAS upload" });
	}
};
