PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  organization TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  expected_interval_minutes INTEGER NOT NULL DEFAULT 1 CHECK (expected_interval_minutes > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  device_type TEXT NOT NULL,
  sensor_type TEXT NOT NULL,
  unit TEXT NOT NULL,
  expected_interval_minutes INTEGER NOT NULL DEFAULT 1 CHECK (expected_interval_minutes > 0),
  normal_min REAL,
  normal_max REAL,
  last_seen_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attestations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  period_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'aggregating', 'proving', 'submitted', 'confirmed', 'failed')
  ),
  sample_count INTEGER NOT NULL DEFAULT 0,
  expected_count INTEGER NOT NULL DEFAULT 0,
  missing_count INTEGER NOT NULL DEFAULT 0,
  outlier_count INTEGER NOT NULL DEFAULT 0,
  merkle_root TEXT,
  device_commitment TEXT,
  register_tx_id TEXT,
  register_block_height TEXT,
  verify_tx_id TEXT,
  verify_block_height TEXT,
  verification_result INTEGER CHECK (verification_result IN (0, 1)),
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(project_id, period_date)
);

CREATE TABLE IF NOT EXISTS readings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  sensor_type TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  local_date TEXT NOT NULL,
  is_outlier INTEGER NOT NULL DEFAULT 0 CHECK (is_outlier IN (0, 1)),
  attestation_id TEXT REFERENCES attestations(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS readings_project_recorded
  ON readings(project_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS readings_device_recorded
  ON readings(device_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS readings_project_local_date
  ON readings(project_id, local_date);
CREATE INDEX IF NOT EXISTS attestations_project_period
  ON attestations(project_id, period_date DESC);

INSERT OR IGNORE INTO projects (
  id, name, organization, timezone, expected_interval_minutes
) VALUES (
  'measurement-authenticity-01',
  'Measurement Data Authenticity',
  'Measurement Environment',
  'Asia/Tokyo',
  1
);

INSERT OR IGNORE INTO devices (
  id, project_id, name, device_type, sensor_type, unit,
  expected_interval_minutes, normal_min, normal_max
) VALUES
  ('edge-temp-001', 'measurement-authenticity-01', 'Temperature Sensor', 'Edge Device', 'temperature', '°C', 1, 10, 35);
