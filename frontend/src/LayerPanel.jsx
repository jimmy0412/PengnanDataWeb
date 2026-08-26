import { useState } from "react";

export default function LayerPanel({ layers, dispatch, onDelete, onColorChange = () => {} }) {
  const [dragged, setDragged] = useState(null), displayed = [...layers].reverse();
  const drop = (target) => { const from = layers.findIndex((layer) => layer.id === dragged), to = layers.findIndex((layer) => layer.id === target); if (from >= 0 && to >= 0) dispatch({ type: "move", id: dragged, delta: to - from }); setDragged(null); };
  return <ul className="layer-list" aria-label="地圖圖層">{displayed.map((layer, displayIndex) => <li className="layer-item" key={layer.id} draggable onDragStart={() => setDragged(layer.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => drop(layer.id)}>
    <span className="layer-drag-handle" aria-hidden="true">⠿</span>
    <label className="layer-check"><input type="checkbox" checked={layer.visible} onChange={() => dispatch({ type: "toggle", id: layer.id })}/><span>{layer.name}</span></label>
    {layer.kind === "labels" && <button type="button" className="secondary layer-label-reset" onClick={() => dispatch({ type: "resetLabels" })}>還原位置</button>}
    {layer.shared && ["bar", "pie", "donut"].includes(layer.visualization?.type) && <span className="layer-series-colors">{layer.series.map((series) => <label key={series.id} title={`${series.name}顏色`}><input type="color" value={series.color} aria-label={`${layer.name} ${series.name} 顏色`} onChange={(event) => onColorChange(layer, series, event.target.value)}/></label>)}</span>}
    <span className="layer-actions"><button className="secondary icon-button" disabled={displayIndex === 0} onClick={() => dispatch({ type: "move", id: layer.id, delta: 1 })} aria-label={`上移 ${layer.name}`}>↑</button><button className="secondary icon-button" disabled={displayIndex === displayed.length - 1} onClick={() => dispatch({ type: "move", id: layer.id, delta: -1 })} aria-label={`下移 ${layer.name}`}>↓</button>{layer.shared && <button className="secondary layer-remove" onClick={() => onDelete(layer)}>刪除</button>}</span>
  </li>)}</ul>;
}
