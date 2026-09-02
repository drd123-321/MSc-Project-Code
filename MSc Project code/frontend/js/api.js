/**
 * Functions that operate on /songs API endpoint
 */
const SongsApi = {
	// General functions
	getByArtist(artistId) {
		return $.ajax({
			url: `${SONGS_API_BASE}/songs?artistId=${encodeURIComponent(artistId)}`,
			method: "GET",
		});
	},

	update(payload) {
		return $.ajax({
			url: `${SONGS_API_BASE}/songs`,
			method: "PUT",
			contentType: "application/json",
			data: JSON.stringify({ payload }),
		});
	},

	delete(songId) {
		return $.ajax({
			url: `${SONGS_API_BASE}/songs/${encodeURIComponent(songId)}`,
			method: "DELETE",
		});
	},

	getAll() {
		return $.ajax({
			url: `${SONGS_API_BASE}/songs`,
			method: "GET",
		});
	},

	// Functions for uploading songs
	getUploadUrl({ fileName, contentType }) {
		return $.ajax({
			url: `${SONGS_API_BASE}/songs`,
			method: "POST",
			contentType: "application/json",
			data: JSON.stringify({
				payload: {
					action: "getUploadUrl",
					fileName,
					contentType,
				},
			}),
		});
	},

	uploadFile(uploadUrl, file) {
		return $.ajax({
			url: uploadUrl,
			method: "PUT",
			contentType: file.type || "audio/mpeg",
			processData: false,
			data: file,
		});
	},

	create(payload) {
		return $.ajax({
			url: `${SONGS_API_BASE}/songs`,
			method: "POST",
			contentType: "application/json",
			data: JSON.stringify({ payload }),
		});
	},

	// Homepage functions
	search(term) {
		return $.ajax({
			url: `${SONGS_API_BASE}/songs?search=${encodeURIComponent(term)}`,
			method: "GET",
		});
	},

	getById(songId) {
		return $.ajax({
			url: `${SONGS_API_BASE}/songs/${encodeURIComponent(songId)}`,
			method: "GET",
		});
	},
};

/**
 * Functions that operate on /users API endpoint
 */
const UsersApi = {
	getById(sub) {
		return $.ajax({
			url: `${USERS_API_BASE}/users?id=${encodeURIComponent(sub)}`,
			method: "GET",
		});
	},

	update({ id, name, email }) {
		return $.ajax({
			url: `${USERS_API_BASE}/users`,
			method: "PUT",
			contentType: "application/json",
			data: JSON.stringify({ id, name, email }),
		});
	},

	sync({ sub, email, name, role }) {
		return $.ajax({
			url: `${USERS_API_BASE}/users`,
			method: "POST",
			contentType: "application/json",
			data: JSON.stringify({ sub, email, name, role }),
		});
	},
};

/**
 * Functions that operate on /playlists API endpoint
 */
const PlaylistsApi = {
	getByUser(userId) {
		return $.ajax({
			url: `${PLAYLISTS_API_BASE}/playlists?userId=${encodeURIComponent(userId)}`,
			method: "GET",
		});
	},

	getById(playlistId) {
		return $.ajax({
			url: `${PLAYLISTS_API_BASE}/playlists?id=${encodeURIComponent(playlistId)}`,
			method: "GET",
		});
	},

	create({ userId, name }) {
		return $.ajax({
			url: `${PLAYLISTS_API_BASE}/playlists`,
			method: "POST",
			contentType: "application/json",
			data: JSON.stringify({ userId, name }),
		});
	},

	rename({ id, name }) {
		return $.ajax({
			url: `${PLAYLISTS_API_BASE}/playlists`,
			method: "PUT",
			contentType: "application/json",
			data: JSON.stringify({ id, name }),
		});
	},

	addSong({ id, songId }) {
		return $.ajax({
			url: `${PLAYLISTS_API_BASE}/playlists`,
			method: "PUT",
			contentType: "application/json",
			data: JSON.stringify({ id, action: "addSong", songId }),
		});
	},

	removeSong({ id, songId }) {
		return $.ajax({
			url: `${PLAYLISTS_API_BASE}/playlists`,
			method: "PUT",
			contentType: "application/json",
			data: JSON.stringify({ id, action: "removeSong", songId }),
		});
	},

	delete(playlistId) {
		return $.ajax({
			url: `${PLAYLISTS_API_BASE}/playlists/${encodeURIComponent(playlistId)}`,
			method: "DELETE",
		});
	},
};
