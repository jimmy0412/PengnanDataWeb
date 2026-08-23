import { choroplethScale } from "./visualization";

export default function Legend({ layers }) {
  const charts = layers.filter((layer) => layer.visible && layer.kind === "chart");
  if (!charts.length) return <div className="map-legend">目前沒有顯示中的圖表圖層。</div>;
  return <div className="map-legend" aria-label="圖表圖例">{charts.map((layer) => <section className="legend-layer" key={layer.id}><strong>{layer.name}</strong><div className="legend-series">{layer.series.map((series) => <span className="legend-item" key={series.id}><i style={{ background: series.color }}/>{series.name}</span>)}</div></section>)}</div>;
}

export function ChoroplethLegend({ layer }) {
  if (!layer) return null;
  const scale = choroplethScale(layer), unit = layer.source?.unit || "";
  return <aside className="choropleth-legend" aria-label={`${layer.name} 面量圖圖例`}><strong>{layer.name}</strong><div>{scale.ranges.map((range) => <span className="choropleth-legend-row" key={`${range.minimum}-${range.maximum}`}><i style={{ background: range.color }}/><span>{range.label}{unit}</span></span>)}</div></aside>;
}
