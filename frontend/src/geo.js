export function normalizeVillageName(value) { return String(value || "").replace(/[\[\]]/g, "").trim(); }
export function villageName(feature) { return normalizeVillageName(feature?.properties?.VILLNAME) || "未知地區"; }
export function villageKey(feature) { return String(feature?.properties?.VILLCODE || villageName(feature)); }

export function pointInRing(point, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const a = ring[index], b = ring[previous];
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function pointInPolygon(point, polygon) { return pointInRing(point, polygon[0]) && !polygon.slice(1).some((hole) => pointInRing(point, hole)); }
function centroid(ring) {
  let area = 0, x = 0, y = 0;
  for (let i = 0; i < ring.length; i += 1) { const a = ring[i], b = ring[(i + 1) % ring.length], cross = a[0] * b[1] - b[0] * a[1]; area += cross; x += (a[0] + b[0]) * cross; y += (a[1] + b[1]) * cross; }
  return Math.abs(area) < Number.EPSILON ? null : [x / (3 * area), y / (3 * area)];
}
function scanline(polygon, preferred) {
  const ring = polygon[0], ys = ring.map((point) => point[1]), min = Math.min(...ys), max = Math.max(...ys);
  for (const y of [preferred, (min + max) / 2, min * 0.25 + max * 0.75, min * 0.75 + max * 0.25]) {
    const xs = [];
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1])); }
    xs.sort((a, b) => a - b);
    const candidates = [];
    for (let i = 0; i + 1 < xs.length; i += 2) candidates.push({ point: [(xs[i] + xs[i + 1]) / 2, y], width: xs[i + 1] - xs[i] });
    const valid = candidates.filter(({ point }) => pointInPolygon(point, polygon)).sort((a, b) => b.width - a.width);
    if (valid[0]) return valid[0].point;
  }
  return null;
}
export function featureInteriorPoint(feature) {
  const geometry = feature?.geometry, polygons = geometry?.type === "Polygon" ? [geometry.coordinates] : geometry?.type === "MultiPolygon" ? geometry.coordinates : [];
  const candidates = polygons.filter((polygon) => polygon?.[0]?.length >= 3).map((polygon) => ({ polygon, center: centroid(polygon[0]), area: Math.abs(polygon[0].reduce((sum, a, i, ring) => { const b = ring[(i + 1) % ring.length]; return sum + a[0] * b[1] - b[0] * a[1]; }, 0)) })).sort((a, b) => b.area - a.area);
  if (!candidates[0]) return null;
  const { polygon, center } = candidates[0], point = center && pointInPolygon(center, polygon) ? center : scanline(polygon, center?.[1]);
  return point?.every(Number.isFinite) ? [point[1], point[0]] : null;
}
