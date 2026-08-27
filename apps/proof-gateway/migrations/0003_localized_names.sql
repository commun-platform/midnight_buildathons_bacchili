ALTER TABLE projects ADD COLUMN name_ja TEXT;
ALTER TABLE projects ADD COLUMN organization_ja TEXT;
ALTER TABLE devices ADD COLUMN name_ja TEXT;
ALTER TABLE devices ADD COLUMN device_type_ja TEXT;

UPDATE projects
SET name = 'Measurement Data Authenticity',
    name_ja = '計測データ真贋性証明',
    organization = 'Measurement Environment',
    organization_ja = '計測環境'
WHERE id = 'measurement-authenticity-01';

UPDATE devices
SET name = 'Temperature Sensor',
    name_ja = '温度センサー',
    device_type = 'Edge Device',
    device_type_ja = 'Edge Device'
WHERE id = 'edge-temp-001'
  AND project_id = 'measurement-authenticity-01';
