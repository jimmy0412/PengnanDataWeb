async function request(url, options) {
  const response = await fetch(url, options);
  const payload = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.detail || `操作失敗（${response.status}）`);
  return payload;
}

export const api = {
  status: () => request("/api/status"),
  geojson: () => request("/static/data/geo/pengnan.geojson"),
  villageData: (year) => request(`/api/map-village-data?year=${encodeURIComponent(year)}`),
  layers: () => request("/api/v2/map-layers"),
  upload: (form) => request("/api/v2/map-layers", { method: "POST", body: form }),
  fromData: (body) => request("/api/v2/map-layers/from-data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  remove: (id) => request(`/api/v2/map-layers/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
