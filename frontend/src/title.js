export const TITLE_TEXT_MAX_LENGTH = 100;
export const TITLE_FONT_SIZE_MIN = 16;
export const TITLE_FONT_SIZE_MAX = 72;
export const DEFAULT_TITLE_SETTINGS = Object.freeze({
  text: "澎南區地圖",
  fontSize: 32,
  color: "#111827",
  position: Object.freeze({ x: 0.5, y: 0.08 }),
});

const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const inUnitRange = (value) => Number.isFinite(value) && value >= 0 && value <= 1;

export function sanitizeTitleSettings(value = {}) {
  const fontSize = Number(value?.fontSize);
  const position = value?.position;
  return {
    text: typeof value?.text === "string" ? value.text.slice(0, TITLE_TEXT_MAX_LENGTH) : DEFAULT_TITLE_SETTINGS.text,
    fontSize: Number.isFinite(fontSize)
      ? Math.max(TITLE_FONT_SIZE_MIN, Math.min(TITLE_FONT_SIZE_MAX, Math.round(fontSize)))
      : DEFAULT_TITLE_SETTINGS.fontSize,
    color: COLOR_PATTERN.test(value?.color || "") ? value.color : DEFAULT_TITLE_SETTINGS.color,
    position: inUnitRange(position?.x) && inUnitRange(position?.y)
      ? { x: position.x, y: position.y }
      : { ...DEFAULT_TITLE_SETTINGS.position },
  };
}

export function updateTitleSettings(current, changes) {
  return sanitizeTitleSettings({ ...current, ...changes });
}
