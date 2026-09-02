// ---- Auth guard ----
requireLogin();

// ---- Read artistId from the URL ----
const urlParams = new URLSearchParams(window.location.search);
const artistId = urlParams.get("artistId");

// ---- Ownership check (moved above the load call — no longer relies on async timing) ----
const currentUserSub = getCurrentUserSub();
const isOwnPage = currentUserSub && currentUserSub === artistId;

if (!artistId) {
	$("#artistName").text("No artist specified");
	$("#songsList").html(
		'<div class="empty-note">Missing artistId in the URL.</div>',
	);
} else {
	loadArtistSongs(artistId);
}

function loadArtistSongs(artistId) {
	SongsApi.getByArtist(artistId)
		.done(function (data) {
			const songs = data.Items || [];

			if (songs.length === 0) {
				$("#artistName").text("Artist");
				$("#songCount").text("No songs found.");
				$("#songsList").html(
					'<div class="empty-note">No songs found for this artist.</div>',
				);
				return;
			}

			$("#artistName").text(songs[0].artist || "Unknown artist");
			$("#songCount").text(
				`${songs.length} song${songs.length === 1 ? "" : "s"}`,
			);

			renderSongs(songs);
			renderAlbumsPlaceholder(songs);
		})
		.fail(function () {
			$("#artistName").text("Artist");
			$("#songsList").html(
				'<div class="empty-note">Could not load songs.</div>',
			);
		});
}

function renderSongs(songs) {
	const $list = $("#songsList").empty();
	songs.forEach(function (song) {
		$list.append(buildSongRow(song));
	});
}

function buildSongRow(song) {
	const $row = $("<div>").addClass("song-row").attr("data-song-id", song.id);
	const $info = $("<div>").addClass("song-row-info");

	$("<div>")
		.addClass("song-row-title")
		.text(song.title || "Untitled")
		.appendTo($info);

	if (song.albumName) {
		$("<div>").addClass("song-row-album").text(song.albumName).appendTo($info);
	}

	$row.append($info);

	$info.on("click", function () {
		sessionStorage.setItem("playOnLoad", song.id);
		window.location.href = "../index.html";
	});

	if (isOwnPage) {
		const $actions = $("<div>").addClass("song-row-actions");

		const $editBtn = $("<button>").addClass("btn btn-primary").text("Edit");
		$editBtn.on("click", function (e) {
			e.stopPropagation();
			showEditForm($row, song);
		});

		const $deleteBtn = $("<button>").addClass("btn btn-danger").text("Delete");
		$deleteBtn.on("click", function (e) {
			e.stopPropagation();
			confirmDeleteSong(song);
		});

		$actions.append($editBtn, $deleteBtn);
		$row.append($actions);
	}

	return $row;
}

function showEditForm($row, song) {
	$row.empty();

	const $titleInput = $("<input>")
		.attr("type", "text")
		.val(song.title || "")
		.addClass("edit-input");
	const $albumInput = $("<input>")
		.attr("type", "text")
		.val(song.albumName || "")
		.attr("placeholder", "Album (optional)")
		.addClass("edit-input");

	const $saveBtn = $("<button>").addClass("btn btn-success").text("Save");
	const $cancelBtn = $("<button>").addClass("btn btn-danger").text("Cancel");

	$saveBtn.on("click", function () {
		const newTitle = $titleInput.val().trim();
		const newAlbum = $albumInput.val().trim();

		if (!newTitle) {
			alert("Title cannot be empty.");
			return;
		}

		$saveBtn.prop("disabled", true).text("Saving…");

		SongsApi.update({ id: song.id, title: newTitle, albumName: newAlbum })
			.done(function () {
				song.title = newTitle;
				song.albumName = newAlbum;
				$row.replaceWith(buildSongRow(song));
			})
			.fail(function () {
				alert("Could not save changes.");
				$saveBtn.prop("disabled", false).text("Save");
			});
	});

	$cancelBtn.on("click", function () {
		$row.replaceWith(buildSongRow(song));
	});

	$row.append($titleInput, $albumInput, $saveBtn, $cancelBtn);
}

function confirmDeleteSong(song) {
	const confirmed = confirm(
		`Delete "${song.title || "this song"}"? This cannot be undone.`,
	);
	if (!confirmed) return;

	SongsApi.delete(song.id)
		.done(function () {
			$(`.song-row[data-song-id="${song.id}"]`).remove();
		})
		.fail(function () {
			alert("Could not delete the song.");
		});
}

function renderAlbumsPlaceholder(songs) {
	const $albumsList = $("#albumsList").empty();
	const albumNames = new Set();

	songs.forEach(function (song) {
		if (song.albumName) albumNames.add(song.albumName);
	});

	if (albumNames.size === 0) {
		$albumsList.append('<div class="empty-note">No albums yet.</div>');
		return;
	}

	albumNames.forEach(function (name) {
		$("<div>").addClass("song-row").text(name).appendTo($albumsList);
	});
}
