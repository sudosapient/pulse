const TIMEOUT_MS = Number(process.env.CHECK_TIMEOUT_MS || 10000);

export function startChecker(db, { tickMs = 5000 } = {}) {
  let running = false;

  async function tick() {
    if (running) return;
    running = true;
    try {
      const due = await db.dueMonitors();
      for (const monitor of due) {
        await runCheck(db, monitor);
      }
    } catch (err) {
      console.error("[checker] tick failed", err);
    } finally {
      running = false;
    }
  }

  const timer = setInterval(tick, tickMs);
  tick();
  return () => clearInterval(timer);
}

async function runCheck(db, monitor) {
  const started = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(monitor.url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "uptime-checker/1.0" },
    });
    clearTimeout(timeout);
    const latency_ms = Date.now() - started;
    const ok = res.status >= 200 && res.status < 400;
    await db.insertCheck({
      monitor_id: monitor.id,
      ok,
      status_code: res.status,
      latency_ms,
      error: ok ? null : `HTTP ${res.status}`,
    });
    console.log(
      `[checker] ${ok ? "UP" : "DOWN"} ${monitor.name} ${res.status} ${latency_ms}ms`
    );
  } catch (err) {
    const latency_ms = Date.now() - started;
    const message = err?.name === "AbortError" ? "timeout" : String(err?.message || err);
    await db.insertCheck({
      monitor_id: monitor.id,
      ok: false,
      status_code: null,
      latency_ms,
      error: message,
    });
    console.log(`[checker] DOWN ${monitor.name} ${message}`);
  }
}
