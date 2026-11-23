CREATE TABLE IF NOT EXISTS tank_advisors (id text PRIMARY KEY, profile jsonb NOT NULL, version integer NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS tank_topics (id text PRIMARY KEY, title text NOT NULL, status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','parked')));
CREATE TABLE IF NOT EXISTS tank_messages (seq bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, message_id text NOT NULL UNIQUE, speaker_id text NOT NULL, kind text NOT NULL CHECK (kind IN ('user','advisor','supervisor','system')), content text NOT NULL, topic_id text NOT NULL, origin text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS tank_controls (id integer PRIMARY KEY CHECK (id=1), paused boolean NOT NULL DEFAULT false, active_topic_id text NOT NULL DEFAULT 'the-room');
INSERT INTO tank_controls(id,paused,active_topic_id) VALUES(1,false,'the-room') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS tank_daily_budget(day date PRIMARY KEY, calls integer NOT NULL DEFAULT 0, max_calls integer NOT NULL DEFAULT 0 CHECK (max_calls>=0));
CREATE TABLE IF NOT EXISTS tank_sessions(id uuid PRIMARY KEY, topic_id text NOT NULL, status text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
