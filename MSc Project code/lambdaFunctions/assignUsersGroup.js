import {
	CognitoIdentityProviderClient,
	AdminAddUserToGroupCommand,
} from "@aws-sdk/client-cognito-identity-provider";

const cognitoClient = new CognitoIdentityProviderClient({});

export const handler = async (event) => {
	const userPoolId = event.userPoolId;
	const username = event.userName;

	const accountType = event.request.userAttributes["custom:accountType"];

	let groupName;

	if (accountType === "artist") {
		groupName = "Artists";
	} else if (accountType === "listener") {
		groupName = "Listeners";
	} else {
		console.error("Invalid or missing account type:", accountType);
		return event;
	}

	await cognitoClient.send(
		new AdminAddUserToGroupCommand({
			UserPoolId: userPoolId,
			Username: username,
			GroupName: groupName,
		}),
	);
	return event;
};
