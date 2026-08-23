import { describe, expect, it } from "vitest";
import { GENDER_COLOR_KEY, loadGenderColors, loadWorkspace, STORAGE_KEY } from "./storage";

describe("localStorage migration", () => {
  it("migrates once and ignores missing, duplicate, and malformed values", () => {
    localStorage.clear();
    localStorage.setItem("pengnan_map_workspace_v2", JSON.stringify([{ id: "a", visible: false }, { id: "a" }, { id: "missing" }]));
    localStorage.setItem("pengnan_map_colors", JSON.stringify({ village: "#123456", bad: "red" }));
    localStorage.setItem("pengnan_map_label_positions_v1", JSON.stringify({ village: { lat: 23, lng: 119 }, bad: { lat: 999, lng: 0 } }));
    const result = loadWorkspace(localStorage, ["a"], ["village"]);
    expect(result.layers).toEqual([{ id: "a", visible: false }]);
    expect(result.villageColors).toEqual({ village: "#123456" });
    expect(result.labelPositions.village).toEqual({ lat: 23, lng: 119 });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).migrated).toBe(true);
  });
  it("loads a valid saved map background and rejects malformed colors", () => {
    localStorage.clear();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ mapBackgroundColor: "#8ccbd8" }));
    expect(loadWorkspace(localStorage).mapBackgroundColor).toBe("#8ccbd8");
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ mapBackgroundColor: "gray" }));
    expect(loadWorkspace(localStorage).mapBackgroundColor).toBeNull();
  });
  it("shares valid population gender colors and falls back per field", () => {
    localStorage.clear();
    localStorage.setItem(GENDER_COLOR_KEY, JSON.stringify({ male: "#123456", female: "#abcdef" }));
    expect(loadGenderColors(localStorage)).toEqual({ male: "#123456", female: "#abcdef" });

    localStorage.setItem(GENDER_COLOR_KEY, JSON.stringify({ male: "invalid", female: "#fedcba" }));
    expect(loadGenderColors(localStorage)).toEqual({ male: "#3b82f6", female: "#fedcba" });

    localStorage.setItem(GENDER_COLOR_KEY, "not-json");
    expect(loadGenderColors(localStorage)).toEqual({ male: "#3b82f6", female: "#ec4899" });
  });
});
