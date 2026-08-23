import { describe, expect, it } from "vitest";
import { featureInteriorPoint, normalizeVillageName, pointInRing } from "./geo";

describe("geography helpers", () => {
  it("normalizes village labels", () => expect(normalizeVillageName("[鐵線里] ")).toBe("鐵線里"));
  it("finds an interior point even when a polygon centroid lies in a hole", () => {
    const feature = { geometry: { type: "Polygon", coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]] } };
    const [lat, lng] = featureInteriorPoint(feature);
    expect(pointInRing([lng, lat], feature.geometry.coordinates[0])).toBe(true);
    expect(pointInRing([lng, lat], feature.geometry.coordinates[1])).toBe(false);
  });
});
