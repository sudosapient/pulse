const API_BASE = import.meta.env.VITE_API_BASE || "";

async function request(path, options) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "content-type": "application/json", ...(options?.headers || {}) },
    ...options,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `request failed (${res.status})`);
  return data;
}

export const api = {
  listMonitors: () => request("/api/monitors"),
  createMonitor: (body) =>
    request("/api/monitors", { method: "POST", body: JSON.stringify(body) }),
  deleteMonitor: (id) => request(`/api/monitors/${id}`, { method: "DELETE" }),
  listChecks: (id) => request(`/api/monitors/${id}/checks`),
};
