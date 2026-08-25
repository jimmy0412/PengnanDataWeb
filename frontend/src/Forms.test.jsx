import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreateForms } from "./Forms";

describe("CreateForms", () => {
  it("sorts years newest-first and creates only indicator snapshots", async () => {
    const fromData = vi.fn().mockResolvedValue({}), refresh = vi.fn().mockResolvedValue();
    render(<CreateForms years={[112, 114, 113]} api={{ fromData, upload: vi.fn() }} refresh={refresh}/>);
    const year = screen.getByRole("combobox", { name: "年份" });
    expect([...year.options].map((option) => option.value)).toEqual(["114", "113", "112"]);
    expect(year).toHaveValue("114");
    expect(screen.queryByRole("combobox", { name: "資料類型" })).not.toBeInTheDocument();
    fireEvent.change(screen.getAllByRole("textbox", { name: "圖層名稱" })[0], { target: { value: "測試圖層" } });
    fireEvent.click(screen.getByRole("button", { name: "建立共享圖層" }));
    await waitFor(() => expect(fromData).toHaveBeenCalledWith(expect.objectContaining({ year: 114, data_type: "indicators", metric: "總人口" })));
  });

  it("offers choropleth for existing indicator data", () => {
    render(<CreateForms years={[114]} api={{ fromData: vi.fn(), upload: vi.fn() }} refresh={vi.fn()}/>);
    const layerTypes = screen.getAllByRole("combobox", { name: "圖層類型" });
    fireEvent.change(layerTypes[0], { target: { value: "choropleth" } });
    expect(screen.getByText("面量圖使用單一年度指標，並以五級等距色階呈現。")).toBeInTheDocument();
    expect(layerTypes[1]).toHaveTextContent("面量圖");
  });
});
