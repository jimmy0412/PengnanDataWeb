import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { api } from "./api";
import { villageKey, villageName } from "./geo";
import { initialState, reducer } from "./store";
import { loadWorkspace, saveWorkspace } from "./storage";
import { DEFAULT_MAP_BACKGROUND_COLOR, DEFAULT_SERIES_COLORS, DEFAULT_VILLAGE_COLORS } from "./visualization";
import MapCanvas from "./MapCanvas";
import LayerPanel from "./LayerPanel";
import Legend from "./Legend";
import { CreateForms } from "./Forms";

const builtIns = [
  { id: "boundary", name: "實心區域底圖", kind: "boundary", visible: true },
  { id: "population", name: "人口圖表（男／女）", kind: "chart", visible: true, visualization: { type: "bar", scale: "global" }, series: [{ id: "male", name: "男", color: DEFAULT_SERIES_COLORS[0] }, { id: "female", name: "女", color: DEFAULT_SERIES_COLORS[1] }], values: {}, source: { type: "processed_data" } },
  { id: "village-labels", name: "地名", kind: "labels", visible: true },
];
function mergeLayers(custom, saved) {
  const definitions = [...builtIns.slice(0, 2), ...custom.map((layer) => ({ ...layer, shared: true, visible: true })), builtIns[2]], byId = new Map(definitions.map((layer) => [layer.id, layer])), visibility = new Map(saved.map((item) => [item.id, item.visible]));
  const ids = saved.map((item) => item.id).filter((id, index, all) => byId.has(id) && all.indexOf(id) === index);
  definitions.forEach((layer) => { if (!ids.includes(layer.id)) ids.push(layer.id); });
  return ids.map((id) => ({ ...byId.get(id), visible: visibility.has(id) ? visibility.get(id) : byId.get(id).visible }));
}
function populationValues(rows) { return Object.fromEntries((rows || []).map((row) => [row.里, { male: Number(row.總人口?.男) || 0, female: Number(row.總人口?.女) || 0 }])); }
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

export default function App({ config }) {
  const [state, dispatch] = useReducer(reducer, initialState), [geojson, setGeojson] = useState(null), [years, setYears] = useState([]), [zoom, setZoom] = useState(13), [map, setMap] = useState(null), [width, setWidth] = useState(2560);
  const captureRef = useRef(null), hydrated = useRef(false);
  const loadLayers = useCallback(async (preserve = state.layers) => {
    const catalog = await api.layers(), ids = [...builtIns.map((layer) => layer.id), ...catalog.layers.map((layer) => layer.id)], villageIds = (geojson?.features || []).map(villageKey);
    const stored = loadWorkspace(localStorage, ids, villageIds), saved = preserve.length ? preserve.map(({ id, visible }) => ({ id, visible })) : stored.layers;
    dispatch({ type: "layers", layers: mergeLayers(catalog.layers, saved) });
  }, [geojson, state.layers]);
  useEffect(() => { (async () => {
    const [geo, status, catalog] = await Promise.allSettled([api.geojson(), api.status(), api.layers()]);
    if (geo.status === "fulfilled" && geo.value?.features?.length) setGeojson(geo.value); else dispatch({ type: "status", message: `圖資載入失敗：${geo.reason?.message || "格式錯誤"}` });
    const availableYears = status.status === "fulfilled" ? status.value.processed_years || [] : []; setYears(availableYears);
    if (status.status === "rejected") dispatch({ type: "status", message: `人口年份載入失敗：${status.reason.message}` });
    const custom = catalog.status === "fulfilled" ? catalog.value.layers : []; if (catalog.status === "rejected") dispatch({ type: "status", message: `共享圖層載入失敗：${catalog.reason.message}` });
    const features = geo.status === "fulfilled" ? geo.value.features : [], ids = [...builtIns.map((layer) => layer.id), ...custom.map((layer) => layer.id)], villageIds = features.map(villageKey), stored = loadWorkspace(localStorage, ids, villageIds);
    const colors = Object.fromEntries(features.map((feature, index) => [villageKey(feature), stored.villageColors[villageKey(feature)] || DEFAULT_VILLAGE_COLORS[index % DEFAULT_VILLAGE_COLORS.length]]));
    dispatch({ type: "hydrate", payload: { year: availableYears.at(-1) || null, layers: mergeLayers(custom, stored.layers), villageColors: colors, mapBackgroundColor: stored.mapBackgroundColor || DEFAULT_MAP_BACKGROUND_COLOR, labelPositions: stored.labelPositions } }); hydrated.current = true;
  })(); }, []);
  useEffect(() => { if (!state.year) return; api.villageData(state.year).then((payload) => dispatch({ type: "layers", layers: state.layers.map((layer) => layer.id === "population" ? { ...layer, values: populationValues(payload.villages) } : layer) })).catch((error) => dispatch({ type: "status", message: `${state.year} 年人口資料載入失敗：${error.message}` })); }, [state.year]);
  useEffect(() => { if (hydrated.current) saveWorkspace(localStorage, state); }, [state.layers, state.villageColors, state.mapBackgroundColor, state.labelPositions]);
  const selectedLayer = state.layers.find((layer) => layer.id === state.selected?.layerId), selectedValues = selectedLayer?.values?.[state.selected?.village];
  const deleteLayer = async (layer) => { if (!window.confirm(`確定要永久刪除共享圖層「${layer.name}」嗎？`)) return; try { await api.remove(layer.id); await loadLayers(state.layers.filter((item) => item.id !== layer.id)); dispatch({ type: "status", message: `已刪除「${layer.name}」。` }); } catch (error) { dispatch({ type: "status", message: `刪除失敗：${error.message}` }); } };
  const resetColors = () => {
    dispatch({ type: "backgroundColor", color: DEFAULT_MAP_BACKGROUND_COLOR });
    (geojson?.features || []).forEach((feature, index) => dispatch({ type: "color", id: villageKey(feature), color: DEFAULT_VILLAGE_COLORS[index % DEFAULT_VILLAGE_COLORS.length] }));
  };
  const exportPng = async () => {
    if (!map || !captureRef.current || state.export.active) return;
    const node = captureRef.current, original = { center: map.getCenter(), zoom: map.getZoom(), width: node.style.width, height: node.style.height, selected: state.selected };
    dispatch({ type: "export", active: true });
    try {
      node.classList.add("map-exporting"); node.style.width = `${width}px`; node.style.height = `${Math.round(width * 9 / 16)}px`; map.invalidateSize(false); await nextFrame();
      const render = toPng(node, { width, height: Math.round(width * 9 / 16), pixelRatio: 1, cacheBust: true, backgroundColor: state.mapBackgroundColor });
      const dataUrl = await Promise.race([render, new Promise((_, reject) => setTimeout(() => reject(new Error("匯出逾時")), 20000))]);
      const link = document.createElement("a"); link.download = `pengnan-map-${state.year || "custom"}.png`; link.href = dataUrl; link.click();
    } catch (error) { dispatch({ type: "status", message: `PNG 匯出失敗：${error.message}` }); dispatch({ type: "export", active: true, error: error.message }); }
    finally { node.classList.remove("map-exporting"); node.style.width = original.width; node.style.height = original.height; map.invalidateSize(false); map.setView(original.center, original.zoom, { animate: false }); dispatch({ type: "select", value: original.selected }); dispatch({ type: "export", active: false }); }
  };
  const activeCharts = useMemo(() => state.layers.filter((layer) => layer.kind === "chart"), [state.layers]);
  return <div className="map-editor react-map-editor">
    <section className="card map-canvas-panel" aria-labelledby="map-heading"><h2 id="map-heading">澎南區地圖</h2><div id="map-capture-area" ref={captureRef} style={{ backgroundColor: state.mapBackgroundColor }}><MapCanvas geojson={geojson} layers={state.layers} colors={state.villageColors} backgroundColor={state.mapBackgroundColor} labelPositions={state.labelPositions} selected={state.selected} onSelect={(value) => dispatch({ type: "select", value })} onLabelMove={(id, position) => dispatch({ type: "label", id, position })} onMap={setMap} zoom={zoom} onZoom={setZoom}/><div className="capture-legend"><Legend layers={state.layers}/></div></div><Legend layers={state.layers}/>
      <div className="map-info"><strong>選取資訊</strong>{state.selected && selectedLayer ? <div><div><strong>{state.selected.village}</strong> · {selectedLayer.name}</div><dl>{selectedLayer.series?.map((series) => <div key={series.id}><dt><i style={{ background: series.color }}/>{series.name}</dt><dd>{selectedValues?.[series.id] ?? "—"}{selectedLayer.source?.unit || ""}</dd></div>)}</dl><p className="hint">來源：{selectedLayer.source?.type === "processed_data" ? `${selectedLayer.source.year || state.year || "—"} 年／${selectedLayer.source.data_type || "人口資料"}／${selectedLayer.source.gender || "全部"}` : "CSV 上傳"}</p></div> : <p className="hint">選取地圖上的圖表或區域以查看完整資料。</p>}</div>
    </section>
    <aside className="map-workspace" aria-label="地圖工作區">
      <details className="card map-workspace-section" open><summary>圖層工作區</summary><div className="map-workspace-section-body"><p className="hint">清單最上方為地圖最上層；可拖曳或使用上下按鈕排序。</p><label className="field">內建資料年份<select value={state.year || ""} onChange={(event) => dispatch({ type: "year", year: event.target.value })}>{years.map((year) => <option key={year}>{year}</option>)}</select></label><LayerPanel layers={state.layers} dispatch={dispatch} onDelete={deleteLayer}/><div className="map-layer-status" role="status">{state.status.join(" ")}</div></div></details>
      <details className="card map-workspace-section" open><summary>新增共享圖表圖層</summary><div className="map-workspace-section-body"><CreateForms years={years} api={api} refresh={() => loadLayers()}/></div></details>
      <details className="card map-workspace-section" open><summary>區域色彩設定</summary><div className="map-workspace-section-body"><button className="secondary" onClick={resetColors}>重設預設色彩</button><div className="color-grid map-color-grid"><label className="map-color-item map-background-color"><span>地圖背景（海域）</span><input type="color" value={state.mapBackgroundColor} aria-label="地圖背景顏色" onChange={(event) => dispatch({ type: "backgroundColor", color: event.target.value })}/></label>{(geojson?.features || []).map((feature) => <label className="map-color-item" key={villageKey(feature)}><span>{villageName(feature)}</span><input type="color" value={state.villageColors[villageKey(feature)] || "#1f77b4"} onChange={(event) => dispatch({ type: "color", id: villageKey(feature), color: event.target.value })}/></label>)}</div></div></details>
      <details className="card map-workspace-section" open><summary>PNG 匯出設定</summary><div className="map-workspace-section-body"><div className="export-toolbar"><label>寬度 (px)<input type="number" min="800" step="160" value={width} onChange={(event) => setWidth(Math.max(800, Number(event.target.value) || 2560))}/></label><span>高度：{Math.round(width * 9 / 16)} px（16:9）</span><button className="secondary" disabled={state.export.active} onClick={exportPng}>{state.export.active ? "匯出中…" : "下載 PNG"}</button></div></div></details>
    </aside>
  </div>;
}
