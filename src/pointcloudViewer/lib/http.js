function send(res, status, body) {
	res.statusCode = status;
	res.setHeader("Content-Type", "application/json");
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type");
	if (status === 204) {
		res.end();
		return;
	}
	res.end(JSON.stringify(body));
}

async function readJson(req) {
	if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
		return req.body;
	}
	if (typeof req.body === "string" && req.body.length) {
		return JSON.parse(req.body);
	}

	const chunks = [];
	for await (const chunk of req) {
		chunks.push(chunk);
	}
	if (!chunks.length) return {};
	const text = Buffer.concat(chunks).toString("utf8");
	if (!text) return {};
	return JSON.parse(text);
}

function getQueryId(req) {
	if (req.query && req.query.id) return String(req.query.id);
	const match = String(req.url || "").match(/[?&]id=([^&]+)/);
	return match ? decodeURIComponent(match[1]) : null;
}

module.exports = { send, readJson, getQueryId };
