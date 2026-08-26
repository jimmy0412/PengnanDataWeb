import { describe, expect, it } from "vitest";
import { barLayout, chartSize, choroplethScale, DEFAULT_CHOROPLETH_COLORS, DEFAULT_MAP_BACKGROUND_COLOR, DEFAULT_VILLAGE_COLORS, globalDomain, NO_DATA_COLOR, pieSize, topVisibleChoropleth } from "./visualization";

const layer = { values: { A: { x: -10, y: 20 }, B: { x: 5, y: 0 } } };
describe("default map colors", () => {
  it("uses distinguishable pastel village colors without changing the sea background", () => {
    expect(DEFAULT_VILLAGE_COLORS).toEqual(["#8dd3c7", "#ffffb3", "#bebada", "#fb8072", "#80b1d3", "#fdb462", "#b3de69"]);
    expect(DEFAULT_MAP_BACKGROUND_COLOR).toBe("#aad3df");
  });
});

describe("shared visualization scales", () => {
  it("includes one global zero baseline for positive and negative bars", () => {
    expect(globalDomain(layer)).toEqual([-10, 20]);
    const layout = barLayout([-10, 20], globalDomain(layer), 80);
    expect(layout.bars[0].y).toBe(layout.zero);
    expect(layout.bars[1].y).toBeLessThan(layout.zero);
  });
  it("uses a stable all-zero domain", () => expect(globalDomain({ values: { A: { x: 0 } } })).toEqual([-1, 1]));
  it("scales pie area and bounds zoom size", () => {
    expect(pieSize(25, 100, 80)).toBe(40);
    expect(pieSize(0, 100, 80)).toBe(0);
    expect(chartSize(-20)).toBe(54);
    expect(chartSize(99)).toBe(112);
  });
});

describe("choropleth scales", () => {
  const choropleth = { kind: "choropleth", visible: true, series: [{ id: "value" }], visualization: { classes: 5, palette: ["#1", "#2", "#3", "#4", "#5"] }, values: { A: { value: -10 }, B: { value: 0 }, C: { value: 10 }, Missing: {} } };
  it("builds five non-overlapping equal intervals including negative values", () => {
    const scale = choroplethScale(choropleth);
    expect(scale.ranges).toHaveLength(5);
    expect(scale.ranges[0]).toMatchObject({ minimum: -10, maximum: -6, color: "#1" });
    expect(scale.ranges[4]).toMatchObject({ minimum: 6, maximum: 10, color: "#5" });
    expect(scale.ranges.map((range) => range.label)).toEqual(["-10--6", "-6--2", "-2-2", "2-6", "6-10"]);
    expect(scale.color(-10)).toBe("#1");
    expect(scale.color(10)).toBe("#5");
    expect(scale.color(undefined)).toBe(NO_DATA_COLOR);
  });
  it("uses one middle color for an all-equal dataset", () => {
    const scale = choroplethScale({ ...choropleth, values: { A: { value: 7 }, B: { value: 7 } } });
    expect(scale.ranges).toEqual([{ minimum: 7, maximum: 7, color: "#3", label: "7" }]);
    expect(scale.color(7)).toBe("#3");
  });
  it("upgrades the former blue default to the intuitive heat palette", () => {
    const scale = choroplethScale({ ...choropleth, visualization: { classes: 5, palette: ["#eff3ff", "#bdd7e7", "#6baed6", "#3182bd", "#08519c"] } });
    expect(scale.ranges.map((range) => range.color)).toEqual(DEFAULT_CHOROPLETH_COLORS);
    expect(scale.color(-10)).toBe("#ffffb2");
    expect(scale.color(10)).toBe("#bd0026");
  });
  it("selects only the topmost visible choropleth", () => {
    const bottom = { ...choropleth, id: "bottom" }, top = { ...choropleth, id: "top" };
    expect(topVisibleChoropleth([bottom, { kind: "chart", visible: true }, top])).toBe(top);
    expect(topVisibleChoropleth([bottom, { ...top, visible: false }])).toBe(bottom);
  });
});
