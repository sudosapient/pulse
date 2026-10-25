-- Shared schema for the uptime-checker Postgres service.
CREATE TABLE IF NOT EXISTS monitors (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  url           TEXT NOT NULL,
  interval_sec  INTEGER NOT NULL DEFAULT 60 CHECK (interval_sec >= 15),
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS checks (
  id            BIGSERIAL PRIMARY KEY,
  monitor_id    INTEGER NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  ok            BOOLEAN NOT NULL,
  status_code   INTEGER,
  latency_ms    INTEGER,
  error         TEXT,
  checked_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS checks_monitor_checked_at_idx
  ON checks (monitor_id, checked_at DESC);
