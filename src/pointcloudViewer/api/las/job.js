const s3 = require("../../lib/s3");
const { send, getQueryId } = require("../../lib/http");

module.exports = async function handler(req, res) {
	if (req.method === "OPTIONS") return send(res, 204, {});
	if (req.method !== "GET") return send(res, 405, { error: "GET only" });

	try {
		const id = getQueryId(req);
		if (!id) return send(res, 400, { error: "id required" });

		const job = await s3.readJob(id);
		const payload = { ...job };
		if (job.status === "done" && job.s3) {
			payload.viewerUrl = s3.viewerUrl(s3.getViewerOrigin(), job.s3, job.name);
		}
		return send(res, 200, payload);
	} catch (err) {
		console.error(err);
		return send(res, err.status || 500, { error: err.message || "Failed to load job" });
	}
};
