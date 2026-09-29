const s3 = require("../lib/s3");
const { send, readJson, getQueryId } = require("../lib/http");

module.exports = async function handler(req, res) {
	if (req.method === "OPTIONS") return send(res, 204, {});

	try {
		// Prefer the host the UI was opened on (Vite :5173 locally).
		const origin = s3.getOrigin(req) || s3.getViewerOrigin();

		if (req.method === "GET") {
			const items = await s3.listClouds(origin);
			return send(res, 200, items);
		}

		if (req.method === "POST") {
			const body = await readJson(req);
			const item = await s3.addCloudLink(body, origin);
			return send(res, 200, item);
		}

		if (req.method === "DELETE") {
			const id = getQueryId(req);
			if (!id) return send(res, 400, { error: "id required" });
			await s3.deleteCloud(id);
			return send(res, 200, { ok: true });
		}

		return send(res, 405, { error: "Method not allowed" });
	} catch (err) {
		console.error(err);
		return send(res, err.status || 500, { error: err.message || "Server error" });
	}
};
