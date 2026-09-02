// ---- Session / auth guard helpers, shared across all pages ----

function requireLogin() {
	const idToken = sessionStorage.getItem("idToken");
	if (!idToken) {
		window.location.href = "../login.html";
		return null;
	}
	return {
		idToken: idToken,
		sub: sessionStorage.getItem("sub"),
		userEmail: sessionStorage.getItem("userEmail"),
		userName: sessionStorage.getItem("userName"),
		isArtist: sessionStorage.getItem("isArtist") === "true",
	};
}

function requireArtist() {
	const session = requireLogin();
	if (!session) return null;

	if (!session.isArtist) {
		window.location.href = "index.html";
		return null;
	}
	return session;
}

function getCurrentUserSub() {
	return sessionStorage.getItem("sub");
}
