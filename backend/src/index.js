import cors from "cors";
import express from "express";
import { createDb } from "./db.js";
import { startChecker } from "./checker.js";

const PORT = Number(process.env.PORT || 4000);

const app = express();
app.use(cors());
app.use(express.json());

const db = await createDb();
console.log(`[db] dialect=${db.dialect}`);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "uptime-checker-backend", dialect: db.dialect });
});

app.get("/api/monitors", async (_req, res) => {
  try {
    res.json(await db.listMonitors());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "failed to list monitors" });
  }
});

app.post("/api/monitors", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const url = String(req.body?.url || "").trim();
    const interval_sec = Number(req.body?.interval_sec || 60);

    if (!name || !url) {
      return res.status(400).json({ error: "name and url are required" });
    }
    try {
      // validate absolute URL
      new URL(url);
    } catch {
      return res.status(400).json({ error: "url must be absolute (https://...)" });
    }
    if (!Number.isFinite(interval_sec) || interval_sec < 15) {
      return res.status(400).json({ error: "interval_sec must be >= 15" });
    }

    const monitor = await db.createMonitor({ name, url, interval_sec });
    res.status(201).json(monitor);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "failed to create monitor" });
  }
});

app.delete("/api/monitors/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });
    await db.deleteMonitor(id);
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "failed to delete monitor" });
  }
});

app.get("/api/monitors/:id/checks", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });
    res.json(await db.listChecks(id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "failed to list checks" });
  }
});

const stopChecker = startChecker(db);

const server = app.listen(PORT, () => {
  console.log(`[backend] listening on :${PORT}`);
});

async function shutdown() {
  stopChecker();
  server.close();
  await db.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
