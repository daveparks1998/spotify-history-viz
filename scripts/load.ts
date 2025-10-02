import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

// Minimal shapes from Spotify exports we'll support initially
// We normalize to a common schema for the `plays` table

type NormalizedPlay = {
	played_at: string; // ISO UTC
	track_name: string;
	artist_name: string;
	album_name: string;
	ms_played: number;
	uri: string;
	context: string | null;
	platform: string | null;
	year: number;
	month: number;
	day: number;
};

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'data', 'spotify');
const DB_PATH = path.join(ROOT, 'data', 'db.sqlite');

function ensureDir(dir: string) {
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
}

function toUTCISOString(dateStr: string): string | null {
	const d = new Date(dateStr);
	const t = d.getTime();
	if (Number.isNaN(t)) return null;
	return new Date(t).toISOString();
}

function ymd(iso: string): { year: number; month: number; day: number } {
	const d = new Date(iso);
	return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function normalizeRecord(rec: any): NormalizedPlay | null {
	// Supports multiple export shapes
	// Endsongs / StreamingHistoryV2 style
	let playedAt: string | null = null;
	let track: string = '';
	let artist: string = '';
	let album: string = '';
	let ms: number = 0;
	let uri: string = '';
	let context: string | null = null;
	let platform: string | null = null;

	if (rec.endTime && rec.msPlayed != null) {
		// Old StreamingHistory style: endTime is local date string like "2024-01-31 23:59"
		const guess = rec.endTime.replace(' ', 'T') + ':00Z';
		playedAt = toUTCISOString(guess);
		track = rec.trackName || rec.track || rec.master_metadata_track_name || '';
		artist = rec.artistName || rec.artist || rec.master_metadata_album_artist_name || rec.master_metadata_artist_name || '';
		album = rec.albumName || rec.master_metadata_album_album_name || '';
		ms = Number(rec.msPlayed ?? 0);
		uri = rec.spotifyTrackUri || rec.trackUri || rec.spotify_track_uri || '';
		context = rec.context || rec.reason_start || null;
		platform = rec.platform || null;
	} else if (rec.ts && rec.ms_played != null) {
		// Endsongs style
		playedAt = toUTCISOString(rec.ts);
		track = rec.master_metadata_track_name || rec.track || '';
		artist = rec.master_metadata_album_artist_name || rec.master_metadata_artist_name || rec.artist || '';
		album = rec.master_metadata_album_album_name || rec.album || '';
		ms = Number(rec.ms_played ?? 0);
		uri = rec.spotify_track_uri || rec.track_uri || '';
		context = rec.conn_country || rec.reason_start || null;
		platform = rec.platform || null;
	} else if (rec.trackName && rec.artistName && rec.endTime) {
		// Another common variant
		const guess = rec.endTime.replace(' ', 'T') + ':00Z';
		playedAt = toUTCISOString(guess);
		track = rec.trackName;
		artist = rec.artistName;
		album = rec.albumName || '';
		ms = Number(rec.msPlayed ?? 0);
		uri = rec.spotifyTrackUri || '';
		context = rec.context || null;
		platform = rec.platform || null;
	}

	if (!playedAt) return null;
	if (!track && !artist) return null;
	const { year, month, day } = ymd(playedAt);
	return {
		played_at: playedAt,
		track_name: String(track || '').trim(),
		artist_name: String(artist || '').trim(),
		album_name: String(album || '').trim(),
		ms_played: Math.max(0, Math.floor(ms || 0)),
		uri: String(uri || '').trim(),
		context: context ? String(context).trim() : null,
		platform: platform ? String(platform).trim() : null,
		year,
		month,
		day,
	};
}

function* readJsonFiles(dir: string): Generator<any> {
	const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.json'));
	for (const file of files) {
		const full = path.join(dir, file);
		const content = fs.readFileSync(full, 'utf-8');
		try {
			const json = JSON.parse(content);
			if (Array.isArray(json)) {
				for (const rec of json) yield rec;
			} else if (Array.isArray(json?.payload)) {
				for (const rec of json.payload) yield rec;
			} else {
				yield json;
			}
		} catch (e) {
			console.error('Failed to parse', full, e);
		}
	}
}

function openDb(filePath: string) {
	ensureDir(path.dirname(filePath));
	const db = new Database(filePath);
	db.pragma('journal_mode = WAL');
	db.exec(`
		CREATE TABLE IF NOT EXISTS plays (
			id INTEGER PRIMARY KEY,
			played_at TEXT NOT NULL,
			track_name TEXT NOT NULL,
			artist_name TEXT NOT NULL,
			album_name TEXT NOT NULL,
			ms_played INTEGER NOT NULL,
			uri TEXT,
			context TEXT,
			platform TEXT,
			year INTEGER NOT NULL,
			month INTEGER NOT NULL,
			day INTEGER NOT NULL
		);
		CREATE UNIQUE INDEX IF NOT EXISTS ux_plays_unique ON plays(played_at, track_name, artist_name, ms_played);
		CREATE INDEX IF NOT EXISTS ix_plays_played_at ON plays(played_at);
		CREATE INDEX IF NOT EXISTS ix_plays_artist ON plays(artist_name);
		CREATE INDEX IF NOT EXISTS ix_plays_track ON plays(track_name);
	`);
	return db;
}

function main() {
	ensureDir(DATA_DIR);
	const db = openDb(DB_PATH);
	const insert = db.prepare(`
		INSERT OR IGNORE INTO plays (
			played_at, track_name, artist_name, album_name, ms_played, uri, context, platform, year, month, day
		) VALUES (
			@played_at, @track_name, @artist_name, @album_name, @ms_played, @uri, @context, @platform, @year, @month, @day
		);
	`);

	let seen = 0;
	let inserted = 0;
	let skipped = 0;

	for (const rec of readJsonFiles(DATA_DIR)) {
		seen++;
		const norm = normalizeRecord(rec);
		if (!norm) { skipped++; continue; }
		// Optional quality filter: skip very short plays < 30s
		if (norm.ms_played < 30_000) { skipped++; continue; }
		const info = insert.run(norm);
		if (info.changes > 0) inserted++; else skipped++;
	}

	console.log(`Processed ${seen} records. Inserted ${inserted}. Skipped ${skipped}.`);
}

if (require.main === module) {
	main();
}

