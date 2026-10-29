/**
 * Bridge component classification step for freshly converted Potree octrees.
 *
 * Runs src/pointcloudViewer/bridge/classify-octree.js in a child process on the *local* conversion
 * output (before it is uploaded). It writes the class byte into the new octree.bin plus
 * classification.json / classification.vol.z beside metadata.json, which the viewer's Bridge
 * Inspection panel reads. Existing, already-published models are never touched by this step.
 *
 * It must never fail a conversion job: any problem is logged and the cloud is uploaded unclassified
 * (the viewer then simply shows the plain point cloud, exactly as before).
 *
 * Disable with POINTCLOUD_CLASSIFY=0.
 */
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const SCRIPT = path.join(__dirname, "..", "bridge", "classify-octree.js");

function isEnabled() {
	const v = String(process.env.POINTCLOUD_CLASSIFY ?? "1").trim().toLowerCase();
	return !(v === "0" || v === "false" || v === "off" || v === "no");
}

/**
 * @param {string} potreeDir directory containing metadata.json / octree.bin / hierarchy.bin
 * @param {{ log?: (msg: string) => void }} [opts]
 * @returns {Promise<boolean>} true when a classification sidecar was written
 */
function runClassifier(potreeDir, opts = {}) {
	const log = opts.log || ((msg) => console.log(msg));
	return new Promise((resolve) => {
		if (!isEnabled()) {
			log("[classify] skipped (POINTCLOUD_CLASSIFY=0)");
			return resolve(false);
		}
		if (!fs.existsSync(SCRIPT)) {
			log("[classify] classifier script missing; skipping");
			return resolve(false);
		}
		const child = spawn(process.execPath, [SCRIPT, potreeDir], {
			windowsHide: true,
			stdio: ["ignore", "inherit", "inherit"]
		});
		child.on("error", (err) => {
			log(`[classify] could not start: ${err.message}`);
			resolve(false);
		});
		child.on("close", (code) => {
			if (code !== 0) {
				log(`[classify] exited with code ${code}; uploading without component classes`);
				return resolve(false);
			}
			resolve(fs.existsSync(path.join(potreeDir, "classification.json")));
		});
	});
}

module.exports = { runClassifier, isEnabled, SCRIPT };
