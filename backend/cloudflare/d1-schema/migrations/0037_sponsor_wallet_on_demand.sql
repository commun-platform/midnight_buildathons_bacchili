CREATE TABLE sponsor_wallet_operating_schedule_v2 (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  mode TEXT NOT NULL CHECK (mode IN ('always-on', 'on-demand', 'scheduled')),
  time_zone_offset_minutes INTEGER NOT NULL
    CHECK (time_zone_offset_minutes BETWEEN -840 AND 840),
  opens_at_minute INTEGER NOT NULL
    CHECK (opens_at_minute BETWEEN 0 AND 1439),
  closes_at_minute INTEGER NOT NULL
    CHECK (closes_at_minute BETWEEN 0 AND 1439),
  processing_starts_at_minute INTEGER NOT NULL
    CHECK (processing_starts_at_minute BETWEEN 0 AND 1439),
  last_stopped_at TEXT,
  next_start_allowed_at TEXT,
  updated_at TEXT NOT NULL,
  CHECK (mode IN ('always-on', 'on-demand') OR opens_at_minute <> closes_at_minute)
);

INSERT INTO sponsor_wallet_operating_schedule_v2 (
  singleton_id, mode, time_zone_offset_minutes, opens_at_minute,
  closes_at_minute, processing_starts_at_minute, updated_at
)
SELECT singleton_id, mode, time_zone_offset_minutes, opens_at_minute,
       closes_at_minute, processing_starts_at_minute, updated_at
FROM sponsor_wallet_operating_schedule;

DROP TABLE sponsor_wallet_operating_schedule;

ALTER TABLE sponsor_wallet_operating_schedule_v2
  RENAME TO sponsor_wallet_operating_schedule;
