import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChoroplethLegend } from "./Legend";

describe("ChoroplethLegend", () => {
  it("renders the layer title, five value ranges and unit", () => {
    const layer = { name: "總人口", series: [{ id: "value" }], source: { unit: "人" }, visualization: { classes: 5, palette: ["#ffffb2", "#fecc5c", "#fd8d3c", "#f03b20", "#bd0026"] }, values: { A: { value: 0 }, B: { value: 100 } } };
    render(<ChoroplethLegend layer={layer}/>);
    expect(screen.getByRole("complementary", { name: "總人口 面量圖圖例" })).toBeInTheDocument();
    expect(screen.getAllByText(/人$/)).toHaveLength(5);
  });
});
