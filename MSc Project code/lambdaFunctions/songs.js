import {
	DynamoDBDocumentClient,
	PutCommand,
	GetCommand,
	UpdateCommand,
	DeleteCommand,
	QueryCommand,
	ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
	S3Client,
	PutObjectCommand,
	DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl as getCloudFrontSignedUrl } from "@aws-sdk/cloudfront-signer";
import {
	SecretsManagerClient,
	GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

const ddbClient = new DynamoDBClient({ region: "eu-north-1" });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
const s3Client = new S3Client({ region: "eu-north-1" });
const secretsClient = new SecretsManagerClient({ region: "eu-north-1" });

const tablename = "songs";
const bucketName = "music-app-storage-707136105499-eu-north-1-an";

// CloudFront config for streaming playback (separate from the frontend distribution)
const cloudfrontDomain = "https://d2o1ls9olh7ez4.cloudfront.net";
const keyPairId = "K324AYA8DCO8LE";
const streamingUrlExpirySeconds = 3600; // 1 hour

let cachedPrivateKey;

async function getPrivateKey() {
	if (cachedPrivateKey) return cachedPrivateKey;
	const secret = await secretsClient.send(
		new GetSecretValueCommand({
			SecretId: "cloudfront-private-key",
		}),
	);
	cachedPrivateKey = secret.SecretString;
	return cachedPrivateKey;
}

async function getStreamingUrl(s3Key) {
	const privateKey = await getPrivateKey();
	const expiresAt = Date.now() + streamingUrlExpirySeconds * 1000;

	return getCloudFrontSignedUrl({
		url: `${cloudfrontDomain}/${s3Key}`,
		keyPairId,
		privateKey,
		dateLessThan: new Date(expiresAt).toISOString(),
	});
}

/**
 * GET    /songs/{id}   -> fetch metadata + a signed CloudFront streaming URL
 * DELETE /songs/{id}   -> delete metadata from DynamoDB + file from S3
 * POST   /songs        -> body: { payload: { action: 'getUploadUrl' | undefined, ... } }
 * PUT    /songs        -> body: { payload: { id, ...fieldsToUpdate } }
 */
export const handler = async (event, context) => {
	// Defensive coding against JSON.parse for GET and DELETE
	const body = event.body ? JSON.parse(event.body) : {};
	const payload = body.payload || {};

	let response;

	try {
		switch (event.httpMethod) {
			case "POST": {
				if (payload.action === "getUploadUrl") {
					response = await getUploadUrl(payload);
				} else {
					response = await createSong(payload);
				}
				break;
			}

			case "GET": {
				const id = event.pathParameters?.id;

				if (id) {
					const result = await getSongById(id);
					if (result.isError) {
						return errorResponse(result.statusCode, result.message);
					}
					response = result;
				} else {
					response = await listSongs(event.queryStringParameters || {});
				}
				break;
			}

			case "PUT": {
				const { id, ...fields } = payload;

				if (!id) {
					return errorResponse(400, "id is required to update a song");
				}

				const updateExpressionParts = [];
				const expressionAttributeNames = {};
				const expressionAttributeValues = {};

				Object.entries(fields).forEach(([key, value], index) => {
					const nameKey = `#field${index}`;
					const valueKey = `:value${index}`;
					updateExpressionParts.push(`${nameKey} = ${valueKey}`);
					expressionAttributeNames[nameKey] = key;
					expressionAttributeValues[valueKey] = value;
				});

				if (updateExpressionParts.length === 0) {
					return errorResponse(400, "No fields provided to update");
				}

				response = await ddbDocClient.send(
					new UpdateCommand({
						TableName: tablename,
						Key: { id },
						UpdateExpression: `SET ${updateExpressionParts.join(", ")}`,
						ExpressionAttributeNames: expressionAttributeNames,
						ExpressionAttributeValues: expressionAttributeValues,
						ReturnValues: "ALL_NEW",
					}),
				);
				break;
			}

			case "DELETE": {
				const id = event.pathParameters?.id;

				if (!id) {
					return errorResponse(400, "id path parameter is required");
				}

				// First fetch the item so we know the S3 key to remove
				const existing = await ddbDocClient.send(
					new GetCommand({
						TableName: tablename,
						Key: { id },
					}),
				);

				if (!existing.Item) {
					return errorResponse(404, "Song not found");
				}

				await s3Client.send(
					new DeleteObjectCommand({
						Bucket: existing.Item.s3Bucket || bucketName,
						Key: existing.Item.s3Key,
					}),
				);

				response = await ddbDocClient.send(
					new DeleteCommand({
						TableName: tablename,
						Key: { id },
					}),
				);
				break;
			}

			default:
				return errorResponse(400, `Unknown method: ${event.httpMethod}`);
		}
	} catch (err) {
		console.error("ERROR: ", err);
		return errorResponse(500, err.message);
	}

	console.log("RESPONSE: ", response);

	const statusCode = response.$metadata?.httpStatusCode ?? 200;

	return {
		statusCode: statusCode,
		headers: corsHeaders(),
		body: JSON.stringify(response),
	};
};

/**
 * Generates a presigned S3 URL the client can PUT the MP3 file to directly.
 * Returns the id and s3Key up front so the client can pass them back
 * unchanged when it calls createSong() after the upload succeeds.
 */
async function getUploadUrl(payload) {
	const { fileName, contentType } = payload;

	if (!fileName) {
		throw new Error("fileName is required to generate an upload URL");
	}

	const id = crypto.randomUUID();
	const s3Key = `songs/${id}/${fileName}`;

	const { getSignedUrl: getS3SignedUrl } =
		await import("@aws-sdk/s3-request-presigner");

	const command = new PutObjectCommand({
		Bucket: bucketName,
		Key: s3Key,
		ContentType: contentType || "audio/mpeg",
	});

	const uploadUrl = await getS3SignedUrl(s3Client, command, {
		expiresIn: 300,
	});

	return {
		$metadata: { httpStatusCode: 200 },
		uploadUrl,
		id,
		s3Key,
	};
}

/**
 * Saves song metadata to DynamoDB after the client has uploaded the file
 * directly to S3 using the presigned URL from getUploadUrl().
 * @param {*} payload 	Payload to extract song variables
 * @returns 			CreateSong response (with attached streamingUrl)
 */
async function createSong(payload) {
	const { id, s3Key, artistId, ...metadata } = payload;

	if (!id || !s3Key) {
		throw new Error("id and s3Key are required to create a song");
	}

	if (!artistId) {
		throw new Error("artistId is required to create a song");
	}

	const item = {
		...metadata,
		id,
		s3Key,
		s3Bucket: bucketName,
		artistId,
		uploadedAt: new Date().toISOString(),
	};

	const result = await ddbDocClient.send(
		new PutCommand({
			TableName: tablename,
			Item: item,
		}),
	);

	result.item = item;
	return result;
}

/**
 * Helper function for GET method.
 * Fetches the song from DynamoDB and adds a streaming URL for playback.
 * @param {*} id
 * @returns
 */
async function getSongById(id) {
	if (!id) {
		return errorResponse(400, "id path parameter is required");
	}

	const result = await ddbDocClient.send(
		new GetCommand({
			TableName: tablename,
			Key: { id },
		}),
	);

	if (!result.Item) {
		return errorResponse(404, "Song not found");
	}

	// Attach a signed CloudFront URL so the frontend can stream/play the song directly
	result.Item.streamingUrl = await getStreamingUrl(result.Item.s3Key);

	return result;
}

/**
 * Helper function for GET method.
 * Handles two query parameters:
 * - artistId: fetch songs by a specific artist (using GSI)
 * - search: fetch songs with titles containing the search term (using scan + filter)
 * @param {*} queryParams	For searching
 * @returns					Searched songs/artists/albums
 */
async function listSongs(queryParams) {
	const { artistId, search } = queryParams;

	// Songs by a specific artist using artistId-index GSI.
	if (artistId) {
		return ddbDocClient.send(
			new QueryCommand({
				TableName: tablename,
				IndexName: "artistId-index",
				KeyConditionExpression: "artistId = :artistId",
				ExpressionAttributeValues: { ":artistId": artistId },
			}),
		);
	}

	// Basic title search (Scan + filter — fine for a prototype's table size,
	// but scans every item, so revisit if the catalog grows large)
	if (search) {
		console.log(`Searching songs for: ${search}`);
		return ddbDocClient.send(
			new ScanCommand({
				TableName: tablename,
				FilterExpression:
					"contains(#title, :search) OR contains(#artist, :search)",
				ExpressionAttributeNames: {
					"#title": "title",
					"#artist": "artist",
				},
				ExpressionAttributeValues: { ":search": search },
			}),
		);
	}

	// No filters
	return ddbDocClient.send(
		new ScanCommand({
			TableName: tablename,
		}),
	);
}

function corsHeaders() {
	return {
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Headers": "*",
		"Content-Type": "application/json",
	};
}

function errorResponse(statusCode, message) {
	return {
		statusCode,
		headers: corsHeaders(),
		body: JSON.stringify({ message }),
	};
}
