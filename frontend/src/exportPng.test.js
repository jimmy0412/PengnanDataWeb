import { beforeEach, describe, expect, it, vi } from "vitest";
import { toPng } from "html-to-image";
import { captureMapPng, pngExportOptions } from "./exportPng";

vi.mock("html-to-image", () => ({ toPng: vi.fn() }));

describe("PNG export", () => {
  beforeEach(() => {
    toPng.mockReset();
    vi.stubGlobal("requestAnimationFrame", (callback) => { callback(); return 1; });
  });

  it("uses the requested canvas resolution without overriding source layout", () => {
    expect(pngExportOptions(2560, "#aad3df")).toEqual({
      canvasWidth: 2560,
      canvasHeight: 1440,
      pixelRatio: 1,
      cacheBust: true,
      backgroundColor: "#aad3df",
    });
    expect(pngExportOptions(1920, "#fff")).toMatchObject({ canvasWidth: 1920, canvasHeight: 1080 });
    expect(pngExportOptions(2560, "#aad3df")).not.toHaveProperty("width");
    expect(pngExportOptions(2560, "#aad3df")).not.toHaveProperty("height");
  });

  it("preserves the capture element size and clears export styling after success", async () => {
    const node = document.createElement("div");
    node.style.width = "640px";
    node.style.height = "360px";
    toPng.mockResolvedValue("data:image/png;base64,test");

    await expect(captureMapPng(node, 2560, "#aad3df")).resolves.toBe("data:image/png;base64,test");

    expect(toPng).toHaveBeenCalledWith(node, pngExportOptions(2560, "#aad3df"));
    expect(node.style.width).toBe("640px");
    expect(node.style.height).toBe("360px");
    expect(node).not.toHaveClass("map-exporting");
  });

  it("clears export styling when rendering fails", async () => {
    const node = document.createElement("div");
    toPng.mockRejectedValue(new Error("render failed"));

    await expect(captureMapPng(node, 800, "#aad3df")).rejects.toThrow("render failed");
    expect(node).not.toHaveClass("map-exporting");
  });
});
