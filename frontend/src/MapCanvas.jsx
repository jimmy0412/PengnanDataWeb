import { useEffect, useRef } from "react";
import L from "leaflet";
import { GeoJSON, MapContainer, Marker, Pane, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { chartHtml } from "./charts";
import { featureInteriorPoint, villageKey, villageName } from "./geo";
import { chartSize, choroplethScale, DEFAULT_VILLAGE_COLORS, formatMapNumber, NO_DATA_COLOR } from "./visualization";

function MapLifecycle({ geojson, onMap, onZoom, onClearSelection }) {
  const map = useMap();
  useMapEvents({ zoomend: () => onZoom(map.getZoom()), click: onClearSelection });
  useEffect(() => { onMap(map); if (geojson?.features?.length) map.fitBounds(L.geoJSON(geojson).getBounds(), { padding: [20, 20] }); }, [map, geojson, onMap]);
  return null;
}
export function deviceSupportsHover() {
  return typeof window === "undefined" || !window.matchMedia || window.matchMedia("(hover: hover)").matches;
}
export function shouldToggleSelection(event) {
  const original = event?.originalEvent;
  return !deviceSupportsHover() || original?.pointerType === "touch" || original?.pointerType === "pen" || original?.detail === 0;
}
export function interactionHandlers(value, onHover, onToggle) {
  return {
    mouseover: () => { if (deviceSupportsHover()) onHover(value); },
    mouseout: () => { if (deviceSupportsHover()) onHover(null); },
    click: (event) => {
      if (!shouldToggleSelection(event)) return;
      if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
      onToggle(value);
    },
  };
}
export function LayerPane({ layer, children, className }) {
  const paneRef = useRef(null);
  useEffect(() => {
    if (paneRef.current) paneRef.current.style.zIndex = String(layer.zIndex);
  }, [layer.zIndex]);
  return <Pane ref={paneRef} name={layer.id} className={className} style={{ zIndex: layer.zIndex }}>{children}</Pane>;
}
function Boundary({ layer, geojson, colors, active, onHover, onToggle }) {
  return <LayerPane layer={layer}><GeoJSON key={JSON.stringify(colors)} data={geojson} style={(feature) => { const highlighted = active?.village === villageName(feature) && active?.layerId === "population"; return { color: highlighted ? "#111827" : "#374151", weight: highlighted ? 4 : 1.5, fillColor: colors[villageKey(feature)] || DEFAULT_VILLAGE_COLORS[0], fillOpacity: 1 }; }} onEachFeature={(feature, item) => { const value = { village: villageName(feature), layerId: "population" }; item.on(interactionHandlers(value, onHover, onToggle)); }}/></LayerPane>;
}
function Choropleth({ layer, geojson, active, onHover, onToggle }) {
  const itemRef = useRef(null), scale = choroplethScale(layer), series = layer.series[0], patternId = `no-data-${layer.id.replace(/[^A-Za-z0-9_-]/g, "")}`;
  useEffect(() => {
    const path = itemRef.current?.getLayers?.()[0]?._path, svg = path?.ownerSVGElement;
    if (!svg || svg.querySelector(`#${patternId}`)) return;
    const ns = "http://www.w3.org/2000/svg", defs = document.createElementNS(ns, "defs"), pattern = document.createElementNS(ns, "pattern"), background = document.createElementNS(ns, "rect"), stripe = document.createElementNS(ns, "path");
    pattern.setAttribute("id", patternId); pattern.setAttribute("width", "8"); pattern.setAttribute("height", "8"); pattern.setAttribute("patternUnits", "userSpaceOnUse");
    background.setAttribute("width", "8"); background.setAttribute("height", "8"); background.setAttribute("fill", NO_DATA_COLOR);
    stripe.setAttribute("d", "M-2,2 L2,-2 M0,8 L8,0 M6,10 L10,6"); stripe.setAttribute("stroke", "#94a3b8"); stripe.setAttribute("stroke-width", "2");
    pattern.append(background, stripe); defs.append(pattern); svg.prepend(defs);
  }, [patternId, geojson]);
  return <LayerPane layer={layer}><GeoJSON ref={itemRef} key={`${layer.id}-${JSON.stringify(layer.values)}`} data={geojson} style={(feature) => {
    const village = villageName(feature), value = layer.values?.[village]?.[series.id], hasValue = Number.isFinite(Number(value)), highlighted = active?.village === village && active?.layerId === layer.id;
    return { color: highlighted ? "#111827" : "#334155", weight: highlighted ? 4 : 1.5, fillColor: hasValue ? scale.color(value) : `url(#${patternId})`, fillOpacity: .8 };
  }} onEachFeature={(feature, shape) => {
    const village = villageName(feature), value = layer.values?.[village]?.[series.id], text = Number.isFinite(Number(value)) ? `${formatMapNumber(value)}${layer.source?.unit || ""}` : "無資料";
    const tooltip = document.createElement("div"), heading = document.createElement("strong"), detail = document.createElement("span");
    heading.textContent = `${village} · ${layer.name}`; detail.className = "map-tooltip-row"; detail.textContent = `${series.name}：${text}`; tooltip.append(heading, detail); shape.bindTooltip(tooltip);
    shape.on(interactionHandlers({ village, layerId: layer.id }, onHover, onToggle));
  }}/></LayerPane>;
}
function Charts({ layer, geojson, zoom, active, onHover, onToggle }) {
  return <LayerPane layer={layer}>{geojson.features.map((feature) => {
    const village = villageName(feature), position = featureInteriorPoint(feature); if (!position) return null;
    const chart = chartHtml(layer, village, chartSize(zoom));
    const icon = L.divIcon({ className: `react-chart-icon ${active?.village === village && active?.layerId === layer.id ? "active" : ""}`, html: chart.html, iconSize: [chart.size, chart.size], iconAnchor: [chart.size / 2, chart.size / 2] });
    const row = layer.values?.[village] || {};
    return <Marker key={`${layer.id}-${village}-${zoom}`} position={position} icon={icon} keyboard eventHandlers={interactionHandlers({ village, layerId: layer.id }, onHover, onToggle)} title={`${village} ${layer.name}`}><Tooltip direction="top"><strong>{village} · {layer.name}</strong>{layer.series.map((series) => <span className="map-tooltip-row" key={series.id}>{series.name}：{row[series.id] ?? "—"}</span>)}</Tooltip></Marker>;
  })}</LayerPane>;
}
function Labels({ layer, geojson, positions, onMove }) {
  return <LayerPane layer={layer}>{geojson.features.map((feature) => {
    const id = villageKey(feature), name = villageName(feature), position = positions[id] ? [positions[id].lat, positions[id].lng] : featureInteriorPoint(feature); if (!position) return null;
    const icon = L.divIcon({ className: "react-village-label", html: `<span>${name}</span>`, iconSize: null });
    return <Marker key={`${id}-${position}`} position={position} icon={icon} draggable keyboard title={`${name}（可拖曳）`} eventHandlers={{ dragend: (event) => { const point = event.target.getLatLng(); onMove(id, { lat: point.lat, lng: point.lng }); } }}/>;
  })}</LayerPane>;
}
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
export function normalizedTitlePosition(clientX, clientY, containerRect, titleRect, offset = { x: 0, y: 0 }) {
  const width = Math.max(1, containerRect.width), height = Math.max(1, containerRect.height);
  const halfWidth = Math.min(titleRect.width / 2, width / 2), halfHeight = Math.min(titleRect.height / 2, height / 2);
  const centerX = clamp(clientX - offset.x - containerRect.left, halfWidth, width - halfWidth);
  const centerY = clamp(clientY - offset.y - containerRect.top, halfHeight, height - halfHeight);
  return { x: centerX / width, y: centerY / height };
}
export function Title({ layer, settings, onMove }) {
  const dragging = useRef(false), offset = useRef({ x: 0, y: 0 });
  if (!settings.text.trim()) return null;
  const move = (event) => {
    if (!dragging.current) return;
    event.preventDefault(); event.stopPropagation();
    onMove(normalizedTitlePosition(event.clientX, event.clientY, event.currentTarget.parentElement.getBoundingClientRect(), event.currentTarget.getBoundingClientRect(), offset.current));
  };
  return <div className="react-map-title" role="heading" aria-level="1" style={{ left: `${settings.position.x * 100}%`, top: `${settings.position.y * 100}%`, zIndex: layer.zIndex, color: settings.color, fontSize: `${settings.fontSize}px` }} onPointerDown={(event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    dragging.current = true; offset.current = { x: event.clientX - (rect.left + rect.width / 2), y: event.clientY - (rect.top + rect.height / 2) };
    event.currentTarget.setPointerCapture?.(event.pointerId); event.preventDefault(); event.stopPropagation();
  }} onPointerMove={move} onPointerUp={(event) => { dragging.current = false; event.currentTarget.releasePointerCapture?.(event.pointerId); event.stopPropagation(); }} onPointerCancel={() => { dragging.current = false; }}>{settings.text}</div>;
}
export default function MapCanvas({ geojson, layers, colors, backgroundColor, labelPositions, titleSettings, active, onHover, onToggle, onClearSelection, onLabelMove, onTitleMove, onMap, zoom, onZoom }) {
  if (!geojson) return <div className="map-loading" role="status">正在載入地圖資料…</div>;
  const visibleLayers = layers.filter((layer) => layer.visible), titleIndex = visibleLayers.findIndex((layer) => layer.kind === "title"), titleLayer = titleIndex < 0 ? null : { ...visibleLayers[titleIndex], zIndex: 800 + titleIndex * 20 };
  return <div className="map-stage"><MapContainer className="map" style={{ backgroundColor }} center={[23.52, 119.58]} zoom={13} scrollWheelZoom={false} attributionControl={false} zoomSnap={0.25}>
    <MapLifecycle geojson={geojson} onMap={onMap} onZoom={onZoom} onClearSelection={onClearSelection}/>
    {visibleLayers.filter((layer) => layer.kind !== "title").map((layer, index) => {
      const item = { ...layer, zIndex: 400 + index * 20 };
      if (item.kind === "boundary") return <Boundary key={item.id} layer={item} geojson={geojson} colors={colors} active={active} onHover={onHover} onToggle={onToggle}/>;
      if (item.kind === "choropleth") return <Choropleth key={item.id} layer={item} geojson={geojson} active={active} onHover={onHover} onToggle={onToggle}/>;
      if (item.kind === "labels") return <Labels key={item.id} layer={item} geojson={geojson} positions={labelPositions} onMove={onLabelMove}/>;
      return <Charts key={`${item.id}-${JSON.stringify(item.values)}`} layer={item} geojson={geojson} zoom={zoom} active={active} onHover={onHover} onToggle={onToggle}/>;
    })}
  </MapContainer>{titleLayer && <Title layer={titleLayer} settings={titleSettings} onMove={onTitleMove}/>}</div>;
}
