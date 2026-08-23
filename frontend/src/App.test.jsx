import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "./App";

vi.mock("./MapCanvas", () => ({ default: () => <div data-testid="map-canvas"/> }));
vi.mock("./api", () => ({
  api: {
    geojson: vi.fn(() => new Promise(() => {})),
    status: vi.fn(() => new Promise(() => {})),
    layers: vi.fn(() => new Promise(() => {})),
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
});
