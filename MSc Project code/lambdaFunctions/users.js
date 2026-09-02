import {
	DynamoDBDocumentClient,
	PutCommand,
	GetCommand,
	UpdateCommand,
	DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

const ddbClient = new DynamoDBClient({ region: "eu-north-1" });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

// Define the name of the DDB table to perform the CRUD operations on
const tablename = "users";

/**
 * Provide an event that contains the following keys:
 *
 *   - httpMethod: one of 'GET,' 'POST,' 'PUT,' 'DELETE'
 *   - payload: a JSON object containing the parameters for the users table
 */
export const handler = async (event, context) => {
	// const body = JSON.parse(event.body);
	const body = event.body ? JSON.parse(event.body) : {};
	const payload = body.payload || {};

	let response;

	switch (event.httpMethod) {
		case "POST": {
			if (!payload.sub) {
				return errorResponse(400, "sub (Cognito user id) is required");
			}

			payload.id = payload.sub;
			delete payload.sub; // avoid storing the same value twice under two names
			payload.createdAt = new Date().toISOString();

			response = await ddbDocClient.send(
				new PutCommand({ TableName: tablename, Item: payload }),
			);
			response.id = payload.id;
			response.createdAt = payload.createdAt;
			break;
		}

		case "GET": {
			const id = event.queryStringParameters?.id;

			if (!id) {
				return errorResponse(400, "id query parameter is required");
			}

			response = await ddbDocClient.send(
				new GetCommand({
					TableName: tablename,
					Key: { id },
				}),
			);
			break;
		}

		case "PUT": {
			const { id, ...updateFields } = body;
			const updateExpressionParts = [];
			const expressionAttributeNames = {};
			const expressionAttributeValues = {};

			Object.entries(updateFields).forEach(([key, value], index) => {
				const nameKey = `#field${index}`;
				const valueKey = `:value${index}`;
				updateExpressionParts.push(`${nameKey} = ${valueKey}`);
				expressionAttributeNames[nameKey] = key;
				expressionAttributeValues[valueKey] = value;
			});

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
			const id = event.queryStringParameters?.id;

			if (!id) {
				return errorResponse(400, "id query parameter is required");
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
			response = "Unknown method: ${method}";
	}

	// Defensive code that defaults to an error if httpsStatusCode
	// is null or undefined. 
	const statusCode = response.$metadata.httpStatusCode ?? 500;

	response = {
		statusCode: statusCode,
		headers: {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Headers": "*",
			"Content-Type": "application/json",
		},
		body: JSON.stringify(response),
	};

	return response;
};
