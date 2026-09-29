const { ECSClient, RunTaskCommand } = require("@aws-sdk/client-ecs");

function stripQuotes(value) {
	if (!value) return "";
	return String(value).trim().replace(/^["']|["']$/g, "");
}

function isEcsConfigured() {
	return Boolean(
		stripQuotes(process.env.AWS_ECS_CLUSTER) &&
		stripQuotes(process.env.AWS_ECS_TASK_DEFINITION) &&
		stripQuotes(process.env.AWS_ECS_SUBNETS)
	);
}

function getEcsClient() {
	const region = stripQuotes(process.env.AWS_S3_REGION_NAME || process.env.AWS_REGION || "ap-south-1");
	const accessKeyId = stripQuotes(process.env.AWS_ACCESS_KEY_ID);
	const secretAccessKey = stripQuotes(process.env.AWS_SECRET_ACCESS_KEY);
	const opts = { region };
	if (accessKeyId && secretAccessKey) {
		opts.credentials = { accessKeyId, secretAccessKey };
	}
	return new ECSClient(opts);
}

/**
 * Spin up a one-shot Fargate task that runs ROLE=worker.
 * Requires a task definition whose container image is this project's Docker image
 * (with PotreeConverter) and AWS_* + POTREE_CONVERTER_PATH env.
 */
async function runConversionTask(jobId) {
	if (!isEcsConfigured()) {
		return { started: false, reason: "ECS not configured" };
	}

	const cluster = stripQuotes(process.env.AWS_ECS_CLUSTER);
	const taskDefinition = stripQuotes(process.env.AWS_ECS_TASK_DEFINITION);
	const subnets = stripQuotes(process.env.AWS_ECS_SUBNETS).split(",").map((s) => s.trim()).filter(Boolean);
	const securityGroups = stripQuotes(process.env.AWS_ECS_SECURITY_GROUPS)
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	const containerName = stripQuotes(process.env.AWS_ECS_CONTAINER_NAME) || "worker";
	const assignPublicIp = stripQuotes(process.env.AWS_ECS_ASSIGN_PUBLIC_IP || "ENABLED");

	const client = getEcsClient();
	const out = await client.send(new RunTaskCommand({
		cluster,
		taskDefinition,
		launchType: "FARGATE",
		count: 1,
		networkConfiguration: {
			awsvpcConfiguration: {
				subnets,
				securityGroups: securityGroups.length ? securityGroups : undefined,
				assignPublicIp
			}
		},
		overrides: {
			containerOverrides: [
				{
					name: containerName,
					environment: [
						{ name: "ROLE", value: "worker" },
						{ name: "WORKER_ONCE_JOB_ID", value: String(jobId || "") },
						{ name: "WORKER_POLL_MS", value: "3000" }
					]
				}
			]
		}
	}));

	const failures = out.failures || [];
	if (failures.length) {
		const msg = failures.map((f) => `${f.arn || ""} ${f.reason || ""}`).join("; ");
		const err = new Error("ECS RunTask failed: " + msg);
		err.status = 500;
		throw err;
	}

	const taskArn = out.tasks?.[0]?.taskArn || null;
	return { started: true, taskArn };
}

module.exports = { isEcsConfigured, runConversionTask };
