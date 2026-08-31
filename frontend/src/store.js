import { DEFAULT_MAP_BACKGROUND_COLOR } from "./visualization";
import { DEFAULT_TITLE_SETTINGS, updateTitleSettings } from "./title";

export const initialState = { year: null, layers: [], hovered: null, selected: null, villageColors: {}, mapBackgroundColor: DEFAULT_MAP_BACKGROUND_COLOR, labelPositions: {}, titleSettings: { ...DEFAULT_TITLE_SETTINGS, position: { ...DEFAULT_TITLE_SETTINGS.position } }, export: { active: false, error: null }, status: [] };

const sameSelection = (left, right) => left?.village === right?.village && left?.layerId === right?.layerId;

export function activeSelection(state) {
  return state.hovered || state.selected;
}

export function reducer(state, action) {
  switch (action.type) {
    case "hydrate": return { ...state, ...action.payload };
    case "year": return { ...state, year: Number(action.year) };
    case "hover": return { ...state, hovered: action.value };
    case "toggleSelect": return { ...state, selected: sameSelection(state.selected, action.value) ? null : action.value };
    case "clearSelect": return { ...state, selected: null };
    case "toggle": return { ...state, layers: state.layers.map((layer) => layer.id === action.id ? { ...layer, visible: !layer.visible } : layer) };
    case "move": { const layers = [...state.layers], from = layers.findIndex((layer) => layer.id === action.id), to = Math.max(0, Math.min(layers.length - 1, from + action.delta)); if (from < 0 || from === to) return state; layers.splice(to, 0, layers.splice(from, 1)[0]); return { ...state, layers }; }
    case "layers": return { ...state, layers: action.layers };
    case "populationValues": return { ...state, layers: state.layers.map((layer) => layer.id === "population" ? { ...layer, values: action.values } : layer) };
    case "seriesColor": return { ...state, layers: state.layers.map((layer) => layer.id !== action.layerId ? layer : { ...layer, series: layer.series.map((series) => series.id !== action.seriesId || (action.ifColor && series.color !== action.ifColor) ? series : { ...series, color: action.color }) }) };
    case "color": return { ...state, villageColors: { ...state.villageColors, [action.id]: action.color } };
    case "backgroundColor": return { ...state, mapBackgroundColor: action.color };
    case "label": return { ...state, labelPositions: { ...state.labelPositions, [action.id]: action.position } };
    case "resetLabels": return { ...state, labelPositions: {} };
    case "title": return { ...state, titleSettings: updateTitleSettings(state.titleSettings, action.changes) };
    case "resetTitlePosition": return { ...state, titleSettings: { ...state.titleSettings, position: { ...DEFAULT_TITLE_SETTINGS.position } } };
    case "export": return { ...state, export: { active: action.active, error: action.error || null } };
    case "status": return { ...state, status: [...state.status, action.message] };
    default: return state;
  }
}
