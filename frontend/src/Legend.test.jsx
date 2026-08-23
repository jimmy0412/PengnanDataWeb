import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChoroplethLegend } from "./Legend";

describe("ChoroplethLegend", () => {
  it("renders the metric and unit in the title and simple value ranges", () => {
    const layer = { name: "使用者命名", series: [{ id: "value", name: "總人口" }], source: { metric: "總人口", unit: "人" }, visualization: { classes: 5, palette: ["#ffffb2", "#fecc5c", "#fd8d3c", "#f03b20", "#bd0026"] }, values: { A: { value: 0 }, B: { value: 100 } } };
    render(<ChoroplethLegend layer={layer}/>);
    expect(screen.getByRole("complementary", { name: "總人口（人） 面量圖圖例" })).toBeInTheDocument();
    expect(screen.getByText("總人口（人）")).toBeInTheDocument();
    expect(screen.getByText("0-20")).toBeInTheDocument();
    expect(screen.getByText("80-100")).toBeInTheDocument();
    expect(screen.queryByText("使用者命名")).not.toBeInTheDocument();
    expect(screen.queryByText(/≤/)).not.toBeInTheDocument();
  });

  it("uses the CSV value-column name without inventing a unit", () => {
    const layer = { name: "我的面量圖", series: [{ id: "density", name: "人口密度" }], source: { type: "csv" }, visualization: { classes: 5 }, values: { A: { density: 3 }, B: { density: 8 } } };
    render(<ChoroplethLegend layer={layer}/>);
    expect(screen.getByRole("complementary", { name: "人口密度 面量圖圖例" })).toBeInTheDocument();
    expect(screen.getByText("人口密度")).toBeInTheDocument();
    expect(screen.queryByText("我的面量圖")).not.toBeInTheDocument();
  });
});
