// ---- Auth guard ----
const session = requireLogin();
if (!session) {
	// requireLogin() already redirected to login.html — stop here to avoid
	// touching session.* on a null object while that navigation completes.
	throw new Error("Not logged in — redirecting.");
}

$("#usernameLabel").text(session.userName || session.userEmail || "User");

if (session.isArtist) {
	$("#uploadBtn").show();
}

// ---- Logout ----
$("#logoutLink").on("click", function () {
	sessionStorage.clear();
	window.location.href = "login.html";
});

$("#myProfileLink").on("click", function () {
	window.location.href = "views/profile.html";
});

$("#uploadBtn").on("click", function () {
	window.location.href = "views/upload.html";
});

// ---- Load playlists for the sidebar ----
const currentUserId = session.sub;

function loadPlaylists() {
	PlaylistsApi.getByUser(currentUserId)
		.done(function (data) {
			const $list = $("#playlistsList").empty();
			const items = data.Items || [];

			if (items.length === 0) {
				$list.append('<div class="empty-note">No playlists yet.</div>');
				return;
			}

			items.forEach(function (playlist) {
				$("<div>")
					.addClass("playlist-item")
					.text(playlist.name)
					.attr("data-id", playlist.id)
					.appendTo($list);
			});
		})
		.fail(function () {
			$("#playlistsList").html(
				'<div class="empty-note">Could not load playlists.</div>',
			);
		});
}

loadPlaylists();

// ---- Now playing / playback controls ----
const $audio = $("#audioPlayer");
const $playPauseBtn = $("#playPauseBtn");
let isPlaying = false;

function loadAndPlaySong(song) {
	$("#nowPlayingTitle").text(song.title || "Untitled");
	$audio.attr("src", song.streamingUrl);
	$audio[0].play();
	isPlaying = true;
	$playPauseBtn.html("&#10074;&#10074;");
}

$playPauseBtn.on("click", function () {
	if (!$audio.attr("src")) return;

	if (isPlaying) {
		$audio[0].pause();
		$playPauseBtn.html("&#9654;");
	} else {
		$audio[0].play();
		$playPauseBtn.html("&#10074;&#10074;");
	}
	isPlaying = !isPlaying;
});

$audio.on("timeupdate", function () {
	const audioEl = $audio[0];
	if (audioEl.duration) {
		const pct = (audioEl.currentTime / audioEl.duration) * 100;
		$("#progressFill").css("width", pct + "%");
	}
});

function playSongById(songId) {
	SongsApi.getById(songId)
		.done(function (data) {
			if (data.Item) {
				loadAndPlaySong(data.Item);
			}
		})
		.fail(function () {
			$("#nowPlayingTitle").text("Could not load song.");
		});
}

// ---- Play queued song (from songs.html/artist.html handoff) ----
const queuedSongId = sessionStorage.getItem("playOnLoad");
if (queuedSongId) {
	sessionStorage.removeItem("playOnLoad");
	playSongById(queuedSongId);
}

// ---- Search ----
const $searchInput = $("#searchInput");
const $searchResults = $("#searchResults");
let searchDebounceTimer = null;

function renderSearchResults(songs) {
	$searchResults.empty();

	if (songs.length === 0) {
		$searchResults.append(
			'<div class="search-no-results">No results found.</div>',
		);
		$searchResults.addClass("visible");
		return;
	}

	songs.forEach(function (song) {
		const $item = $("<div>").addClass("search-result-item");
		$("<div>")
			.text(song.title || "Untitled")
			.appendTo($item);
		$("<div>")
			.addClass("search-result-artist")
			.text(song.artist || "Unknown artist")
			.appendTo($item);

		$item.on("click", function () {
			playSongById(song.id);
			$searchResults.removeClass("visible");
			$searchInput.val("");
		});

		$searchResults.append($item);
	});

	$searchResults.addClass("visible");
}

function runSearch(term) {
	if (!term) {
		$searchResults.removeClass("visible").empty();
		return;
	}

	SongsApi.search(term)
		.done(function (data) {
			renderSearchResults(data.Items || []);
		})
		.fail(function () {
			$searchResults
				.html('<div class="search-no-results">Search failed.</div>')
				.addClass("visible");
		});
}

$searchInput.on("input", function () {
	const term = $(this).val().trim();
	clearTimeout(searchDebounceTimer);
	searchDebounceTimer = setTimeout(function () {
		runSearch(term);
	}, 300);
});

$(document).on("click", function (e) {
	if (!$(e.target).closest("#searchInput, #searchResults").length) {
		$searchResults.removeClass("visible");
	}
});

// ---- Homepage carousels ----
const SONGS_PER_SLIDE = 4;
const ARTISTS_PER_SLIDE = 5;
let allSongsCache = [];

function buildSongRow(song) {
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
	$row.on("click", function () {
		playSongById(song.id);
	});

	return $row;
}

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

function buildArtistCard(artistInfo) {
	const $card = $("<div>").addClass("artist-card");
	$("<div>").addClass("artist-circle").appendTo($card);
	$("<div>")
		.addClass("artist-name")
		.text(artistInfo.artistName)
		.appendTo($card);

	$card.on("click", function () {
		window.location.href = `views/artist.html?artistId=${encodeURIComponent(artistInfo.artistId)}`;
	});

	return $card;
}

function loadArtistsCarousel(songs) {
	const $inner = $("#artistsCarouselInner").empty();
	const artists = getUniqueArtists(songs);

	if (artists.length === 0) {
		$inner.append(
			'<div class="carousel-item active"><div class="empty-note">No artists yet.</div></div>',
		);
		return;
	}

	for (let i = 0; i < artists.length; i += ARTISTS_PER_SLIDE) {
		const slideArtists = artists.slice(i, i + ARTISTS_PER_SLIDE);
		const $slide = $("<div>").addClass(
			"carousel-item" + (i === 0 ? " active" : ""),
		);
		const $slideRow = $("<div>").addClass("carousel-artist-row");

		slideArtists.forEach(function (artistInfo) {
			$slideRow.append(buildArtistCard(artistInfo));
		});

		$slide.append($slideRow);
		$inner.append($slide);
	}
}

function loadSongsCarousel() {
	SongsApi.getAll()
		.done(function (data) {
			const items = data.Items || [];
			allSongsCache = items;
			const $inner = $("#songsCarouselInner").empty();

			if (items.length === 0) {
				$inner.append(
					'<div class="carousel-item active"><div class="empty-note">No songs uploaded yet.</div></div>',
				);
			} else {
				for (let i = 0; i < items.length; i += SONGS_PER_SLIDE) {
					const slideSongs = items.slice(i, i + SONGS_PER_SLIDE);
					const $slide = $("<div>").addClass(
						"carousel-item" + (i === 0 ? " active" : ""),
					);
					const $slideRow = $("<div>").addClass("carousel-slide-row");

					slideSongs.forEach(function (song) {
						$slideRow.append(buildSongRow(song));
					});

					$slide.append($slideRow);
					$inner.append($slide);
				}
			}

			loadArtistsCarousel(items);
		})
		.fail(function () {
			$("#songsCarouselInner").html(
				'<div class="carousel-item active"><div class="empty-note">Could not load songs.</div></div>',
			);
			$("#artistsCarouselInner").html(
				'<div class="carousel-item active"><div class="empty-note">Could not load artists.</div></div>',
			);
		});
}

loadSongsCarousel();

function getSongFromCache(songId) {
	return allSongsCache.find(function (s) {
		return s.id === songId;
	});
}

// ---- Create Playlist modal ----
let selectedSongs = [];
let playlistSearchDebounce = null;

const $playlistSongSearch = $("#playlistSongSearch");
const $playlistSongSearchResults = $("#playlistSongSearchResults");
const $selectedSongsList = $("#selectedSongsList");
const $playlistNameInput = $("#playlistNameInput");
const $createPlaylistStatus = $("#createPlaylistStatus");
const $submitCreatePlaylistBtn = $("#submitCreatePlaylistBtn");

function setCreatePlaylistStatus(message, type) {
	$createPlaylistStatus
		.text(message)
		.attr("class", "modal-status " + (type || ""));
}

function renderSelectedSongs() {
	$selectedSongsList.empty();

	selectedSongs.forEach(function (song) {
		const $chip = $("<div>").addClass("selected-song-chip");
		$("<span>").text(song.title).appendTo($chip);

		const $remove = $("<span>").addClass("remove-chip").text("\u00d7");
		$remove.on("click", function () {
			selectedSongs = selectedSongs.filter(function (s) {
				return s.id !== song.id;
			});
			renderSelectedSongs();
		});

		$chip.append($remove);
		$selectedSongsList.append($chip);
	});
}

function runPlaylistSongSearch(term) {
	if (!term) {
		$playlistSongSearchResults.removeClass("visible").empty();
		return;
	}

	SongsApi.search(term).done(function (data) {
		const results = (data.Items || []).filter(function (song) {
			return !selectedSongs.some(function (s) {
				return s.id === song.id;
			});
		});

		$playlistSongSearchResults.empty();

		if (results.length === 0) {
			$playlistSongSearchResults.append(
				'<div class="song-search-result-row">No matches.</div>',
			);
		} else {
			results.forEach(function (song) {
				const $row = $("<div>").addClass("song-search-result-row");
				$("<div>")
					.text(song.title || "Untitled")
					.appendTo($row);
				$("<div>")
					.addClass("song-search-result-artist")
					.text(song.artist || "Unknown artist")
					.appendTo($row);

				$row.on("click", function () {
					selectedSongs.push({
						id: song.id,
						title: song.title,
						artist: song.artist,
					});
					renderSelectedSongs();
					$playlistSongSearch.val("");
					$playlistSongSearchResults.removeClass("visible").empty();
				});

				$playlistSongSearchResults.append($row);
			});
		}

		$playlistSongSearchResults.addClass("visible");
	});
}

$playlistSongSearch.on("input", function () {
	const term = $(this).val().trim();
	clearTimeout(playlistSearchDebounce);
	playlistSearchDebounce = setTimeout(function () {
		runPlaylistSongSearch(term);
	}, 300);
});

$("#createPlaylistModal").on("show.bs.modal", function () {
	selectedSongs = [];
	renderSelectedSongs();
	$playlistNameInput.val("");
	$playlistSongSearch.val("");
	$playlistSongSearchResults.removeClass("visible").empty();
	setCreatePlaylistStatus("", "");
});

$submitCreatePlaylistBtn.on("click", async function () {
	const name = $playlistNameInput.val().trim();

	if (!name) {
		setCreatePlaylistStatus("Enter a playlist name.", "error");
		return;
	}

	$submitCreatePlaylistBtn.prop("disabled", true);
	setCreatePlaylistStatus("Creating playlist…", "ok");

	try {
		const createResponse = await PlaylistsApi.create({
			userId: session.sub,
			name,
		});

		const playlistId =
			createResponse.id || (createResponse.item && createResponse.item.id);

		if (!playlistId) {
			throw new Error("Playlist created but no id was returned.");
		}

		for (const song of selectedSongs) {
			setCreatePlaylistStatus(`Adding "${song.title}"…`, "ok");
			await PlaylistsApi.addSong({ id: playlistId, songId: song.id });
		}

		setCreatePlaylistStatus("Playlist created!", "ok");
		loadPlaylists();

		setTimeout(function () {
			bootstrap.Modal.getInstance(
				document.getElementById("createPlaylistModal"),
			).hide();
		}, 700);
	} catch (err) {
		console.error(err);
		const serverMessage =
			err.responseJSON?.message || err.statusText || err.message;
		setCreatePlaylistStatus(
			`Could not create playlist: ${serverMessage}`,
			"error",
		);
	} finally {
		$submitCreatePlaylistBtn.prop("disabled", false);
	}
});

$(document).on("click", function (e) {
	if (
		!$(e.target).closest("#playlistSongSearch, #playlistSongSearchResults")
			.length
	) {
		$playlistSongSearchResults.removeClass("visible");
	}
});

// ---- Sidebar: view/edit a playlist ----
let currentPlaylist = null;

$(document).on("click", ".playlist-item", function () {
	const playlistId = $(this).attr("data-id");
	openViewPlaylistModal(playlistId);
});

function openViewPlaylistModal(playlistId) {
	$("#playlistSongsList").html('<div class="empty-note">Loading songs…</div>');
	$("#playlistViewNameInput").val("");
	setViewPlaylistStatus("", "");

	const modal = new bootstrap.Modal(
		document.getElementById("viewPlaylistModal"),
	);
	modal.show();

	PlaylistsApi.getById(playlistId)
		.done(function (data) {
			currentPlaylist = data.Item;
			if (!currentPlaylist) {
				$("#playlistSongsList").html(
					'<div class="empty-note">Playlist not found.</div>',
				);
				return;
			}
			$("#playlistViewNameInput").val(currentPlaylist.name);
			renderPlaylistSongs();
		})
		.fail(function () {
			$("#playlistSongsList").html(
				'<div class="empty-note">Could not load playlist.</div>',
			);
		});
}

function setViewPlaylistStatus(message, type) {
	$("#viewPlaylistStatus")
		.text(message)
		.attr("class", "modal-status " + (type || ""));
}

function renderPlaylistSongs() {
	const $list = $("#playlistSongsList").empty();
	const songIds = currentPlaylist.songIds || [];

	if (songIds.length === 0) {
		$list.append(
			'<div class="empty-note">No songs yet — add some below.</div>',
		);
		return;
	}

	songIds.forEach(function (songId) {
		const song = getSongFromCache(songId);
		const $row = $("<div>").addClass("playlist-song-row");
		const $info = $("<div>");

		$("<div>")
			.addClass("playlist-song-row-title")
			.text(song ? song.title : "Unknown song")
			.appendTo($info);
		if (song) {
			$("<div>")
				.addClass("playlist-song-row-artist")
				.text(song.artist || "")
				.appendTo($info);
		}

		$row.append($info);

		$info.on("click", function () {
			if (song) playSongById(song.id);
		});

		const $remove = $("<span>").addClass("remove-chip").text("\u00d7");
		$remove.on("click", function (e) {
			e.stopPropagation();
			removeSongFromPlaylist(songId);
		});

		$row.append($remove);
		$list.append($row);
	});
}

$("#playlistViewNameInput").on("blur", function () {
	const newName = $(this).val().trim();
	if (!currentPlaylist || !newName || newName === currentPlaylist.name) return;

	PlaylistsApi.rename({ id: currentPlaylist.id, name: newName })
		.done(function () {
			currentPlaylist.name = newName;
			loadPlaylists();
		})
		.fail(function () {
			setViewPlaylistStatus("Could not rename playlist.", "error");
		});
});

function removeSongFromPlaylist(songId) {
	PlaylistsApi.removeSong({ id: currentPlaylist.id, songId })
		.done(function () {
			currentPlaylist.songIds = (currentPlaylist.songIds || []).filter(
				function (id) {
					return id !== songId;
				},
			);
			renderPlaylistSongs();
		})
		.fail(function () {
			setViewPlaylistStatus("Could not remove song.", "error");
		});
}

let viewPlaylistSearchDebounce = null;
const $playlistViewSongSearch = $("#playlistViewSongSearch");
const $playlistViewSongSearchResults = $("#playlistViewSongSearchResults");

$playlistViewSongSearch.on("input", function () {
	const term = $(this).val().trim();
	clearTimeout(viewPlaylistSearchDebounce);
	viewPlaylistSearchDebounce = setTimeout(function () {
		runViewPlaylistSongSearch(term);
	}, 300);
});

function runViewPlaylistSongSearch(term) {
	if (!term) {
		$playlistViewSongSearchResults.removeClass("visible").empty();
		return;
	}

	SongsApi.search(term).done(function (data) {
		const currentIds = currentPlaylist.songIds || [];
		const results = (data.Items || []).filter(function (song) {
			return currentIds.indexOf(song.id) === -1;
		});

		$playlistViewSongSearchResults.empty();

		if (results.length === 0) {
			$playlistViewSongSearchResults.append(
				'<div class="song-search-result-row">No matches.</div>',
			);
		} else {
			results.forEach(function (song) {
				const $row = $("<div>").addClass("song-search-result-row");
				$("<div>")
					.text(song.title || "Untitled")
					.appendTo($row);
				$("<div>")
					.addClass("song-search-result-artist")
					.text(song.artist || "Unknown artist")
					.appendTo($row);

				$row.on("click", function () {
					addSongToPlaylist(song);
				});

				$playlistViewSongSearchResults.append($row);
			});
		}

		$playlistViewSongSearchResults.addClass("visible");
	});
}

function addSongToPlaylist(song) {
	PlaylistsApi.addSong({ id: currentPlaylist.id, songId: song.id })
		.done(function () {
			currentPlaylist.songIds = currentPlaylist.songIds || [];
			currentPlaylist.songIds.push(song.id);
			renderPlaylistSongs();
			$playlistViewSongSearch.val("");
			$playlistViewSongSearchResults.removeClass("visible").empty();
		})
		.fail(function () {
			setViewPlaylistStatus("Could not add song.", "error");
		});
}

$("#deletePlaylistBtn").on("click", function () {
	if (!currentPlaylist) return;

	const confirmed = confirm(
		`Delete "${currentPlaylist.name}"? This cannot be undone.`,
	);
	if (!confirmed) return;

	PlaylistsApi.delete(currentPlaylist.id)
		.done(function () {
			bootstrap.Modal.getInstance(
				document.getElementById("viewPlaylistModal"),
			).hide();
			loadPlaylists();
		})
		.fail(function () {
			setViewPlaylistStatus("Could not delete playlist.", "error");
		});
});
