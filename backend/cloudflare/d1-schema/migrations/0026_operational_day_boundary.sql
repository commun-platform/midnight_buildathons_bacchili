PRAGMA foreign_keys = ON;

-- Projects define the civil-time boundary used when new immutable Policy
-- Assignments are registered. Existing Wave 1 deployments used UTC midnight.
ALTER TABLE projects ADD COLUMN time_zone_offset_minutes INTEGER NOT NULL DEFAULT 0
  CHECK (time_zone_offset_minutes BETWEEN -840 AND 840);
ALTER TABLE projects ADD COLUMN local_day_start_hour INTEGER NOT NULL DEFAULT 0
  CHECK (local_day_start_hour BETWEEN 0 AND 23);

UPDATE projects
SET timezone = 'UTC'
WHERE time_zone_offset_minutes = 0 AND local_day_start_hour = 0;

-- D1 mirrors the boundary that is authoritative in the on-chain assignment.
ALTER TABLE policy_assignments ADD COLUMN time_zone_offset_minutes INTEGER NOT NULL DEFAULT 0
  CHECK (time_zone_offset_minutes BETWEEN -840 AND 840);
ALTER TABLE policy_assignments ADD COLUMN local_day_start_hour INTEGER NOT NULL DEFAULT 0
  CHECK (local_day_start_hour BETWEEN 0 AND 23);
ALTER TABLE policy_assignments ADD COLUMN utc_day_start_minute INTEGER NOT NULL DEFAULT 0
  CHECK (utc_day_start_minute BETWEEN 0 AND 1439);
