import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { api } from "./api";
import { captureMapPng } from "./exportPng";
import { villageKey, villageName } from "./geo";
import { builtInLayers, mergeLayers, populationValues } from "./layers";
import { initialState, reducer } from "./store";
import { loadGenderColors, loadWorkspace, saveWorkspace } from "./storage";
import { DEFAULT_MAP_BACKGROUND_COLOR, DEFAULT_VILLAGE_COLORS, topVisibleChoropleth } from "./visualization";
import MapCanvas from "./MapCanvas";
import LayerPanel from "./LayerPanel";
import Legend, { ChoroplethLegend } from "./Legend";
import { CreateForms } from "./Forms";

export default function App({ config }) {
  const [state, dispatch] = useReducer(reducer, initialState), [geojson, setGeojson] = useState(null), [years, setYears] = useState([]), [zoom, setZoom] = useState(13), [map, setMap] = useState(null), [width, setWidth] = useState(2560);
  const captureRef = useRef(null), hydrated = useRef(false);
  const loadLayers = useCallback(async (preserve = state.layers) => {
    const genderColors = loadGenderColors(localStorage), builtIns = builtInLayers(genderColors);
    const catalog = await api.layers(), ids = [...builtIns.map((layer) => layer.id), ...catalog.layers.map((layer) => layer.id)], villageIds = (geojson?.features || []).map(villageKey);
    const stored = loadWorkspace(localStorage, ids, villageIds), saved = preserve.length ? preserve.map(({ id, visible }) => ({ id, visible })) : stored.layers;
    dispatch({ type: "layers", layers: mergeLayers(catalog.layers, saved, preserve, genderColors) });
  }, [geojson, state.layers]);
  useEffect(() => { (async () => {
    const [geo, status, catalog] = await Promise.allSettled([api.geojson(), api.status(), api.layers()]);
    if (geo.status === "fulfilled" && geo.value?.features?.length) setGeojson(geo.value); else dispatch({ type: "status", message: `圖資載入失敗：${geo.reason?.message || "格式錯誤"}` });
    const availableYears = status.status === "fulfilled" ? status.value.processed_years || [] : []; setYears(availableYears);
    if (status.status === "rejected") dispatch({ type: "status", message: `人口年份載入失敗：${status.reason.message}` });
    const custom = catalog.status === "fulfilled" ? catalog.value.layers : []; if (catalog.status === "rejected") dispatch({ type: "status", message: `共享圖層載入失敗：${catalog.reason.message}` });
    const features = geo.status === "fulfilled" ? geo.value.features : [], genderColors = loadGenderColors(localStorage), builtIns = builtInLayers(genderColors), ids = [...builtIns.map((layer) => layer.id), ...custom.map((layer) => layer.id)], villageIds = features.map(villageKey), stored = loadWorkspace(localStorage, ids, villageIds);
    const colors = Object.fromEntries(features.map((feature, index) => [villageKey(feature), stored.villageColors[villageKey(feature)] || DEFAULT_VILLAGE_COLORS[index % DEFAULT_VILLAGE_COLORS.length]]));
    dispatch({ type: "hydrate", payload: { year: availableYears.at(-1) || null, layers: mergeLayers(custom, stored.layers, [], genderColors), villageColors: colors, mapBackgroundColor: stored.mapBackgroundColor || DEFAULT_MAP_BACKGROUND_COLOR, labelPositions: stored.labelPositions } }); hydrated.current = true;
  })(); }, []);
  useEffect(() => { if (!state.year) return; api.villageData(state.year).then((payload) => dispatch({ type: "populationValues", values: populationValues(payload.villages) })).catch((error) => dispatch({ type: "status", message: `${state.year} 年人口資料載入失敗：${error.message}` })); }, [state.year]);
  useEffect(() => { if (hydrated.current) saveWorkspace(localStorage, state); }, [state.layers, state.villageColors, state.mapBackgroundColor, state.labelPositions]);
  const selectedLayer = state.layers.find((layer) => layer.id === state.selected?.layerId), selectedValues = selectedLayer?.values?.[state.selected?.village];
  const deleteLayer = async (layer) => { if (!window.confirm(`確定要永久刪除共享圖層「${layer.name}」嗎？`)) return; try { await api.remove(layer.id); await loadLayers(state.layers.filter((item) => item.id !== layer.id)); dispatch({ type: "status", message: `已刪除「${layer.name}」。` }); } catch (error) { dispatch({ type: "status", message: `刪除失敗：${error.message}` }); } };
  const resetColors = () => {
    dispatch({ type: "backgroundColor", color: DEFAULT_MAP_BACKGROUND_COLOR });
    (geojson?.features || []).forEach((feature, index) => dispatch({ type: "color", id: villageKey(feature), color: DEFAULT_VILLAGE_COLORS[index % DEFAULT_VILLAGE_COLORS.length] }));
  };
  const exportPng = async () => {
    if (!map || !captureRef.current || state.export.active) return;
    const node = captureRef.current;
    dispatch({ type: "export", active: true });
    try {
      const dataUrl = await captureMapPng(node, width, state.mapBackgroundColor);
      const link = document.createElement("a"); link.download = `pengnan-map-${state.year || "custom"}.png`; link.href = dataUrl; link.click();
    } catch (error) { dispatch({ type: "status", message: `PNG 匯出失敗：${error.message}` }); dispatch({ type: "export", active: true, error: error.message }); }
    finally { dispatch({ type: "export", active: false }); }
  };
  const activeChoropleth = useMemo(() => topVisibleChoropleth(state.layers), [state.layers]);
  return <div className="map-editor react-map-editor">
    <section className="card map-canvas-panel" aria-labelledby="map-heading"><h2 id="map-heading">澎南區地圖</h2><div id="map-capture-area" ref={captureRef} style={{ backgroundColor: state.mapBackgroundColor }}><MapCanvas geojson={geojson} layers={state.layers} colors={state.villageColors} backgroundColor={state.mapBackgroundColor} labelPositions={state.labelPositions} selected={state.selected} onSelect={(value) => dispatch({ type: "select", value })} onLabelMove={(id, position) => dispatch({ type: "label", id, position })} onMap={setMap} zoom={zoom} onZoom={setZoom}/><ChoroplethLegend layer={activeChoropleth}/></div><Legend layers={state.layers}/>
      <div className="map-info"><strong>選取資訊</strong>{state.selected && selectedLayer ? <div><div><strong>{state.selected.village}</strong> · {selectedLayer.name}</div><dl>{selectedLayer.series?.map((series) => <div key={series.id}><dt><i style={{ background: series.color }}/>{series.name}</dt><dd>{selectedValues?.[series.id] ?? "—"}{selectedLayer.source?.unit || ""}</dd></div>)}</dl><p className="hint">來源：{selectedLayer.source?.type === "processed_data" ? `${selectedLayer.source.year || state.year || "—"} 年／${selectedLayer.source.data_type || "人口資料"}／${selectedLayer.source.gender || "全部"}` : "CSV 上傳"}</p></div> : <p className="hint">選取地圖上的圖表或區域以查看完整資料。</p>}</div>
    </section>
    <aside className="map-workspace" aria-label="地圖工作區">
      <details className="card map-workspace-section" open><summary>圖層工作區</summary><div className="map-workspace-section-body"><p className="hint">清單最上方為地圖最上層；可拖曳或使用上下按鈕排序。</p><label className="field">內建資料年份<select value={state.year || ""} onChange={(event) => dispatch({ type: "year", year: event.target.value })}>{years.map((year) => <option key={year}>{year}</option>)}</select></label><LayerPanel layers={state.layers} dispatch={dispatch} onDelete={deleteLayer}/><div className="map-layer-status" role="status">{state.status.join(" ")}</div></div></details>
      <details className="card map-workspace-section" open><summary>PNG 匯出設定</summary><div className="map-workspace-section-body"><div className="export-toolbar"><label>寬度 (px)<input type="number" min="800" step="160" value={width} onChange={(event) => setWidth(Math.max(800, Number(event.target.value) || 2560))}/></label><span>高度：{Math.round(width * 9 / 16)} px（16:9）</span><button className="secondary" disabled={state.export.active} onClick={exportPng}>{state.export.active ? "匯出中…" : "下載 PNG"}</button></div></div></details>
      <details className="card map-workspace-section" open><summary>新增共享資料圖層</summary><div className="map-workspace-section-body"><CreateForms years={years} api={api} refresh={() => loadLayers()}/></div></details>
      <details className="card map-workspace-section" open><summary>區域色彩設定</summary><div className="map-workspace-section-body"><button className="secondary" onClick={resetColors}>重設預設色彩</button><div className="color-grid map-color-grid"><label className="map-color-item map-background-color"><span>地圖背景（海域）</span><input type="color" value={state.mapBackgroundColor} aria-label="地圖背景顏色" onChange={(event) => dispatch({ type: "backgroundColor", color: event.target.value })}/></label>{(geojson?.features || []).map((feature) => <label className="map-color-item" key={villageKey(feature)}><span>{villageName(feature)}</span><input type="color" value={state.villageColors[villageKey(feature)] || "#1f77b4"} onChange={(event) => dispatch({ type: "color", id: villageKey(feature), color: event.target.value })}/></label>)}</div></div></details>
    </aside>
  </div>;
}
