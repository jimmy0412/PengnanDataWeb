import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
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
});
