import { barLayout, colorForSeries, globalDomain, pieSize } from "./visualization";

const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
function polar(center, radius, angle) { const radians = (angle - 90) * Math.PI / 180; return [center + radius * Math.cos(radians), center + radius * Math.sin(radians)]; }
function arc(center, radius, start, end, inner = 0) {
  const a = polar(center, radius, start), b = polar(center, radius, end), large = end - start > 180 ? 1 : 0;
  if (!inner) return `M${center},${center} L${a} A${radius},${radius} 0 ${large} 1 ${b} Z`;
  const c = polar(center, inner, end), d = polar(center, inner, start);
  return `M${a} A${radius},${radius} 0 ${large} 1 ${b} L${c} A${inner},${inner} 0 ${large} 0 ${d} Z`;
}
export function chartHtml(layer, village, baseSize) {
  const row = layer.values?.[village] || {}, values = layer.series.map((series) => Number(row[series.id]) || 0), type = layer.visualization.type;
  if (type === "bar") {
    const size = baseSize, layout = barLayout(values, globalDomain(layer), size);
    const bars = layout.bars.map((bar, index) => `<rect x="${bar.x}" y="${bar.y}" width="${bar.width}" height="${bar.height}" rx="1.5" fill="${colorForSeries(layer.series[index], index)}"><title>${escape(layer.series[index].name)}：${escape(bar.value)}</title></rect>`).join("");
    return { size, html: `<svg viewBox="0 0 ${size} ${size}" aria-label="${escape(village)} ${escape(layer.name)}"><line x1="0" y1="${layout.zero}" x2="${size}" y2="${layout.zero}" stroke="#111827" stroke-width="1"/>${bars}</svg>` };
  }
  const totals = Object.values(layer.values || {}).map((entry) => Object.values(entry).reduce((sum, value) => sum + value, 0)), total = values.reduce((sum, value) => sum + value, 0), size = pieSize(total, Math.max(0, ...totals), baseSize);
  if (!size) return { size: baseSize * 0.42, html: `<span class="map-no-data" aria-label="${escape(village)} 無資料">無資料</span>` };
  const center = size / 2, radius = size * 0.47, inner = type === "donut" ? radius * 0.48 : 0;
  let angle = 0;
  const paths = values.map((value, index) => { if (!value) return ""; const start = angle; angle += value / total * 360; if (value === total) return inner ? `<circle cx="${center}" cy="${center}" r="${(radius + inner) / 2}" fill="none" stroke="${colorForSeries(layer.series[index], index)}" stroke-width="${radius - inner}"/>` : `<circle cx="${center}" cy="${center}" r="${radius}" fill="${colorForSeries(layer.series[index], index)}"/>`; return `<path d="${arc(center, radius, start, angle, inner)}" fill="${colorForSeries(layer.series[index], index)}" stroke="#fff"><title>${escape(layer.series[index].name)}：${escape(value)}</title></path>`; }).join("");
  return { size, html: `<svg viewBox="0 0 ${size} ${size}" aria-label="${escape(village)} ${escape(layer.name)}">${paths}</svg>` };
}
