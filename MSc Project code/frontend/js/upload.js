// ---- Auth guard: must be logged in AND an artist ----
requireArtist();

const sub = getCurrentUserSub();
const userName = sessionStorage.getItem("userName");

function setStatus(message, type) {
	$("#statusMessage")
		.text(message)
		.attr("class", type || "");
}

$("#uploadBtn").on("click", async function () {
	const title = $("#titleInput").val().trim();
	const albumName = $("#albumInput").val().trim();
	const fileInput = $("#fileInput")[0];
	const file = fileInput.files[0];

	if (!title) {
		setStatus("Enter a song title.", "error");
		return;
	}
	if (!file) {
		setStatus("Choose an MP3 file to upload.", "error");
		return;
	}

	const $btn = $(this).prop("disabled", true);

	try {
		setStatus("Preparing upload…", "ok");

		const uploadUrlResponse = await SongsApi.getUploadUrl({
			fileName: file.name,
			contentType: file.type || "audio/mpeg",
		});

		const { uploadUrl, id, s3Key } = uploadUrlResponse;

		if (!uploadUrl || !id || !s3Key) {
			throw new Error("Could not get an upload URL.");
		}

		setStatus("Uploading file…", "ok");
		await SongsApi.uploadFile(uploadUrl, file);

		setStatus("Saving song details…", "ok");

		const metadataPayload = {
			id,
			s3Key,
			title,
			artist: userName || "Unknown artist",
			artistId: sub,
		};

		if (albumName) {
			metadataPayload.albumName = albumName;
		}

		await SongsApi.create(metadataPayload);

		setStatus("Song uploaded successfully!", "ok");
		$("#titleInput, #albumInput").val("");
		fileInput.value = "";

		setTimeout(function () {
			window.location.href = "../index.html";
		}, 1200);
	} catch (err) {
		console.error(err);
		setStatus("Upload failed. Please try again.", "error");
	} finally {
		$btn.prop("disabled", false);
	}
});
