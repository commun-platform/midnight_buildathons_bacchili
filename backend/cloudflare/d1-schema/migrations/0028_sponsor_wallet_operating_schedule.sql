CREATE TABLE sponsor_wallet_operating_schedule (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  mode TEXT NOT NULL CHECK (mode IN ('always-on', 'scheduled')),
  time_zone_offset_minutes INTEGER NOT NULL
    CHECK (time_zone_offset_minutes BETWEEN -840 AND 840),
  opens_at_minute INTEGER NOT NULL
    CHECK (opens_at_minute BETWEEN 0 AND 1439),
  closes_at_minute INTEGER NOT NULL
    CHECK (closes_at_minute BETWEEN 0 AND 1439),
  updated_at TEXT NOT NULL,
  CHECK (mode = 'always-on' OR opens_at_minute <> closes_at_minute)
);

-- Judging requires immediate availability. Operations can switch this row to
-- `scheduled` without deploying or restarting the Worker. The retained
-- scheduled profile is 02:00-06:00 JST (UTC+09:00).
INSERT INTO sponsor_wallet_operating_schedule (
  singleton_id, mode, time_zone_offset_minutes,
  opens_at_minute, closes_at_minute, updated_at
) VALUES (1, 'always-on', 540, 120, 360, datetime('now'));
