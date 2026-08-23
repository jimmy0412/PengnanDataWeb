import { describe, expect, it } from "vitest";
import { barLayout, chartSize, globalDomain, pieSize } from "./visualization";

const layer = { values: { A: { x: -10, y: 20 }, B: { x: 5, y: 0 } } };
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
