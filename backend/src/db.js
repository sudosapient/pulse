import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL || "";

export async function createDb() {
  if (DATABASE_URL) return createPostgres();
  return createJsonStore();
}

async function createPostgres() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  await pool.query("SELECT 1");

  const candidates = [
    path.resolve(process.cwd(), "../db/init.sql"),
    path.resolve(process.cwd(), "schema.sql"),
  ];
  const schemaFile = candidates.find((p) => fs.existsSync(p));
  if (!schemaFile) throw new Error("Postgres schema file not found");
  await pool.query(fs.readFileSync(schemaFile, "utf8"));

  return {
    dialect: "postgres",
    async listMonitors() {
      const { rows } = await pool.query(
        `SELECT m.*,
                (SELECT ok FROM checks c WHERE c.monitor_id = m.id ORDER BY c.checked_at DESC LIMIT 1) AS last_ok,
                (SELECT status_code FROM checks c WHERE c.monitor_id = m.id ORDER BY c.checked_at DESC LIMIT 1) AS last_status_code,
                (SELECT latency_ms FROM checks c WHERE c.monitor_id = m.id ORDER BY c.checked_at DESC LIMIT 1) AS last_latency_ms,
                (SELECT checked_at FROM checks c WHERE c.monitor_id = m.id ORDER BY c.checked_at DESC LIMIT 1) AS last_checked_at,
                (SELECT error FROM checks c WHERE c.monitor_id = m.id ORDER BY c.checked_at DESC LIMIT 1) AS last_error
         FROM monitors m
         ORDER BY m.id ASC`
      );
      return rows.map(normalizeMonitor);
    },
    async createMonitor({ name, url, interval_sec }) {
      const { rows } = await pool.query(
        `INSERT INTO monitors (name, url, interval_sec)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [name, url, interval_sec]
      );
      return normalizeMonitor(rows[0]);
    },
    async deleteMonitor(id) {
      await pool.query(`DELETE FROM monitors WHERE id = $1`, [id]);
    },
    async listChecks(monitorId, limit = 50) {
      const { rows } = await pool.query(
        `SELECT * FROM checks
         WHERE monitor_id = $1
         ORDER BY checked_at DESC
         LIMIT $2`,
        [monitorId, limit]
      );
      return rows.map(normalizeCheck);
    },
    async dueMonitors() {
      const { rows } = await pool.query(
        `SELECT m.*
         FROM monitors m
         LEFT JOIN LATERAL (
           SELECT checked_at FROM checks c
           WHERE c.monitor_id = m.id
           ORDER BY checked_at DESC
           LIMIT 1
         ) last ON TRUE
         WHERE m.enabled = TRUE
           AND (
             last.checked_at IS NULL
             OR last.checked_at <= NOW() - make_interval(secs => m.interval_sec)
           )`
      );
      return rows.map(normalizeMonitor);
    },
    async insertCheck({ monitor_id, ok, status_code, latency_ms, error }) {
      const { rows } = await pool.query(
        `INSERT INTO checks (monitor_id, ok, status_code, latency_ms, error)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [monitor_id, ok, status_code, latency_ms, error]
      );
      return normalizeCheck(rows[0]);
    },
    async close() {
      await pool.end();
    },
  };
}

async function createJsonStore() {
  const file = process.env.JSON_DB_PATH || path.resolve(process.cwd(), "data.json");
  /** @type {{ monitors: any[], checks: any[], nextMonitorId: number, nextCheckId: number }} */
  let state = { monitors: [], checks: [], nextMonitorId: 1, nextCheckId: 1 };

  if (fs.existsSync(file)) {
    state = JSON.parse(fs.readFileSync(file, "utf8"));
  } else {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    persist();
  }

  function persist() {
    fs.writeFileSync(file, JSON.stringify(state, null, 2));
  }

  function withLast(monitor) {
    const last = state.checks
      .filter((c) => c.monitor_id === monitor.id)
      .sort((a, b) => String(b.checked_at).localeCompare(String(a.checked_at)))[0];
    return normalizeMonitor({
      ...monitor,
      last_ok: last ? last.ok : null,
      last_status_code: last ? last.status_code : null,
      last_latency_ms: last ? last.latency_ms : null,
      last_checked_at: last ? last.checked_at : null,
      last_error: last ? last.error : null,
    });
  }

  return {
    dialect: "json",
    async listMonitors() {
      return state.monitors.map(withLast);
    },
    async createMonitor({ name, url, interval_sec }) {
      const monitor = {
        id: state.nextMonitorId++,
        name,
        url,
        interval_sec,
        enabled: true,
        created_at: new Date().toISOString(),
      };
      state.monitors.push(monitor);
      persist();
      return withLast(monitor);
    },
    async deleteMonitor(id) {
      state.monitors = state.monitors.filter((m) => m.id !== id);
      state.checks = state.checks.filter((c) => c.monitor_id !== id);
      persist();
    },
    async listChecks(monitorId, limit = 50) {
      return state.checks
        .filter((c) => c.monitor_id === monitorId)
        .sort((a, b) => String(b.checked_at).localeCompare(String(a.checked_at)))
        .slice(0, limit)
        .map(normalizeCheck);
    },
    async dueMonitors() {
      const now = Date.now();
      return state.monitors
        .filter((m) => m.enabled)
        .filter((m) => {
          const last = state.checks
            .filter((c) => c.monitor_id === m.id)
            .sort((a, b) => String(b.checked_at).localeCompare(String(a.checked_at)))[0];
          if (!last) return true;
          return now - Date.parse(last.checked_at) >= m.interval_sec * 1000;
        })
        .map(normalizeMonitor);
    },
    async insertCheck({ monitor_id, ok, status_code, latency_ms, error }) {
      const row = {
        id: state.nextCheckId++,
        monitor_id,
        ok,
        status_code,
        latency_ms,
        error,
        checked_at: new Date().toISOString(),
      };
      state.checks.unshift(row);
      // keep last 500 checks overall
      state.checks = state.checks.slice(0, 500);
      persist();
      return normalizeCheck(row);
    },
    async close() {},
  };
}

function normalizeMonitor(row) {
  if (!row) return row;
  return {
    ...row,
    enabled: Boolean(row.enabled),
    last_ok: row.last_ok == null ? null : Boolean(row.last_ok),
    interval_sec: Number(row.interval_sec),
  };
}

function normalizeCheck(row) {
  if (!row) return row;
  return { ...row, ok: Boolean(row.ok) };
}
