import { useEffect, useState } from "react";
import { api } from "./api.js";

function statusLabel(monitor) {
  if (monitor.last_ok == null) return { text: "waiting", tone: "muted" };
  return monitor.last_ok
    ? { text: "up", tone: "up" }
    : { text: "down", tone: "down" };
}

function formatWhen(value) {
  if (!value) return "—";
  const d = new Date(String(value).includes("T") ? value : `${value}Z`);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

export default function App() {
  const [monitors, setMonitors] = useState([]);
  const [selected, setSelected] = useState(null);
  const [checks, setChecks] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    url: "https://example.com",
    interval_sec: 60,
  });

  async function refresh() {
    try {
      const rows = await api.listMonitors();
      setMonitors(rows);
      setError("");
      if (selected) {
        const still = rows.find((m) => m.id === selected.id);
        setSelected(still || null);
        if (still) setChecks(await api.listChecks(still.id));
      }
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, []);

  async function onCreate(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.createMonitor({
        name: form.name,
        url: form.url,
        interval_sec: Number(form.interval_sec),
      });
      setForm((f) => ({ ...f, name: "" }));
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id) {
    setBusy(true);
    try {
      await api.deleteMonitor(id);
      if (selected?.id === id) {
        setSelected(null);
        setChecks([]);
      }
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onSelect(monitor) {
    setSelected(monitor);
    try {
      setChecks(await api.listChecks(monitor.id));
    } catch (err) {
      setError(err.message);
    }
  }

  const upCount = monitors.filter((m) => m.last_ok === true).length;
  const downCount = monitors.filter((m) => m.last_ok === false).length;

  return (
    <div className="page">
      <header className="top">
        <div>
          <p className="brand">Pulse</p>
          <h1>Uptime board</h1>
        </div>
        <div className="stats">
          <span>
            <strong>{monitors.length}</strong> monitors
          </span>
          <span className="up">
            <strong>{upCount}</strong> up
          </span>
          <span className="down">
            <strong>{downCount}</strong> down
          </span>
        </div>
      </header>

      {error ? <p className="banner">{error}</p> : null}

      <section className="panel">
        <h2>Add monitor</h2>
        <form className="form" onSubmit={onCreate}>
          <label>
            Name
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Marketing site"
              required
            />
          </label>
          <label>
            URL
            <input
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://..."
              required
            />
          </label>
          <label>
            Interval (sec)
            <input
              type="number"
              min={15}
              value={form.interval_sec}
              onChange={(e) => setForm({ ...form, interval_sec: e.target.value })}
              required
            />
          </label>
          <button type="submit" disabled={busy}>
            Add
          </button>
        </form>
      </section>

      <section className="panel">
        <h2>Monitors</h2>
        {monitors.length === 0 ? (
          <p className="empty">No monitors yet. Add one above.</p>
        ) : (
          <ul className="list">
            {monitors.map((m) => {
              const status = statusLabel(m);
              return (
                <li key={m.id} className={selected?.id === m.id ? "active" : ""}>
                  <button type="button" className="row" onClick={() => onSelect(m)}>
                    <span className={`dot ${status.tone}`} />
                    <span className="meta">
                      <span className="name">{m.name}</span>
                      <span className="url">{m.url}</span>
                    </span>
                    <span className={`badge ${status.tone}`}>{status.text}</span>
                    <span className="latency">
                      {m.last_latency_ms != null ? `${m.last_latency_ms}ms` : "—"}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => onDelete(m.id)}
                    disabled={busy}
                  >
                    Delete
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2>{selected ? `Checks · ${selected.name}` : "Checks"}</h2>
        {!selected ? (
          <p className="empty">Select a monitor to see recent checks.</p>
        ) : checks.length === 0 ? (
          <p className="empty">Waiting for first check…</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Status</th>
                <th>Code</th>
                <th>Latency</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((c) => (
                <tr key={c.id}>
                  <td>{formatWhen(c.checked_at)}</td>
                  <td className={c.ok ? "up" : "down"}>{c.ok ? "up" : "down"}</td>
                  <td>{c.status_code ?? "—"}</td>
                  <td>{c.latency_ms != null ? `${c.latency_ms}ms` : "—"}</td>
                  <td>{c.error || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
