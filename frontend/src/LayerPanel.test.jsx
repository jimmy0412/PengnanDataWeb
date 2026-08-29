import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LayerPanel from "./LayerPanel";

describe("LayerPanel", () => {
  it("offers checkbox and keyboard-accessible move controls", () => {
    const dispatch = vi.fn();
    render(<LayerPanel layers={[{ id: "bottom", name: "底層", visible: true }, { id: "top", name: "頂層", visible: true }]} dispatch={dispatch} onDelete={() => {}}/>);
    fireEvent.click(screen.getByRole("button", { name: "下移 頂層" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "move", id: "top", delta: -1 });
    fireEvent.click(screen.getByRole("checkbox", { name: "底層" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "toggle", id: "bottom" });
  });

  it("reorders the title layer with the same mouse drag handle as other layers", () => {
    const dispatch = vi.fn(), data = {};
    const dataTransfer = { setData: vi.fn((type, value) => { data[type] = value; }), getData: vi.fn((type) => data[type] || ""), effectAllowed: "", dropEffect: "" };
    const { container } = render(<LayerPanel layers={[{ id: "bottom", name: "底層", visible: true }, { id: "map-title", name: "地圖標題", kind: "title", visible: true }]} dispatch={dispatch} onDelete={() => {}} titleSettings={{ text: "標題", fontSize: 32, color: "#111827", position: { x: 0.5, y: 0.08 } }}/>);
    fireEvent.dragStart(screen.getByRole("button", { name: "拖曳 地圖標題" }), { dataTransfer });
    const bottomItem = [...container.querySelectorAll(".layer-item")].find((item) => item.textContent.includes("底層"));
    fireEvent.drop(bottomItem, { dataTransfer });
    expect(dataTransfer.setData).toHaveBeenCalledWith("text/plain", "map-title");
    expect(dispatch).toHaveBeenCalledWith({ type: "move", id: "map-title", delta: -1 });
  });

  it("offers a reset button beside the village-label layer", () => {
    const dispatch = vi.fn();
    render(<LayerPanel layers={[{ id: "village-labels", name: "地名", kind: "labels", visible: true }]} dispatch={dispatch} onDelete={() => {}}/>);
    fireEvent.click(screen.getByRole("button", { name: "還原位置" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "resetLabels" });
  });

  it("offers per-series colors for shared bar, pie and donut layers", () => {
    const onColorChange = vi.fn(), layers = [
      { id: "bar", name: "長條", visible: true, shared: true, visualization: { type: "bar" }, series: [{ id: "a", name: "甲", color: "#111111" }] },
      { id: "pie", name: "圓餅", visible: true, shared: true, visualization: { type: "pie" }, series: [{ id: "a", name: "甲", color: "#112233" }, { id: "b", name: "乙", color: "#445566" }] },
      { id: "built-in", name: "內建", visible: true, shared: false, visualization: { type: "donut" }, series: [{ id: "a", name: "甲", color: "#778899" }] },
    ];
    render(<LayerPanel layers={layers} dispatch={vi.fn()} onDelete={() => {}} onColorChange={onColorChange}/>);
    const barPicker = screen.getByLabelText("長條 甲 顏色");
    expect(screen.queryByLabelText("內建 甲 顏色")).not.toBeInTheDocument();
    const picker = screen.getByLabelText("圓餅 乙 顏色");
    fireEvent.change(barPicker, { target: { value: "#123456" } });
    fireEvent.change(picker, { target: { value: "#abcdef" } });
    expect(onColorChange).toHaveBeenCalledWith(layers[0], layers[0].series[0], "#123456");
    expect(onColorChange).toHaveBeenCalledWith(layers[1], layers[1].series[1], "#abcdef");
  });

  it("edits and resets the built-in map title", () => {
    const dispatch = vi.fn(), titleSettings = { text: "澎南區地圖", fontSize: 32, color: "#111827", position: { x: 0.5, y: 0.08 } };
    const { container } = render(<LayerPanel layers={[{ id: "map-title", name: "地圖標題", kind: "title", visible: true }]} dispatch={dispatch} onDelete={() => {}} titleSettings={titleSettings}/>);
    const item = container.querySelector(".layer-item"), main = item.querySelector(".layer-item-main"), settings = item.querySelector(".title-layer-settings");
    expect(main).toHaveTextContent("地圖標題文字圖層");
    expect(settings.previousElementSibling).toBe(main);
    expect(settings).toHaveAttribute("open");
    const summary = settings.querySelector("summary");
    fireEvent.click(summary);
    expect(settings).not.toHaveAttribute("open");
    fireEvent.click(summary);
    expect(settings).toHaveAttribute("open");
    fireEvent.change(within(item).getByLabelText("標題文字"), { target: { value: "人口地圖" } });
    fireEvent.change(within(item).getByLabelText("標題字級"), { target: { value: "48" } });
    fireEvent.change(within(item).getByLabelText("標題顏色"), { target: { value: "#123456" } });
    fireEvent.click(within(item).getByRole("button", { name: "還原標題位置" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "title", changes: { text: "人口地圖" } });
    expect(dispatch).toHaveBeenCalledWith({ type: "title", changes: { fontSize: 48 } });
    expect(dispatch).toHaveBeenCalledWith({ type: "title", changes: { color: "#123456" } });
    expect(dispatch).toHaveBeenCalledWith({ type: "resetTitlePosition" });
  });
});
