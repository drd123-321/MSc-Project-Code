// ---- Auth guard ----
requireLogin();

function getUniqueArtists(songs) {
	const seen = new Map();

	songs.forEach(function (song) {
		if (!song.artistId) return;
		if (!seen.has(song.artistId)) {
			seen.set(song.artistId, {
				artistId: song.artistId,
				artistName: song.artist || "Unknown artist",
			});
		}
	});

	return Array.from(seen.values());
}

function loadAllArtists() {
	SongsApi.getAll()
		.done(function (data) {
			const $grid = $("#artistsGrid").empty();
			const artists = getUniqueArtists(data.Items || []);

			if (artists.length === 0) {
				$grid.append('<div class="empty-note">No artists yet.</div>');
				return;
			}

			artists.forEach(function (artistInfo) {
				const $card = $("<div>").addClass("artist-card");
				$("<div>").addClass("artist-circle").appendTo($card);
				$("<div>")
					.addClass("artist-name")
					.text(artistInfo.artistName)
					.appendTo($card);

				$card.on("click", function () {
					window.location.href = `artist.html?artistId=${encodeURIComponent(artistInfo.artistId)}`;
				});

				$grid.append($card);
			});
		})
		.fail(function () {
			$("#artistsGrid").html(
				'<div class="empty-note">Could not load artists.</div>',
			);
		});
}

loadAllArtists();
