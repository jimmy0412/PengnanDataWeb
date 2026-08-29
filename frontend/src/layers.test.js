import { describe, expect, it } from "vitest";
import { builtInLayers, mergeLayers, populationValues } from "./layers";

describe("map layer definitions", () => {
  it("keeps loaded population values when the shared catalog is refreshed", () => {
    const values = { 鐵線里: { male: 321, female: 345 } };
    const current = builtInLayers().map((layer) => layer.id === "population" ? { ...layer, values } : layer);
    const custom = [{ id: "custom", name: "新圖層", kind: "chart", series: [{ id: "value", name: "值" }], values: {}, visualization: { type: "bar", scale: "global" }, source: { type: "csv" } }];
    const saved = [{ id: "custom", visible: true }, { id: "population", visible: false }, { id: "boundary", visible: true }, { id: "village-labels", visible: true }];

    const merged = mergeLayers(custom, saved, current, { male: "#112233", female: "#aabbcc" });

    expect(merged.map((layer) => layer.id)).toEqual(["custom", "population", "boundary", "village-labels", "map-title"]);
    expect(merged.find((layer) => layer.id === "population")).toMatchObject({
      visible: false,
      values,
      series: [{ color: "#112233" }, { color: "#aabbcc" }],
    });
  });

  it("adds a visible title above new and previously saved workspaces", () => {
    expect(builtInLayers().at(-1)).toMatchObject({ id: "map-title", kind: "title", visible: true });
    expect(mergeLayers([], [{ id: "boundary", visible: true }]).at(-1)).toMatchObject({ id: "map-title", visible: true });
  });

  it("normalizes population rows for the built-in series", () => {
    expect(populationValues([{ 里: "鐵線里", 總人口: { 男: "12", 女: 15 } }])).toEqual({
      鐵線里: { male: 12, female: 15 },
    });
  });
});
