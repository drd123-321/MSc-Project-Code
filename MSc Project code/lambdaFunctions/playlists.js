import {
	DynamoDBDocumentClient,
	PutCommand,
	GetCommand,
	QueryCommand,
	UpdateCommand,
	DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

const ddbClient = new DynamoDBClient({ region: "eu-north-1" });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

const tablename = "playlists";
const userIdIndex = "userId-index";

/**
 * Provide an event that contains the following keys:
 *
 * GET     /playlists/{id}     -> Fetch a single playlist (for search in future)
 * GET     /playlists/{userId} -> Get all playlists belonging to a user
 * POST    /playlists          -> Create playlist
 * PUT     /playlists          -> Update playlist
 * DELETE  /playlists{id}      -> Delete single playlist
 */
export const handler = async (event, context) => {
	const body = event.body ? JSON.parse(event.body) : {};

	let response;

	try {
		switch (event.httpMethod) {
			case "POST": {
				const songIds = body.songIds;

				body.id = crypto.randomUUID();
				body.createdAt = new Date().toISOString();
				body.updatedAt = new Date().toISOString();

				// DynamoDB rejects empty Sets, so playlists can't be created as empty.
				if (songIds && songIds.length > 0) {
					body.songIds = new Set(songIds);
				}

				response = await ddbDocClient.send(
					new PutCommand({
						TableName: tablename,
						Item: body,
					}),
				);

				response = { ...body, songIds: body.songIds ? [...body.songIds] : [] };
				break;
			}

			case "GET": {
				const { id, userId } = event.queryStringParameters || {};

				if (userId) {
					const result = await ddbDocClient.send(
						new QueryCommand({
							TableName: tablename,
							IndexName: userIdIndex,
							KeyConditionExpression: "userId = :userId",
							ExpressionAttributeValues: { ":userId": userId },
						}),
					);

					// Convert Set to plain array, otherwise results appear as empty.
					result.Items = (result.Items || []).map((playlistItem) => ({
						...playlistItem,
						songIds: playlistItem.songIds ? [...playlistItem.songIds] : [],
					}));

					response = result;
				} else if (id) {
					const result = await ddbDocClient.send(
						new GetCommand({
							TableName: tablename,
							Key: { id },
						}),
					);

					if (result.Item) {
						result.Item = {
							...result.Item,
							songIds: result.Item.songIds ? [...result.Item.songIds] : [],
						};
					}

					response = result;
				} else {
					return errorResponse(400, "id or userId query parameter is required");
				}
				break;
			}

			case "PUT": {
				const { id, action } = body;

				if (!id) {
					return errorResponse(400, "id is required to update a playlist");
				}

				// Single song add/remove avoid rewriting whole playlist each time an update is made.
				if (action === "addSong" || action === "removeSong") {
					const { songId } = body;

					if (!songId) {
						return errorResponse(
							400,
							"songId is required for addSong/removeSong",
						);
					}

					const operator = action === "addSong" ? "ADD" : "DELETE";

					const result = await ddbDocClient.send(
						new UpdateCommand({
							TableName: tablename,
							Key: { id },
							UpdateExpression: `${operator} songIds :songId SET updatedAt = :updatedAt`,
							ExpressionAttributeValues: {
								":songId": new Set([songId]),
								":updatedAt": new Date().toISOString(),
							},
							ReturnValues: "ALL_NEW",
						}),
					);

					// Convert Set to array again.
					if (result.Attributes) {
						result.Attributes.songIds = result.Attributes.songIds
							? [...result.Attributes.songIds]
							: [];
					}

					response = result;
					break;
				}

				// General playlist updates - name etc.
				const { songIds, ...fields } = body;

				fields.updatedAt = new Date().toISOString();

				const updateExpressionParts = [];
				const expressionAttributeNames = {};
				const expressionAttributeValues = {};

				Object.entries(fields).forEach(([key, value], index) => {
					if (key === "id") return;

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

	// Protects against lack of metadata in POST call by returning 200 code, 
	// otherwise successful POST will result in error.
	const statusCode = response.$metadata?.httpStatusCode ?? 200;

	return {
		statusCode: statusCode,
		headers: corsHeaders(),
		body: JSON.stringify(response),
	};
};

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
