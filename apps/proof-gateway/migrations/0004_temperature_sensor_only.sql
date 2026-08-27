PRAGMA foreign_keys = ON;

DELETE FROM readings
WHERE project_id = 'measurement-authenticity-01';

DELETE FROM attestations
WHERE project_id = 'measurement-authenticity-01';

DELETE FROM devices
WHERE project_id = 'measurement-authenticity-01'
  AND id <> 'edge-temp-001';

UPDATE projects
SET name = 'Measurement Data Authenticity',
    name_ja = '計測データ真贋性証明',
    organization = 'Measurement Environment',
    organization_ja = '計測環境',
    expected_interval_minutes = 1
WHERE id = 'measurement-authenticity-01';

UPDATE devices
SET name = 'Temperature Sensor',
    name_ja = '温度センサー',
    device_type = 'Edge Device',
    device_type_ja = 'Edge Device',
    sensor_type = 'temperature',
    unit = '°C',
    expected_interval_minutes = 1,
    normal_min = 10,
    normal_max = 35,
    last_seen_at = NULL
WHERE id = 'edge-temp-001'
  AND project_id = 'measurement-authenticity-01';
