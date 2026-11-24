ALTER TABLE tank_sessions ADD COLUMN IF NOT EXISTS runner_token uuid;
ALTER TABLE tank_sessions ADD COLUMN IF NOT EXISTS current_advisor_id text;
ALTER TABLE tank_sessions ADD COLUMN IF NOT EXISTS handoff_queue jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE tank_sessions ADD COLUMN IF NOT EXISTS turn_count integer NOT NULL DEFAULT 0;
ALTER TABLE tank_sessions ADD COLUMN IF NOT EXISTS stop_reason text;
ALTER TABLE tank_sessions ADD COLUMN IF NOT EXISTS trigger_seq bigint;
CREATE TABLE IF NOT EXISTS tank_inference_calls (
 id uuid PRIMARY KEY,
 session_id uuid NOT NULL,
 turn_index integer NOT NULL,
 advisor_id text NOT NULL,
 status text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(session_id,turn_index)
);
