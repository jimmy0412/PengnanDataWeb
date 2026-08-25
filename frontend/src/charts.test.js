import { describe, expect, it } from "vitest";
import { chartHtml } from "./charts";

const series = (count) => Array.from({ length: count }, (_, index) => ({ id: `s${index}`, name: `系列 ${index}`, color: "#0072B2" }));

describe("map chart value labels", () => {
  it("labels every positive, negative, zero and decimal bar", () => {
    const items = series(4), layer = { name: "長條", visualization: { type: "bar" }, series: items, values: { A: { s0: 10, s1: -2, s2: 0, s3: 1.234 } } };
    const result = chartHtml(layer, "A", 80);
    expect((result.html.match(/chart-value-label/g) || [])).toHaveLength(4);
    expect(result.html).toContain(">10</text>");
    expect(result.html).toContain(">-2</text>");
    expect(result.html).toContain(">0</text>");
    expect(result.html).toContain(">1.23</text>");
  });
  it("labels only pie slices spanning at least thirty degrees", () => {
    const items = series(2), layer = { name: "圓餅", visualization: { type: "pie" }, series: items, values: { A: { s0: 23, s1: 1 } } };
    const result = chartHtml(layer, "A", 80);
    expect((result.html.match(/chart-slice-label/g) || [])).toHaveLength(1);
    expect(result.html).toContain(">23</text>");
    expect(result.html).not.toContain(">1</text>");
  });
  it("distinguishes a valid zero pie value from missing data", () => {
    const items = series(1), layer = { name: "出生", visualization: { type: "donut" }, series: items, values: { 五德里: { s0: 0 } } };
    const zero = chartHtml(layer, "五德里", 80);
    expect(zero.html).toContain("chart-zero-value");
    expect(zero.html).toContain(">0</text>");
    expect(zero.html).not.toContain("無資料");
    expect(chartHtml(layer, "不存在里", 80).html).toContain("無資料");
  });
  it("treats an incomplete pie row as missing data", () => {
    const items = series(2), layer = { name: "圓餅", visualization: { type: "pie" }, series: items, values: { A: { s0: 0 } } };
    expect(chartHtml(layer, "A", 80).html).toContain("無資料");
  });
});
