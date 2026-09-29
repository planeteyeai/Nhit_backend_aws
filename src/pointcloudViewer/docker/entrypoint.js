const { spawn } = require("child_process");
const path = require("path");

const role = process.env.ROLE || "all";
const root = path.join(__dirname, "..");

function run(relScript) {
	return spawn(process.execPath, [path.join(root, relScript)], {
		stdio: "inherit",
		env: process.env,
		cwd: root
	});
}

function waitForever(children) {
	const stop = () => {
		for (const child of children) {
			try {
				child.kill("SIGTERM");
			} catch {
				/* ignore */
			}
		}
		process.exit(0);
	};
	process.on("SIGINT", stop);
	process.on("SIGTERM", stop);
	for (const child of children) {
		child.on("exit", (code, signal) => {
			console.error(`[entrypoint] child exited code=${code} signal=${signal}`);
			stop();
		});
	}
}

if (role === "web") {
	const child = run("server/local.js");
	waitForever([child]);
} else if (role === "worker") {
	const child = run("worker/convert.js");
	waitForever([child]);
} else if (role === "all") {
	waitForever([run("server/local.js"), run("worker/convert.js")]);
} else {
	console.error(`Unknown ROLE=${role} (use web|worker|all)`);
	process.exit(1);
}
