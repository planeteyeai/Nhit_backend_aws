const s3 = require("../../lib/s3");
const { send, readJson } = require("../../lib/http");

module.exports = async function handler(req, res) {
	if (req.method === "OPTIONS") return send(res, 204, {});
	if (req.method !== "POST") return send(res, 405, { error: "POST only" });

	try {
		const body = await readJson(req);
		if (!body.key || !body.uploadId) {
			return send(res, 400, { error: "key and uploadId required" });
		}
		await s3.abortMultipart(body);
		return send(res, 200, { ok: true });
	} catch (err) {
		console.error(err);
		return send(res, err.status || 500, { error: err.message || "Abort failed" });
	}
};
