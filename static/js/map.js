const MAP_COLOR_KEY = "pengnan_map_colors";
const MAP_WORKSPACE_KEY = "pengnan_map_workspace_v2";
const MAP_LABEL_POSITIONS_KEY = "pengnan_map_label_positions_v1";
const DEFAULT_MAP_COLORS = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b", "#e377c2"];
const CHART_COLORS = ["#2563eb", "#db2777", "#16a34a", "#d97706", "#7c3aed", "#0891b2"];
let leafletMap, geojsonData, mapData = {}, selectedYear, villageOrder = [], villageColors = {};
let layerRegistry = [], labelPositions = {}, renderedLayers = new Map(), exportInProgress = false, exportScale = 1;

function normalizeName(name) { return (name || "").replace(/[\[\]]/g, ""); }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char])); }
function villageName(feature) { return normalizeName(feature?.properties?.VILLNAME) || "未知地區"; }
function villageKey(feature) { return String(feature?.properties?.VILLCODE || ""); }
function loadJson(key, fallback) { try { const value = JSON.parse(localStorage.getItem(key)); return value ?? fallback; } catch { return fallback; } }
function appendStatus(message) {
  const status = document.getElementById("map-layer-status");
  status.textContent = `${status.textContent ? `${status.textContent} ` : ""}${message}`;
}
function saveWorkspace() {
  localStorage.setItem(MAP_WORKSPACE_KEY, JSON.stringify(layerRegistry.map(({ id, visible }) => ({ id, visible }))));
}
function builtInLayers(includeLabels = true) {
  const layers = [
    { id: "boundary", name: "實心區域底圖", type: "boundary", visible: true },
    { id: "population", name: "人口圖表（男／女）", type: "chart", chartType: "bar", source: "population", series: ["男", "女"], visible: true },
  ];
  if (includeLabels) layers.push({ id: "village-labels", name: "地名", type: "labels", visible: true });
  return layers;
}
function mergeWorkspace(layers) {
  const stored = loadJson(MAP_WORKSPACE_KEY, []);
  const validStored = Array.isArray(stored) ? stored.filter((item) => item && typeof item.id === "string") : [];
  const definitions = new Map(layers.map((layer) => [layer.id, layer]));
  const visibility = new Map(validStored.map((item) => [item.id, item.visible]));
  const orderedIds = validStored.map((item) => item.id).filter((id, index, ids) => definitions.has(id) && ids.indexOf(id) === index);

  layers.forEach((layer, desiredIndex) => {
    if (orderedIds.includes(layer.id)) return;
    const nextId = layers.slice(desiredIndex + 1).map((item) => item.id).find((id) => orderedIds.includes(id));
    if (nextId) orderedIds.splice(orderedIds.indexOf(nextId), 0, layer.id);
    else orderedIds.push(layer.id);
  });
  layerRegistry = orderedIds.map((id) => ({ ...definitions.get(id), visible: typeof visibility.get(id) === "boolean" ? visibility.get(id) : definitions.get(id).visible }));
}
async function jsonFetch(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail || "操作失敗");
  return payload;
}
async function loadMapData(year) {
  const payload = await jsonFetch(`/api/map-village-data?year=${year}`);
  mapData = Object.fromEntries((payload.villages || []).map((item) => [item.里, item]));
  selectedYear = Number(year);
}
function initVillageColors() {
  const saved = loadJson(MAP_COLOR_KEY, {});
  const validSaved = saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  villageOrder = (geojsonData.features || []).map((feature, index) => ({ key: villageKey(feature), name: villageName(feature), index }));
  villageColors = Object.fromEntries(villageOrder.map(({ key, index }) => [key, /^#[0-9a-f]{6}$/i.test(validSaved[key]) ? validSaved[key] : DEFAULT_MAP_COLORS[index % DEFAULT_MAP_COLORS.length]]));
}
function initLabelPositions() {
  const saved = loadJson(MAP_LABEL_POSITIONS_KEY, {});
  const validKeys = new Set(villageOrder.map(({ key }) => key));
  let invalidCount = 0;
  labelPositions = {};
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) {
    if (saved !== null && saved !== undefined) invalidCount += 1;
  } else {
    Object.entries(saved).forEach(([key, position]) => {
      const lat = position?.lat, lng = position?.lng;
      if (validKeys.has(key) && Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) labelPositions[key] = { lat, lng };
      else invalidCount += 1;
    });
  }
  if (invalidCount) appendStatus(`已忽略 ${invalidCount} 筆無效或過期的地名位置。`);
}
function saveLabelPositions() { localStorage.setItem(MAP_LABEL_POSITIONS_KEY, JSON.stringify(labelPositions)); }
function featureStyle(feature) { return { color: "#374151", weight: 1.5 * exportScale, fillColor: villageColors[villageKey(feature)], fillOpacity: 1 }; }
function renderInfo(feature) {
  const info = document.getElementById("map-info-content");
  if (!feature) { info.textContent = "請將滑鼠移至地圖區域。"; return; }
  const name = villageName(feature), row = mapData[name];
  info.innerHTML = row ? `<div><strong>里名：</strong>${escapeHtml(name)}</div><div><strong>總人口：</strong>男 ${row.總人口?.男 ?? "—"}／女 ${row.總人口?.女 ?? "—"}／計 ${row.總人口?.全部 ?? "—"}</div><div><strong>出生率：</strong>${row.出生率?.全部 ?? "—"} ‰</div><div><strong>扶老比：</strong>${row.扶老比?.全部 ?? "—"} %</div>` : `${escapeHtml(name)}：目前年份沒有可用人口資料。`;
}
function createGeoLayer(definition) {
  return L.geoJSON(geojsonData, {
    pane: definition.id,
    style: (feature) => featureStyle(feature),
    onEachFeature(feature, leafLayer) {
      leafLayer.on({
        mouseover(event) { event.target.setStyle({ weight: 3 * exportScale }); renderInfo(feature); },
        mouseout(event) { event.target.setStyle(featureStyle(feature)); renderInfo(null); },
      });
    },
  });
}
function ringAreaAndCentroid(ring) {
  let twiceArea = 0, longitudeSum = 0, latitudeSum = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index], next = ring[(index + 1) % ring.length];
    if (!Array.isArray(current) || !Array.isArray(next)) continue;
    const cross = current[0] * next[1] - next[0] * current[1];
    twiceArea += cross;
    longitudeSum += (current[0] + next[0]) * cross;
    latitudeSum += (current[1] + next[1]) * cross;
  }
  if (Math.abs(twiceArea) < Number.EPSILON) return { area: 0, point: null };
  return {
    area: Math.abs(twiceArea / 2),
    point: [longitudeSum / (3 * twiceArea), latitudeSum / (3 * twiceArea)],
  };
}
function pointInRing(point, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const current = ring[index], prior = ring[previous];
    if (!Array.isArray(current) || !Array.isArray(prior)) continue;
    const crossesLatitude = (current[1] > point[1]) !== (prior[1] > point[1]);
    if (crossesLatitude && point[0] < ((prior[0] - current[0]) * (point[1] - current[1])) / (prior[1] - current[1]) + current[0]) inside = !inside;
  }
  return inside;
}
function pointInPolygon(point, polygon) {
  return pointInRing(point, polygon[0]) && !polygon.slice(1).some((hole) => pointInRing(point, hole));
}
function horizontalInteriorPoint(polygon, preferredLatitude) {
  const outerRing = polygon[0] || [];
  const latitudes = outerRing.map((coordinate) => coordinate[1]).filter(Number.isFinite);
  if (!latitudes.length) return null;
  const minimum = Math.min(...latitudes), maximum = Math.max(...latitudes);
  const candidates = [preferredLatitude, (minimum + maximum) / 2, minimum * 0.25 + maximum * 0.75, minimum * 0.75 + maximum * 0.25];
  for (const latitude of candidates) {
    const intersections = [];
    for (let index = 0, previous = outerRing.length - 1; index < outerRing.length; previous = index, index += 1) {
      const current = outerRing[index], prior = outerRing[previous];
      if ((current[1] > latitude) === (prior[1] > latitude)) continue;
      intersections.push(current[0] + ((latitude - current[1]) * (prior[0] - current[0])) / (prior[1] - current[1]));
    }
    intersections.sort((left, right) => left - right);
    const intervals = [];
    for (let index = 0; index + 1 < intersections.length; index += 2) {
      intervals.push({
        point: [(intersections[index] + intersections[index + 1]) / 2, latitude],
        width: intersections[index + 1] - intersections[index],
      });
    }
    const valid = intervals.filter(({ point }) => pointInPolygon(point, polygon)).sort((left, right) => right.width - left.width);
    if (valid.length) return valid[0].point;
  }
  return null;
}
function featureCenter(feature) {
  try {
    const geometry = feature?.geometry;
    const polygons = geometry?.type === "Polygon" ? [geometry.coordinates] : geometry?.type === "MultiPolygon" ? geometry.coordinates : [];
    const candidates = polygons
      .filter((polygon) => Array.isArray(polygon?.[0]) && polygon[0].length >= 3)
      .map((polygon) => ({ polygon, ...ringAreaAndCentroid(polygon[0]) }))
      .sort((left, right) => right.area - left.area);
    if (!candidates.length) return null;
    const main = candidates[0];
    const point = main.point && pointInPolygon(main.point, main.polygon)
      ? main.point
      : horizontalInteriorPoint(main.polygon, main.point?.[1]);
    return point && point.every(Number.isFinite) ? L.latLng(point[1], point[0]) : null;
  } catch { return null; }
}
function dataForChart(definition, village) {
  if (definition.source === "population") return [mapData[village]?.總人口?.男 || 0, mapData[village]?.總人口?.女 || 0];
  return definition.series.map((series) => definition.values?.[village]?.[series] ?? 0);
}
function createChartLayer(definition) {
  const group = L.layerGroup();
  if (typeof L.minichart !== "function") return group;
  (geojsonData.features || []).forEach((feature) => {
    const data = dataForChart(definition, villageName(feature)).map((value) => Number(value) || 0), center = featureCenter(feature);
    if (!center || !data.some((value) => value !== 0)) return;
    const options = {
      type: definition.chartType === "donut" ? "pie" : definition.chartType,
      data,
      colors: CHART_COLORS,
      width: 72 * exportScale,
      height: 72 * exportScale,
      labels: "auto",
      labelMinSize: 8 * exportScale,
      labelMaxSize: 24 * exportScale,
      pane: definition.id,
    };
    if (definition.chartType === "donut") options.innerRadius = 16 * exportScale;
    L.minichart(center, options).addTo(group);
  });
  return group;
}
function createLabelsLayer(definition) {
  const group = L.layerGroup(), skipped = [];
  (geojsonData.features || []).forEach((feature) => {
    const key = villageKey(feature), name = villageName(feature), position = labelPositions[key] || featureCenter(feature);
    if (!key || !position) { skipped.push(name); return; }
    const marker = L.marker(position, {
      pane: definition.id,
      draggable: true,
      keyboard: true,
      title: `${name}（可拖曳）`,
      icon: L.divIcon({ className: "village-label-icon", html: `<span>${escapeHtml(name)}</span>`, iconSize: null }),
    });
    marker.on("dragend", () => {
      const latlng = marker.getLatLng();
      labelPositions[key] = { lat: latlng.lat, lng: latlng.lng };
      saveLabelPositions();
    });
    marker.addTo(group);
  });
  if (skipped.length) appendStatus(`無法計算 ${skipped.join("、")} 的地名位置，已略過。`);
  return group;
}
function createLayer(definition) {
  if (definition.type === "chart") return createChartLayer(definition);
  if (definition.type === "labels") return createLabelsLayer(definition);
  return createGeoLayer(definition);
}
function setPanes() {
  layerRegistry.forEach((definition, index) => {
    const pane = leafletMap.getPane(definition.id) || leafletMap.createPane(definition.id);
    pane.style.zIndex = String(400 + index * 10);
  });
}
function refreshLayers() {
  if (!leafletMap || !geojsonData) return;
  renderedLayers.forEach((layer) => leafletMap.removeLayer(layer));
  renderedLayers.clear();
  setPanes();
  layerRegistry.filter((definition) => definition.visible).forEach((definition) => {
    const layer = createLayer(definition);
    layer.addTo(leafletMap);
    renderedLayers.set(definition.id, layer);
  });
  renderLegend();
}
function renderLegend() {
  const active = layerRegistry.filter((definition) => definition.visible);
  document.getElementById("map-legend").innerHTML = active.map((definition) => {
    if (definition.type === "chart") return `<span class="legend-item"><i style="background:${CHART_COLORS[0]}"></i>${escapeHtml(definition.name)}：${escapeHtml(definition.series.join("／"))}</span>`;
    if (definition.type === "labels") return '<span class="legend-item"><i class="legend-label">字</i>地名（可拖曳）</span>';
    return '<span class="legend-item"><i class="legend-boundary"></i>實心區域底圖</span>';
  }).join("") || "目前沒有顯示中的圖層。";
}
function renderLayerPanel() {
  const list = document.getElementById("layer-list"), uiLayers = [...layerRegistry].reverse();
  list.innerHTML = "";
  uiLayers.forEach((definition) => {
    const item = document.createElement("li");
    item.className = "layer-item";
    item.draggable = true;
    item.dataset.layerId = definition.id;
    item.innerHTML = `<span class="layer-drag-handle" aria-hidden="true">⠿</span><label class="layer-check"><input type="checkbox" ${definition.visible ? "checked" : ""}><span>${escapeHtml(definition.name)}</span></label><span class="hint">${definition.type === "chart" ? escapeHtml(definition.chartType) : ""}</span>${definition.shared ? `<button type="button" class="secondary layer-remove" aria-label="刪除 ${escapeHtml(definition.name)}">刪除</button>` : ""}`;
    item.querySelector("input").addEventListener("change", (event) => { definition.visible = event.target.checked; saveWorkspace(); refreshLayers(); });
    item.querySelector(".layer-remove")?.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!window.confirm(`確定要永久刪除共享圖層「${definition.name}」嗎？`)) return;
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await jsonFetch(`/api/map-custom-layers/${encodeURIComponent(definition.sharedId)}`, { method: "DELETE" });
        appendStatus(`已刪除共享圖層「${definition.name}」。`);
        await loadCustomLayers();
      } catch (error) {
        appendStatus(`刪除「${definition.name}」失敗：${error.message}`);
        button.disabled = false;
      }
    });
    item.addEventListener("dragstart", (event) => { event.dataTransfer.setData("text/plain", definition.id); item.classList.add("dragging"); });
    item.addEventListener("dragend", () => item.classList.remove("dragging"));
    item.addEventListener("dragover", (event) => { event.preventDefault(); item.classList.add("drag-over"); });
    item.addEventListener("dragleave", () => item.classList.remove("drag-over"));
    item.addEventListener("drop", (event) => {
      event.preventDefault();
      item.classList.remove("drag-over");
      const fromId = event.dataTransfer.getData("text/plain"), from = uiLayers.findIndex((layer) => layer.id === fromId), to = uiLayers.indexOf(definition);
      if (from >= 0 && from !== to) {
        uiLayers.splice(to, 0, uiLayers.splice(from, 1)[0]);
        layerRegistry = [...uiLayers].reverse();
        saveWorkspace(); renderLayerPanel(); refreshLayers();
      }
    });
    list.appendChild(item);
  });
}
function renderColorControls() {
  const wrap = document.getElementById("map-colors"); wrap.innerHTML = "";
  villageOrder.forEach(({ key, name }) => {
    const item = document.createElement("label"); item.className = "map-color-item";
    item.innerHTML = `<span>${escapeHtml(name)}</span><input type="color" value="${villageColors[key]}" aria-label="${escapeHtml(name)} 區域顏色">`;
    item.querySelector("input").addEventListener("input", (event) => { villageColors[key] = event.target.value; localStorage.setItem(MAP_COLOR_KEY, JSON.stringify(villageColors)); refreshLayers(); });
    wrap.appendChild(item);
  });
}
async function loadCustomLayers() {
  const { layers } = await jsonFetch("/api/map-custom-layers");
  const custom = layers.map((layer) => ({ id: `custom-${layer.id}`, sharedId: layer.id, shared: true, name: layer.name, type: "chart", chartType: layer.chart_type, series: layer.series, values: layer.values, visible: true }));
  mergeWorkspace([...builtInLayers(false), ...custom, { id: "village-labels", name: "地名", type: "labels", visible: true }]);
  saveWorkspace(); renderLayerPanel(); refreshLayers();
}
async function uploadCustomLayer(event) {
  event.preventDefault();
  const form = event.currentTarget, status = document.getElementById("custom-layer-upload-status"); status.textContent = "正在上傳並驗證 CSV…";
  try { await jsonFetch("/api/map-custom-layers", { method: "POST", body: new FormData(form) }); form.reset(); status.textContent = "圖層已新增至共享目錄。"; await loadCustomLayers(); }
  catch (error) { status.textContent = `上傳失敗：${error.message}`; }
}
async function createExistingDataLayer(event) {
  event.preventDefault();
  const form = event.currentTarget, status = document.getElementById("existing-layer-status");
  const data = Object.fromEntries(new FormData(form).entries());
  data.year = Number(data.year);
  if (data.data_type === "age") data.metric = null;
  status.textContent = "正在建立共享圖層…";
  try {
    await jsonFetch("/api/map-custom-layers/from-data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    form.querySelector('[name="name"]').value = "";
    status.textContent = "已從現有資料建立共享圖層。";
    await loadCustomLayers();
  } catch (error) { status.textContent = `建立失敗：${error.message}`; }
}
function syncPrintDimensions() {
  const widthInput = document.getElementById("custom-print-width"), heightInput = document.getElementById("custom-print-height");
  const width = Math.max(800, Number(widthInput.value) || 2560);
  widthInput.value = String(Math.round(width));
  heightInput.value = String(Math.round(width * 9 / 16));
}
function exportMap() {
  if (typeof L.easyPrint !== "function") { appendStatus("PNG 匯出元件尚未載入；地圖仍可正常使用。"); return; }
  if (exportInProgress) return;
  syncPrintDimensions();
  const width = Number(document.getElementById("custom-print-width").value), height = Number(document.getElementById("custom-print-height").value);
  const mapElement = document.getElementById("map"), capture = document.getElementById("map-capture-area"), button = document.getElementById("btn-export-map");
  const originalCenter = leafletMap.getCenter(), originalZoom = leafletMap.getZoom(), originalWidth = mapElement.clientWidth;
  let printer;
  const restore = () => {
    if (printer) leafletMap.removeControl(printer);
    mapElement.style.width = ""; mapElement.style.height = "";
    capture.classList.remove("map-exporting"); capture.style.removeProperty("--map-export-scale");
    exportScale = 1; exportInProgress = false; button.disabled = false;
    leafletMap.invalidateSize(); leafletMap.setView(originalCenter, originalZoom, { animate: false }); refreshLayers();
  };
  try {
    printer = L.easyPrint({ exportOnly: true, hideControlContainer: true, sizeModes: [{ width, height, className: "map-png-size" }], filename: `pengnan-map-${selectedYear || "custom"}` }).addTo(leafletMap);
    exportInProgress = true; button.disabled = true;
    exportScale = width / Math.max(originalWidth, 1);
    capture.style.setProperty("--map-export-scale", String(exportScale));
    capture.classList.add("map-exporting"); mapElement.style.width = `${width}px`; mapElement.style.height = `${height}px`;
    leafletMap.invalidateSize();
    leafletMap.setView(originalCenter, originalZoom + Math.log2(exportScale), { animate: false });
    refreshLayers();
    setTimeout(() => {
      try { printer.printMap("map-png-size", `pengnan-map-${selectedYear || "custom"}`); }
      catch (error) { appendStatus(`PNG 匯出失敗：${error.message}`); }
      finally { setTimeout(restore, 5000); }
    }, 350);
  } catch (error) { appendStatus(`PNG 匯出失敗：${error.message}`); restore(); }
}
async function initMap() {
  if (typeof L === "undefined") throw new Error("Leaflet 地圖元件載入失敗，請重新整理頁面。");
  const layerStatus = document.getElementById("map-layer-status");
  leafletMap = L.map("map", { scrollWheelZoom: false, attributionControl: false, zoomSnap: 0.01 });
  geojsonData = await jsonFetch("/static/data/geo/pengnan.geojson");
  if (!Array.isArray(geojsonData.features) || !geojsonData.features.length) throw new Error("GeoJSON 不包含可繪製的圖徵。");
  initVillageColors(); initLabelPositions(); renderColorControls();
  mergeWorkspace(builtInLayers()); saveWorkspace(); renderLayerPanel(); refreshLayers();
  leafletMap.fitBounds(L.geoJSON(geojsonData).getBounds(), { padding: [20, 20] });

  const yearSelect = document.getElementById("map-year");
  try {
    const status = await fetchStatus(), years = status.processed_years || [];
    const existingYearSelect = document.getElementById("existing-layer-year");
    years.forEach((year) => { yearSelect.add(new Option(year, year)); existingYearSelect.add(new Option(year, year)); });
    if (years.length) { yearSelect.value = years.at(-1); await loadMapData(yearSelect.value); refreshLayers(); }
    else appendStatus("尚無已彙整的人口資料；仍可檢視區域底圖、地名與共享圖層。");
  } catch (error) { appendStatus(`人口資料載入失敗：${error.message}；仍可檢視區域底圖。`); }
  try { await loadCustomLayers(); } catch (error) { appendStatus(`共享圖層載入失敗：${error.message}；仍可檢視內建圖層。`); }
  if (typeof L.minichart !== "function") appendStatus("圖表元件未載入，僅顯示區域與地名圖層。");
  if (typeof L.easyPrint !== "function") appendStatus("PNG 匯出元件未載入。");
  yearSelect.addEventListener("change", async () => { try { await loadMapData(yearSelect.value); refreshLayers(); } catch (error) { appendStatus(error.message); } });
  document.getElementById("custom-layer-upload").addEventListener("submit", uploadCustomLayer);
  document.getElementById("existing-data-layer-form").addEventListener("submit", createExistingDataLayer);
  document.getElementById("existing-layer-data-type").addEventListener("change", (event) => {
    document.getElementById("existing-layer-metric-field").hidden = event.target.value === "age";
  });
  document.getElementById("custom-print-width").addEventListener("input", syncPrintDimensions);
  document.getElementById("btn-reset-colors").addEventListener("click", () => { villageOrder.forEach(({ key, index }) => { villageColors[key] = DEFAULT_MAP_COLORS[index % DEFAULT_MAP_COLORS.length]; }); localStorage.setItem(MAP_COLOR_KEY, JSON.stringify(villageColors)); renderColorControls(); refreshLayers(); });
  document.getElementById("btn-export-map").addEventListener("click", exportMap);
}
document.addEventListener("DOMContentLoaded", () => initMap().catch((error) => { document.getElementById("map-info-content").textContent = `地圖載入失敗：${error.message}`; }));
