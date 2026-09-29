const { MongoClient } = require("mongodb");

let clientPromise = null;

function stripQuotes(value) {
	if (!value) return "";
	return String(value).trim().replace(/^["']|["']$/g, "");
}

function getUri() {
	return stripQuotes(process.env.MONGODB_URI);
}

function isConfigured() {
	return Boolean(getUri());
}

function getCollectionName() {
	return stripQuotes(process.env.MONGODB_POINTCLOUD_COLLECTION) || "pointcloud_states";
}

async function getCollection() {
	if (!isConfigured()) return null;

	if (!clientPromise) {
		const uri = getUri();
		const client = new MongoClient(uri);
		clientPromise = client.connect().then(async (connected) => {
			const dbName = stripQuotes(process.env.MONGODB_DB_NAME);
			const db = dbName ? connected.db(dbName) : connected.db();
			const collection = db.collection(getCollectionName());
			await collection.createIndex({ pointCloudId: 1 }, { unique: true });
			return connected;
		});
	}

	const client = await clientPromise;
	const dbName = stripQuotes(process.env.MONGODB_DB_NAME);
	const db = dbName ? client.db(dbName) : client.db();
	return db.collection(getCollectionName());
}

module.exports = {
	isConfigured,
	getCollection
};
