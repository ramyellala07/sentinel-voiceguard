-- Sentinel tables — paste into Supabase Dashboard → SQL Editor → Run.
-- RLS is enabled; a backend uses the SERVICE_ROLE key (bypasses RLS),
-- so no permissive policies are needed. Add policies later only if the
-- frontend must read Supabase directly with the anon key.

create table if not exists incidents (
  id uuid primary key default gen_random_uuid(),
  incident_code text unique,            -- e.g. INC-2026-0413 (human readable)
  type text not null default 'Manual',
  caller text not null default 'Unknown',
  risk int not null default 50 check (risk between 0 and 100),
  method text default 'Operator',
  action text default 'Logged',
  status text not null default 'Under Review',
  created_at timestamptz not null default now()
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  event_code text unique,               -- e.g. EVT-9841
  time text,                            -- display time (IST string from backend)
  caller text default 'Unknown',
  speaker_match text default '-',
  ai_detection text default '-',
  risk_score int default 0,
  context text default '',
  action text default '-',
  status text default 'SAFE',
  created_at timestamptz not null default now()
);

create table if not exists speakers (
  id text primary key,                  -- e.g. SPK-001
  name text not null,
  threshold int not null default 75,
  samples int not null default 0,
  enrolled_on date,
  embedding jsonb,                      -- 192-d ECAPA vector when enrolled
  created_at timestamptz not null default now()
);

-- Mirrors the Supabase tables used by the current FastAPI backend
-- (store.py), in case logs/reports move between projects.
create table if not exists logs (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,             -- e.g. 9e4dda694f1f
  ai_confidence numeric not null,       -- Wav2Vec2 AI probability 0-100
  fingerprint_match boolean not null,   -- ECAPA True/False
  label text,                           -- genuine | suspicious | synthetic
  similarity numeric,
  file text,
  created_at timestamptz not null default now()
);

create table if not exists reports (
  key text primary key,                 -- safe | medium | high
  title text not null,
  level text not null,                  -- LOW | MEDIUM | HIGH
  summary text,
  text text not null,
  recommendation text
);

insert into reports (key, title, level, summary, text, recommendation) values
  ('safe', 'SAFE — Genuine Voice Report', 'LOW',
   'The caller''s voice shows natural human speech characteristics.',
   'Voice authenticity check PASSED. The audio contains natural prosody variation, normal breathing pauses and room-noise artefacts consistent with a live human speaker.',
   'ALLOW — no further action required.'),
  ('medium', 'MEDIUM RISK — Unverified Voice Report', 'MEDIUM',
   'Mixed signals: partly natural speech with segments that could not be verified.',
   'Voice authenticity check is INCONCLUSIVE. Issue a dynamic challenge phrase and re-verify before proceeding with any sensitive request.',
   'CHALLENGE — verify with a dynamic phrase before proceeding.'),
  ('high', 'HIGH RISK — Likely Bot / Cloned Voice Report', 'HIGH',
   'Strong indicators of AI-generated or cloned speech.',
   'Voice authenticity check FAILED. Vocoder-like flat prosody with missing breathing artefacts. Block the call, preserve the recording, and alert the security team.',
   'BLOCK — preserve recording and alert the security team.')
on conflict (key) do nothing;

alter table incidents enable row level security;
alter table events    enable row level security;
alter table speakers  enable row level security;
alter table logs      enable row level security;
alter table reports   enable row level security;

create index if not exists idx_incidents_risk on incidents (risk desc);
create index if not exists idx_events_created on events (created_at desc);
create index if not exists idx_logs_session on logs (session_id);
create index if not exists idx_logs_created on logs (created_at desc);
