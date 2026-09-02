// ---- Cognito configuration ----
const poolData = {
	UserPoolId: "eu-north-1_U8vF01VPx",
	ClientId: "23am528p039g9c3nl5lnppljb3",
};
const userPool = new AmazonCognitoIdentity.CognitoUserPool(poolData);

// ---- UI elements ----
const $tabLogin = $("#tabLogin");
const $tabSignup = $("#tabSignup");
const $loginSection = $("#loginSection");
const $signupSection = $("#signupSection");
const $confirmSection = $("#confirmSection");
const $statusMessage = $("#statusMessage");
const $backToLoginRow = $("#backToLoginRow");

let pendingSignupEmail = null; // used to confirm the right account after sign-up

function setStatus(message, type) {
	$statusMessage.text(message).attr("class", type || "");
}

function showSection(section) {
	$(".form-section").removeClass("active");
	$(".tabs").show();
	$backToLoginRow.hide();

	if (section === "login") {
		$loginSection.addClass("active");
		$tabLogin.addClass("active");
		$tabSignup.removeClass("active");
	} else if (section === "signup") {
		$signupSection.addClass("active");
		$tabSignup.addClass("active");
		$tabLogin.removeClass("active");
	} else if (section === "confirm") {
		$confirmSection.addClass("active");
		$(".tabs").hide();
		$backToLoginRow.show();
	}
	setStatus("");
}

$tabLogin.on("click", () => showSection("login"));
$tabSignup.on("click", () => showSection("signup"));
$("#backToLogin").on("click", () => showSection("login"));

// ---- Sign up ----
$("#signupBtn").on("click", function () {
	const name = $("#signupName").val().trim();
	const email = $("#signupEmail").val().trim();
	const password = $("#signupPassword").val();
	const accountType = $('input[name="accountType"]:checked').val();

	if (!name || !email || !password) {
		setStatus("Please fill in all fields.", "error");
		return;
	}

	const $btn = $(this).prop("disabled", true);
	setStatus("Creating your account…", "ok");

	const attributeList = [
		new AmazonCognitoIdentity.CognitoUserAttribute({
			Name: "email",
			Value: email,
		}),
		new AmazonCognitoIdentity.CognitoUserAttribute({
			Name: "name",
			Value: name,
		}),
		new AmazonCognitoIdentity.CognitoUserAttribute({
			Name: "custom:accountType",
			Value: accountType,
		}),
	];

	userPool.signUp(email, password, attributeList, null, (err, result) => {
		$btn.prop("disabled", false);

		if (err) {
			setStatus(err.message || "Could not create account.", "error");
			return;
		}

		pendingSignupEmail = email;
		setStatus(
			"Account created. Check your email for a verification code.",
			"ok",
		);
		showSection("confirm");
	});
});

// ---- Confirm sign up ----
$("#confirmBtn").on("click", function () {
	const code = $("#confirmCode").val().trim();

	if (!code) {
		setStatus("Enter the verification code sent to your email.", "error");
		return;
	}

	if (!pendingSignupEmail) {
		setStatus("Something went wrong — please sign up again.", "error");
		return;
	}

	const $btn = $(this).prop("disabled", true);
	setStatus("Confirming…", "ok");

	const cognitoUser = new AmazonCognitoIdentity.CognitoUser({
		Username: pendingSignupEmail,
		Pool: userPool,
	});

	cognitoUser.confirmRegistration(code, true, (err, result) => {
		$btn.prop("disabled", false);

		if (err) {
			setStatus(err.message || "Could not confirm account.", "error");
			return;
		}

		setStatus("Account confirmed. You can now log in.", "ok");
		showSection("login");
	});
});

// ---- Log in ----
$("#loginBtn").on("click", function () {
	const email = $("#loginEmail").val().trim();
	const password = $("#loginPassword").val();

	if (!email || !password) {
		setStatus("Please enter your email and password.", "error");
		return;
	}

	const $btn = $(this).prop("disabled", true);
	setStatus("Logging in…", "ok");

	const authDetails = new AmazonCognitoIdentity.AuthenticationDetails({
		Username: email,
		Password: password,
	});

	const cognitoUser = new AmazonCognitoIdentity.CognitoUser({
		Username: email,
		Pool: userPool,
	});

	cognitoUser.authenticateUser(authDetails, {
		onSuccess: function (session) {
			$btn.prop("disabled", false);

			const idToken = session.getIdToken().getJwtToken();
			const accessToken = session.getAccessToken().getJwtToken();
			const payload = session.getIdToken().decodePayload();
			const groups = payload["cognito:groups"] || [];
			const isArtist = groups.includes("Artists");

			// Store session info for the main app page to read
			sessionStorage.setItem("idToken", idToken);
			sessionStorage.setItem("accessToken", accessToken);
			sessionStorage.setItem("sub", payload.sub);
			sessionStorage.setItem("userEmail", payload.email || email);
			sessionStorage.setItem("userName", payload.name || "");
			sessionStorage.setItem("isArtist", isArtist ? "true" : "false");

			// Sync a users-table record for this identity (creates it on first
			// login, harmlessly overwrites the same fields on later logins —
			// PutCommand in the Lambda replaces the whole item each time).
			$.ajax({
				url: `${USERS_API_BASE}/users`,
				method: "POST",
				contentType: "application/json",
				data: JSON.stringify({
					sub: payload.sub,
					email: payload.email || email,
					name: payload.name || "",
					role: isArtist ? "artist" : "listener",
				}),
			});
			setStatus("Logged in — redirecting…", "ok");
			window.location.href = "index.html";
		},
		onFailure: function (err) {
			$btn.prop("disabled", false);
			setStatus(err.message || "Login failed.", "error");
		},
	});
});
