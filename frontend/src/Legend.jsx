export default function Legend({ layers }) {
  const charts = layers.filter((layer) => layer.visible && layer.kind === "chart");
  if (!charts.length) return <div className="map-legend">目前沒有顯示中的圖表圖層。</div>;
  return <div className="map-legend" aria-label="圖表圖例">{charts.map((layer) => <section className="legend-layer" key={layer.id}><strong>{layer.name}</strong><div className="legend-series">{layer.series.map((series) => <span className="legend-item" key={series.id}><i style={{ background: series.color }}/>{series.name}</span>)}</div></section>)}</div>;
}
