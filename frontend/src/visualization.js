import { scaleLinear } from "d3-scale";

export const DEFAULT_VILLAGE_COLORS = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b", "#e377c2"];
export const DEFAULT_SERIES_COLORS = ["#0072B2", "#D55E00", "#009E73", "#CC79A7", "#E69F00", "#56B4E9", "#F0E442"];
export const DEFAULT_MAP_BACKGROUND_COLOR = "#aad3df";

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
