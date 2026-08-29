import { useState } from "react";
import { TITLE_FONT_SIZE_MAX, TITLE_FONT_SIZE_MIN, TITLE_TEXT_MAX_LENGTH } from "./title";

const layerTypeLabel = (layer) => {
  if (layer.kind === "title") return "文字圖層";
  if (layer.kind === "labels") return "地名標籤";
  if (layer.kind === "boundary") return "區域底圖";
  const types = { bar: "長條圖", pie: "圓餅圖", donut: "甜甜圈圖", choropleth: "面量圖" };
  return types[layer.visualization?.type] || "資料圖層";
};

export default function LayerPanel({ layers, dispatch, onDelete, onColorChange = () => {}, titleSettings }) {
  const [dragged, setDragged] = useState(null), displayed = [...layers].reverse();
  const drop = (event, target) => { const draggedId = event.dataTransfer?.getData("text/plain") || dragged, from = layers.findIndex((layer) => layer.id === draggedId), to = layers.findIndex((layer) => layer.id === target); if (from >= 0 && to >= 0) dispatch({ type: "move", id: draggedId, delta: to - from }); setDragged(null); };
  return <ul className="layer-list" aria-label="地圖圖層">{displayed.map((layer, displayIndex) => <li className="layer-item" key={layer.id} onDragOver={(event) => { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = "move"; }} onDrop={(event) => drop(event, layer.id)}>
    <div className="layer-item-main">
      <button type="button" className="layer-drag-handle" draggable onDragStart={(event) => { setDragged(layer.id); event.dataTransfer?.setData("text/plain", layer.id); if (event.dataTransfer) event.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setDragged(null)} aria-label={`拖曳 ${layer.name}`} title="拖曳以調整圖層順序">⠿</button>
      <label className="layer-check"><input type="checkbox" checked={layer.visible} onChange={() => dispatch({ type: "toggle", id: layer.id })}/><span className="layer-name">{layer.name}</span></label>
      <span className="layer-type-badge">{layerTypeLabel(layer)}</span>
      {layer.kind === "labels" && <button type="button" className="secondary layer-label-reset" onClick={() => dispatch({ type: "resetLabels" })}>還原位置</button>}
      {layer.shared && ["bar", "pie", "donut"].includes(layer.visualization?.type) && <span className="layer-series-colors">{layer.series.map((series) => <label key={series.id} title={`${series.name}顏色`}><input type="color" value={series.color} aria-label={`${layer.name} ${series.name} 顏色`} onChange={(event) => onColorChange(layer, series, event.target.value)}/></label>)}</span>}
      <span className="layer-actions"><button className="secondary icon-button" disabled={displayIndex === 0} onClick={() => dispatch({ type: "move", id: layer.id, delta: 1 })} aria-label={`上移 ${layer.name}`}>↑</button><button className="secondary icon-button" disabled={displayIndex === displayed.length - 1} onClick={() => dispatch({ type: "move", id: layer.id, delta: -1 })} aria-label={`下移 ${layer.name}`}>↓</button>{layer.shared && <button className="secondary layer-remove" onClick={() => onDelete(layer)}>刪除</button>}</span>
    </div>
    {layer.kind === "title" && titleSettings && <details className="title-layer-settings" open>
      <summary>標題設定</summary>
      <div className="title-layer-controls">
        <label className="title-text-field">標題<input aria-label="標題文字" type="text" value={titleSettings.text} maxLength={TITLE_TEXT_MAX_LENGTH} onChange={(event) => dispatch({ type: "title", changes: { text: event.target.value } })}/></label>
        <label>字級 (px)<input aria-label="標題字級" type="number" min={TITLE_FONT_SIZE_MIN} max={TITLE_FONT_SIZE_MAX} value={titleSettings.fontSize} onChange={(event) => dispatch({ type: "title", changes: { fontSize: Number(event.target.value) } })}/></label>
        <label>顏色<input aria-label="標題顏色" type="color" value={titleSettings.color} onChange={(event) => dispatch({ type: "title", changes: { color: event.target.value } })}/></label>
        <button type="button" className="secondary" onClick={() => dispatch({ type: "resetTitlePosition" })}>還原標題位置</button>
      </div>
    </details>}
  </li>)}</ul>;
}
