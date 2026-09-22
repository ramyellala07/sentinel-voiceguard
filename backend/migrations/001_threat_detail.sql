-- 001: threat-detail columns on events (run once in SQL Editor).
-- Additive only: safe to run even with existing rows (all nullable).
alter table events add column if not exists session_id text;
alter table events add column if not exists voice_score numeric;
alter table events add column if not exists speaker_score numeric;
alter table events add column if not exists context_score numeric;
alter table events add column if not exists behavioral_score numeric;
alter table events add column if not exists decision text;
alter table events add column if not exists reasons jsonb;
