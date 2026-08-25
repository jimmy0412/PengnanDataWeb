import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "./App";
import { api } from "./api";

vi.mock("./MapCanvas", () => ({ default: () => <div data-testid="map-canvas"/> }));
vi.mock("./api", () => ({
  api: {
    geojson: vi.fn(() => new Promise(() => {})),
    status: vi.fn(() => new Promise(() => {})),
    layers: vi.fn(() => new Promise(() => {})),
    villageData: vi.fn(() => new Promise(() => {})),
    updateColors: vi.fn(() => new Promise(() => {})),
  },
}));

describe("App workspace", () => {
  it("places PNG export immediately below the layer workspace", () => {
    const { container } = render(<App config={{}}/>);
    const headings = [...container.querySelectorAll(".map-workspace > details > summary")].map((item) => item.textContent);

    expect(headings).toEqual([
      "圖層工作區",
      "PNG 匯出設定",
      "新增共享資料圖層",
      "區域色彩設定",
    ]);
  });

  it("keeps the normal legend outside the exported map area", () => {
    const { container } = render(<App config={{}}/>);

    expect(container.querySelector("#map-capture-area .capture-legend")).not.toBeInTheDocument();
    expect(container.querySelector(".map-canvas-panel > .map-legend")).toHaveTextContent("目前沒有顯示中的圖表圖層。");
  });

  it("updates shared colors immediately and rolls back a failed save", async () => {
    let rejectUpdate;
    api.geojson.mockResolvedValueOnce({ type: "FeatureCollection", features: [] });
    api.status.mockResolvedValueOnce({ processed_years: [114] });
    api.layers.mockResolvedValueOnce({ schema_version: 2, layers: [{
      id: "pie", name: "共享圓餅", kind: "chart", visualization: { type: "pie", scale: "global" }, visible: true,
      series: [{ id: "value", name: "數值", color: "#112233" }], values: {}, source: { type: "csv" },
    }] });
    api.villageData.mockResolvedValueOnce({ villages: [] });
    api.updateColors.mockImplementationOnce(() => new Promise((resolve, reject) => { rejectUpdate = reject; }));
    const { container } = render(<App config={{}}/>);
    const picker = await screen.findByLabelText("共享圓餅 數值 顏色");
    fireEvent.change(picker, { target: { value: "#abcdef" } });
    expect(picker).toHaveValue("#abcdef");
    const sharedLegend = [...container.querySelectorAll(".legend-layer")].find((item) => item.textContent.includes("共享圓餅"));
    expect(sharedLegend.querySelector(".legend-item i")).toHaveStyle({ background: "#abcdef" });
    expect(api.updateColors).toHaveBeenCalledWith("pie", { value: "#abcdef" });
    rejectUpdate(new Error("無法儲存"));
    await waitFor(() => expect(picker).toHaveValue("#112233"));
    expect(container.querySelector(".map-layer-status")).toHaveTextContent("顏色儲存失敗：無法儲存");
  });
});
