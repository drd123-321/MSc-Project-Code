// ---- Auth guard ----
const session = requireLogin();

if (!session) {
	throw new Error("Not logged in — redirecting.");
}

const sub = session.sub;
const isArtist = session.isArtist;

// ---- DOM elements ----
const $nameInput = $("#nameInput");
const $emailInput = $("#emailInput");
const $saveBtn = $("#saveBtn");
const $roleBadge = $("#roleBadge");

function setStatus(message, type) {
	$("#statusMessage")
		.text(message)
		.attr("class", type || "");
}

// ---- Load current profile ----
function loadProfile() {
	UsersApi.getById(sub)
		.done(function (data) {
			const user = data.Item;

			if (!user) {
				console.error("No Item found in API response.");
				setStatus("Could not find your profile.", "error");
				return;
			}

			$nameInput.val(user.name || "");
			$emailInput.val(user.email || "");

			$roleBadge.text(isArtist ? "Artist" : "Listener");
		})
		.fail(function (xhr) {
			console.error("Profile request failed:", xhr);
			setStatus("Could not load your profile.", "error");
		});
}

loadProfile();

// ---- Save changes ----
$saveBtn.on("click", function () {
	const name = $nameInput.val().trim();
	const email = $emailInput.val().trim();

	if (!name || !email) {
		setStatus("Name and email cannot be empty.", "error");
		return;
	}

	$saveBtn.prop("disabled", true);
	setStatus("Saving…", "ok");

	UsersApi.update({
		id: sub,
		name: name,
		email: email,
	})
		.done(function (data) {
			sessionStorage.setItem("userName", name);
			sessionStorage.setItem("userEmail", email);

			setStatus("Profile updated.", "ok");
		})
		.fail(function (xhr) {
			console.error("Profile update failed:", xhr);
			setStatus("Could not save changes.", "error");
		})
		.always(function () {
			$saveBtn.prop("disabled", false);
		});
});
