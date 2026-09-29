const s3 = require("../../lib/s3");
const { send, readJson } = require("../../lib/http");

module.exports = async function handler(req, res) {
	if (req.method === "OPTIONS") return send(res, 204, {});
	if (req.method !== "POST") return send(res, 405, { error: "POST only" });

	try {
		const body = await readJson(req);
		const name = String(body.name || "").trim();
		const files = Array.isArray(body.files) ? body.files : [];
		if (!name || !files.length) {
			return send(res, 400, { error: "name and files[] are required" });
		}
		const session = await s3.createUploadSession({ name, files });
		return send(res, 200, session);
	} catch (err) {
		console.error(err);
		return send(res, err.status || 500, { error: err.message || "Failed to create upload" });
	}
};
