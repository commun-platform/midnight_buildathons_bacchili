ALTER TABLE sponsor_wallet_operating_schedule
  ADD COLUMN processing_starts_at_minute INTEGER
  CHECK (processing_starts_at_minute BETWEEN 0 AND 1439);

UPDATE sponsor_wallet_operating_schedule
SET processing_starts_at_minute = opens_at_minute
WHERE processing_starts_at_minute IS NULL;
