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
});
