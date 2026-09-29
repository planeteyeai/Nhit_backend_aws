const s3 = require("../lib/s3");
const localConvert = require("../lib/localConvert");
const { send } = require("../lib/http");

module.exports = async function handler(req, res) {
	if (req.method === "OPTIONS") return send(res, 204, {});

	const cfg = s3.getConfig();
	const converter = localConvert.converterStatus();
	const onVercel = Boolean(process.env.VERCEL);
	return send(res, 200, {
		ok: true,
		configured: s3.isConfigured(),
		bucket: Boolean(cfg.bucket),
		region: cfg.region || null,
		viewerOrigin: s3.getViewerOrigin(),
		localConvert: !onVercel && converter.ok,
		converter: onVercel ? { ok: false, path: null } : converter,
		mode: onVercel ? "production" : "local"
	});
};
