import { useEffect } from "react";
import L from "leaflet";
import { GeoJSON, MapContainer, Marker, Pane, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { chartHtml } from "./charts";
import { featureInteriorPoint, villageKey, villageName } from "./geo";
import { chartSize } from "./visualization";

function MapLifecycle({ geojson, onMap, onZoom }) {
  const map = useMap();
  useMapEvents({ zoomend: () => onZoom(map.getZoom()) });
  useEffect(() => { onMap(map); if (geojson?.features?.length) map.fitBounds(L.geoJSON(geojson).getBounds(), { padding: [20, 20] }); }, [map, geojson, onMap]);
  return null;
}
function Boundary({ layer, geojson, colors, selected, onSelect }) {
  return <Pane name={layer.id} style={{ zIndex: layer.zIndex }}><GeoJSON key={`${JSON.stringify(colors)}-${selected?.village || ""}`} data={geojson} style={(feature) => ({ color: selected?.village === villageName(feature) ? "#111827" : "#374151", weight: selected?.village === villageName(feature) ? 4 : 1.5, fillColor: colors[villageKey(feature)] || "#1f77b4", fillOpacity: 1 })} onEachFeature={(feature, item) => item.on({ click: () => onSelect({ village: villageName(feature), layerId: "population" }) })}/></Pane>;
}
function Charts({ layer, geojson, zoom, selected, onSelect }) {
  return <Pane name={layer.id} style={{ zIndex: layer.zIndex }}>{geojson.features.map((feature) => {
    const village = villageName(feature), position = featureInteriorPoint(feature); if (!position) return null;
    const chart = chartHtml(layer, village, chartSize(zoom));
    const icon = L.divIcon({ className: `react-chart-icon ${selected?.village === village && selected?.layerId === layer.id ? "selected" : ""}`, html: chart.html, iconSize: [chart.size, chart.size], iconAnchor: [chart.size / 2, chart.size / 2] });
    const row = layer.values?.[village] || {};
    return <Marker key={`${layer.id}-${village}-${zoom}`} position={position} icon={icon} keyboard eventHandlers={{ click: () => onSelect({ village, layerId: layer.id }) }} title={`${village} ${layer.name}`}><Tooltip direction="top"><strong>{village} · {layer.name}</strong>{layer.series.map((series) => <span className="map-tooltip-row" key={series.id}>{series.name}：{row[series.id] ?? "—"}</span>)}</Tooltip></Marker>;
  })}</Pane>;
}
function Labels({ layer, geojson, positions, onMove }) {
  return <Pane name={layer.id} style={{ zIndex: layer.zIndex }}>{geojson.features.map((feature) => {
    const id = villageKey(feature), name = villageName(feature), position = positions[id] ? [positions[id].lat, positions[id].lng] : featureInteriorPoint(feature); if (!position) return null;
    const icon = L.divIcon({ className: "react-village-label", html: `<span>${name}</span>`, iconSize: null });
    return <Marker key={`${id}-${position}`} position={position} icon={icon} draggable keyboard title={`${name}（可拖曳）`} eventHandlers={{ dragend: (event) => { const point = event.target.getLatLng(); onMove(id, { lat: point.lat, lng: point.lng }); } }}/>;
  })}</Pane>;
}
export default function MapCanvas({ geojson, layers, colors, backgroundColor, labelPositions, selected, onSelect, onLabelMove, onMap, zoom, onZoom }) {
  if (!geojson) return <div className="map-loading" role="status">正在載入地圖資料…</div>;
  return <MapContainer className="map" style={{ backgroundColor }} center={[23.52, 119.58]} zoom={13} scrollWheelZoom={false} attributionControl={false} zoomSnap={0.25}>
    <MapLifecycle geojson={geojson} onMap={onMap} onZoom={onZoom}/>
    {layers.filter((layer) => layer.visible).map((layer, index) => {
      const item = { ...layer, zIndex: 400 + index * 20 };
      if (item.kind === "boundary") return <Boundary key={item.id} layer={item} geojson={geojson} colors={colors} selected={selected} onSelect={onSelect}/>;
      if (item.kind === "labels") return <Labels key={item.id} layer={item} geojson={geojson} positions={labelPositions} onMove={onLabelMove}/>;
      return <Charts key={`${item.id}-${JSON.stringify(item.values)}`} layer={item} geojson={geojson} zoom={zoom} selected={selected} onSelect={onSelect}/>;
    })}
  </MapContainer>;
}
