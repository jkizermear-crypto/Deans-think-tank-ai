ALTER TABLE tank_controls ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1;
ALTER TABLE tank_sessions ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'live';
ALTER TABLE tank_sessions ADD COLUMN IF NOT EXISTS request_key text;
ALTER TABLE tank_sessions ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT now() + interval '3 hours';
ALTER TABLE tank_sessions ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE tank_sessions ADD COLUMN IF NOT EXISTS summary text;
CREATE UNIQUE INDEX IF NOT EXISTS tank_sessions_request_key ON tank_sessions(request_key);
ALTER TABLE tank_messages ADD COLUMN IF NOT EXISTS session_id text;
ALTER TABLE tank_messages ADD COLUMN IF NOT EXISTS imported_from text;
CREATE TABLE IF NOT EXISTS tank_operations (key text PRIMARY KEY, request_hash text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS tank_profile_history (id uuid PRIMARY KEY, advisor_id text NOT NULL, version integer NOT NULL, profile jsonb NOT NULL, reason text NOT NULL, source_message_ids jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(advisor_id,version));
INSERT INTO tank_profile_history(id,advisor_id,version,profile,reason,source_message_ids) SELECT gen_random_uuid(),id,version,profile,'Existing Netlify perspective preserved during room consolidation','[]'::jsonb FROM tank_advisors ON CONFLICT(advisor_id,version) DO NOTHING;
CREATE TABLE IF NOT EXISTS tank_artifacts (id text NOT NULL, version integer NOT NULL, title text NOT NULL, kind text NOT NULL, content text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(id,version));

UPDATE tank_sessions SET expires_at=created_at+interval '1 minute' WHERE request_key IS NULL AND kind='live';
UPDATE tank_sessions SET status='cancelled',updated_at=now() WHERE status='running' AND expires_at<=now();
