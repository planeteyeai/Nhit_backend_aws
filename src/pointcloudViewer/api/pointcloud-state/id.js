const pointcloudState = require("../../lib/pointcloudState");
const { send, readJson } = require("../../lib/http");

function extractId(req) {
	if (req.query?.id) return String(req.query.id);
	if (req.params?.id) return String(req.params.id);

	const url = String(req.url || "");
	const match = url.match(/\/api\/pointcloud-state\/([^/?#]+)/i);
	if (match) return decodeURIComponent(match[1]);

	return null;
}

module.exports = async function handler(req, res) {
	if (req.method === "OPTIONS") return send(res, 204, {});

	const rawId = extractId(req);
	if (!rawId) return send(res, 400, { error: "id required" });

	let id;
	try {
		id = pointcloudState.sanitizeId(rawId);
	} catch (err) {
		return send(res, err.status || 400, { error: err.message || "Invalid id" });
	}

	try {
		if (req.method === "GET") {
			const doc = await pointcloudState.getState(id);
			if (!doc) return send(res, 404, { error: "Not found" });
			return send(res, 200, doc);
		}

		if (req.method === "PUT") {
			const body = await readJson(req);
			const doc = await pointcloudState.putState(id, {
				project: body?.project,
				imageAnnotations: body?.imageAnnotations
			});
			return send(res, 200, {
				ok: true,
				id: doc.id,
				updatedAt: doc.updatedAt,
				imageAnnotationCount: (doc.imageAnnotations || []).length
			});
		}

		return send(res, 405, { error: "Method not allowed" });
	} catch (err) {
		console.error("[pointcloud-state]", err);
		return send(res, err.status || 500, { error: err.message || "Server error" });
	}
};
