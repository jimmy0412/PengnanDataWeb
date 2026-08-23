import { scaleLinear } from "d3-scale";

export const DEFAULT_VILLAGE_COLORS = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b", "#e377c2"];
export const DEFAULT_SERIES_COLORS = ["#0072B2", "#D55E00", "#009E73", "#CC79A7", "#E69F00", "#56B4E9", "#F0E442"];
export const DEFAULT_MAP_BACKGROUND_COLOR = "#aad3df";
export const DEFAULT_CHOROPLETH_COLORS = ["#ffffb2", "#fecc5c", "#fd8d3c", "#f03b20", "#bd0026"];
const LEGACY_CHOROPLETH_COLORS = ["#eff3ff", "#bdd7e7", "#6baed6", "#3182bd", "#08519c"];
export const NO_DATA_COLOR = "#cbd5e1";

const numberFormatter = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 });
export function formatMapNumber(value) { return Number.isFinite(Number(value)) ? numberFormatter.format(Number(value)) : "—"; }

export function globalDomain(layer) {
  const numbers = Object.values(layer.values || {}).flatMap((row) => Object.values(row || {})).filter(Number.isFinite);
  if (!numbers.length) return [0, 1];
  const minimum = Math.min(0, ...numbers), maximum = Math.max(0, ...numbers);
  return minimum === maximum ? (minimum === 0 ? [-1, 1] : [Math.min(0, minimum), Math.max(0, maximum)]) : [minimum, maximum];
}

export function barLayout(values, domain, size) {
  const top = 5, bottom = size - 14;
  const y = scaleLinear().domain(domain).range([bottom, top]);
  const zero = y(0), gap = 2, width = Math.max(2, (size - gap * (values.length + 1)) / Math.max(values.length, 1));
  return { zero, bars: values.map((value, index) => ({ x: gap + index * (width + gap), y: Math.min(zero, y(value)), width, height: Math.max(1, Math.abs(y(value) - zero)), value })) };
}

export function pieSize(total, maximum, base = 76) {
  if (!(total > 0) || !(maximum > 0)) return 0;
  return Math.max(base * 0.42, base * Math.sqrt(total / maximum));
}

export function chartSize(zoom, exportScale = 1) {
  return Math.min(112, Math.max(54, 68 + (zoom - 12) * 9)) * exportScale;
}

export function colorForSeries(series, index) { return series?.color || DEFAULT_SERIES_COLORS[index % DEFAULT_SERIES_COLORS.length]; }

export function choroplethScale(layer) {
  const seriesId = layer.series?.[0]?.id;
  const storedPalette = layer.visualization?.palette;
  const usesLegacyDefault = Array.isArray(storedPalette) && storedPalette.length === LEGACY_CHOROPLETH_COLORS.length && storedPalette.every((color, index) => color.toLowerCase() === LEGACY_CHOROPLETH_COLORS[index]);
  const palette = !storedPalette || usesLegacyDefault ? DEFAULT_CHOROPLETH_COLORS : storedPalette;
  const values = Object.values(layer.values || {}).map((row) => Number(row?.[seriesId])).filter(Number.isFinite);
  if (!values.length) return { ranges: [], color: () => NO_DATA_COLOR };
  const minimum = Math.min(...values), maximum = Math.max(...values);
  if (minimum === maximum) {
    const range = { minimum, maximum, color: palette[2], label: formatMapNumber(minimum) };
    return { ranges: [range], color: (value) => Number.isFinite(Number(value)) ? range.color : NO_DATA_COLOR };
  }
  const count = layer.visualization?.classes || 5, step = (maximum - minimum) / count;
  const ranges = Array.from({ length: count }, (_, index) => {
    const lower = minimum + step * index, upper = index === count - 1 ? maximum : minimum + step * (index + 1);
    return { minimum: lower, maximum: upper, color: palette[index], label: index === count - 1 ? `${formatMapNumber(lower)} ≤ x ≤ ${formatMapNumber(upper)}` : `${formatMapNumber(lower)} ≤ x < ${formatMapNumber(upper)}` };
  });
  return { ranges, color: (value) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return NO_DATA_COLOR;
    return ranges[Math.min(count - 1, Math.max(0, Math.floor((number - minimum) / step)))].color;
  } };
}

export function topVisibleChoropleth(layers) {
  return [...layers].reverse().find((layer) => layer.visible && layer.kind === "choropleth") || null;
}
