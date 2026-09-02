// Auth guard
requireLogin();

function loadAllSongs() {
	$.ajax({
		url: `${SONGS_API_BASE}/songs`,
		method: "GET",
	})
		.done(function (data) {
			const $list = $("#songsList").empty();
			const items = data.Items || [];

			if (items.length === 0) {
				$list.append('<div class="empty-note">No songs uploaded yet.</div>');
				return;
			}

			items.forEach(function (song) {
				const $row = $("<div>").addClass("song-row");
				const $info = $("<div>");

				$("<div>")
					.addClass("song-row-title")
					.text(song.title || "Untitled")
					.appendTo($info);
				$("<div>")
					.addClass("song-row-artist")
					.text(song.artist || "Unknown artist")
					.appendTo($info);

				$row.append($info);

				// Playback lives on index.html's now-playing bar — send the user
				// back there with the chosen song queued up.
				$row.on("click", function () {
					sessionStorage.setItem("playOnLoad", song.id);
					window.location.href = "index.html";
				});

				$list.append($row);
			});
		})
		.fail(function () {
			$("#songsList").html(
				'<div class="empty-note">Could not load songs.</div>',
			);
		});
}

loadAllSongs();
