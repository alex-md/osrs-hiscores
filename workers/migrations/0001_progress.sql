-- Packed daily shards keep 5,000 players well below per-player/tick write volume.
CREATE TABLE IF NOT EXISTS progress_days (
  day TEXT PRIMARY KEY,
  captured_at INTEGER NOT NULL,
  generation TEXT NOT NULL,
  summary TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS progress_players (
  day TEXT NOT NULL,
  shard INTEGER NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (day, shard)
);
