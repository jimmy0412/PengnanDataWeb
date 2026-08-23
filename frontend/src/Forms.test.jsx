import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreateForms } from "./Forms";

describe("CreateForms", () => {
  it("offers choropleth for existing data and locks it to indicators", () => {
    render(<CreateForms years={[114]} api={{ fromData: vi.fn(), upload: vi.fn() }} refresh={vi.fn()}/>);
    const layerTypes = screen.getAllByRole("combobox", { name: "圖層類型" });
    fireEvent.change(layerTypes[0], { target: { value: "choropleth" } });
    expect(screen.getByRole("combobox", { name: "資料類型" })).toBeDisabled();
    expect(screen.getByText("面量圖使用單一年度指標，並以五級等距色階呈現。")).toBeInTheDocument();
    expect(layerTypes[1]).toHaveTextContent("面量圖");
  });
});
