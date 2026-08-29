import { DEFAULT_GENDER_COLORS } from "./visualization";
import { sanitizeTitleSettings } from "./title";

export const STORAGE_KEY = "pengnan.map.v3";
export const GENDER_COLOR_KEY = "penghu_population_colors";
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const OLD_KEYS = { workspace: "pengnan_map_workspace_v2", colors: "pengnan_map_colors", labels: "pengnan_map_label_positions_v1" };
function read(storage, key, fallback) { try { return JSON.parse(storage.getItem(key)) ?? fallback; } catch { return fallback; } }
function validPosition(value) { return Number.isFinite(value?.lat) && Number.isFinite(value?.lng) && Math.abs(value.lat) <= 90 && Math.abs(value.lng) <= 180; }

export function loadWorkspace(storage, layerIds = [], villageIds = []) {
  const current = read(storage, STORAGE_KEY, null), allowedLayers = new Set(layerIds), allowedVillages = new Set(villageIds);
  const raw = current || { layers: read(storage, OLD_KEYS.workspace, []), villageColors: read(storage, OLD_KEYS.colors, {}), labelPositions: read(storage, OLD_KEYS.labels, {}) };
  const seen = new Set();
  const layers = Array.isArray(raw.layers) ? raw.layers.filter((item) => item && allowedLayers.has(item.id) && !seen.has(item.id) && seen.add(item.id)).map((item) => ({ id: item.id, visible: typeof item.visible === "boolean" ? item.visible : true })) : [];
  const villageColors = Object.fromEntries(Object.entries(raw.villageColors || {}).filter(([id, color]) => allowedVillages.has(id) && COLOR_PATTERN.test(color)));
  const mapBackgroundColor = COLOR_PATTERN.test(raw.mapBackgroundColor || "") ? raw.mapBackgroundColor : null;
  const labelPositions = Object.fromEntries(Object.entries(raw.labelPositions || {}).filter(([id, value]) => allowedVillages.has(id) && validPosition(value)));
  const titleSettings = sanitizeTitleSettings(raw.titleSettings);
  if (!current) storage.setItem(STORAGE_KEY, JSON.stringify({ layers, villageColors, mapBackgroundColor, labelPositions, titleSettings, migrated: true }));
  return { layers, villageColors, mapBackgroundColor, labelPositions, titleSettings };
}
export function saveWorkspace(storage, state) { storage.setItem(STORAGE_KEY, JSON.stringify({ layers: state.layers.map(({ id, visible }) => ({ id, visible })), villageColors: state.villageColors, mapBackgroundColor: state.mapBackgroundColor, labelPositions: state.labelPositions, titleSettings: sanitizeTitleSettings(state.titleSettings) })); }

export function loadGenderColors(storage) {
  const saved = read(storage, GENDER_COLOR_KEY, {});
  return {
    male: COLOR_PATTERN.test(saved?.male || "") ? saved.male : DEFAULT_GENDER_COLORS.male,
    female: COLOR_PATTERN.test(saved?.female || "") ? saved.female : DEFAULT_GENDER_COLORS.female,
  };
}
