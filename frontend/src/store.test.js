import { describe, expect, it } from "vitest";
import { initialState, reducer } from "./store";

describe("map reducer", () => {
  it("toggles and keyboard-moves layers without mutation", () => {
    const state = { ...initialState, layers: [{ id: "a", visible: true }, { id: "b", visible: true }] };
    const toggled = reducer(state, { type: "toggle", id: "a" });
    expect(toggled.layers[0].visible).toBe(false);
    expect(state.layers[0].visible).toBe(true);
    expect(reducer(toggled, { type: "move", id: "a", delta: 1 }).layers.map((item) => item.id)).toEqual(["b", "a"]);
  });
  it("updates the map background independently from village colors", () => {
    const updated = reducer(initialState, { type: "backgroundColor", color: "#abcdef" });
    expect(updated.mapBackgroundColor).toBe("#abcdef");
    expect(updated.villageColors).toEqual({});
  });
  it("restores every village label to its initial position", () => {
    const state = { ...initialState, labelPositions: { village: { lat: 23, lng: 119 } } };
    expect(reducer(state, { type: "resetLabels" }).labelPositions).toEqual({});
  });
  it("updates population values without replacing concurrently loaded layers", () => {
    const state = { ...initialState, layers: [{ id: "population", values: {} }, { id: "new-layer", values: { A: { x: 1 } } }] };
    const values = { A: { male: 10, female: 11 } };
    const updated = reducer(state, { type: "populationValues", values });
    expect(updated.layers[0].values).toBe(values);
    expect(updated.layers[1]).toBe(state.layers[1]);
  });
  it("updates and conditionally rolls back one series color", () => {
    const other = { id: "other", series: [{ id: "x", color: "#999999" }] };
    const state = { ...initialState, layers: [{ id: "pie", series: [{ id: "a", color: "#111111" }, { id: "b", color: "#222222" }] }, other] };
    const updated = reducer(state, { type: "seriesColor", layerId: "pie", seriesId: "b", color: "#abcdef" });
    expect(updated.layers[0].series).toEqual([{ id: "a", color: "#111111" }, { id: "b", color: "#abcdef" }]);
    expect(updated.layers[1]).toBe(other);
    expect(reducer(updated, { type: "seriesColor", layerId: "pie", seriesId: "b", color: "#222222", ifColor: "#000000" }).layers[0].series[1].color).toBe("#abcdef");
    expect(reducer(updated, { type: "seriesColor", layerId: "pie", seriesId: "b", color: "#222222", ifColor: "#abcdef" }).layers[0].series[1].color).toBe("#222222");
  });
});
