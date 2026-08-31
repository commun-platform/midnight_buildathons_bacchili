PRAGMA foreign_keys = ON;

DELETE FROM projects
WHERE id <> 'measurement-authenticity-01'
  AND name = '広域水道施設 センサー監視実証';

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
