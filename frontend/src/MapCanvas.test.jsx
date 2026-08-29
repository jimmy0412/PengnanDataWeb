import React, { forwardRef, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-leaflet", () => ({
  GeoJSON: () => null,
  MapContainer: ({ children, className }) => <div className={className}>{children}</div>,
  Marker: ({ children }) => <div>{children}</div>,
  Pane: forwardRef(({ children, name, style, className }, ref) => {
    const [initialStyle] = useState(style);
    return <div ref={ref} data-pane={name} style={initialStyle} className={className}>{children}</div>;
  }),
  Tooltip: ({ children }) => <div>{children}</div>,
  useMap: () => ({ fitBounds: vi.fn(), getZoom: () => 13, getContainer: () => ({ getBoundingClientRect: () => ({ left: 10, top: 20, width: 500, height: 300 }) }) }),
  useMapEvents: vi.fn(),
}));

import MapCanvas, { LayerPane, normalizedTitlePosition, Title } from "./MapCanvas";

describe("LayerPane", () => {
  it("updates the existing Leaflet pane z-index when a layer moves", () => {
    const { container, rerender } = render(<LayerPane layer={{ id: "population", zIndex: 400 }}>內容</LayerPane>);
    const pane = container.querySelector('[data-pane="population"]');
    expect(pane).toHaveStyle({ zIndex: "400" });

    rerender(<LayerPane layer={{ id: "population", zIndex: 440 }}>內容</LayerPane>);

    expect(container.querySelector('[data-pane="population"]')).toBe(pane);
    expect(pane).toHaveStyle({ zIndex: "440" });
  });
});

describe("map title layer", () => {
  it("renders the configured title as a fixed canvas overlay", () => {
    render(<div className="map-stage"><Title layer={{ id: "map-title", zIndex: 880 }} settings={{ text: "澎南區地圖", fontSize: 40, color: "#123456", position: { x: 0.5, y: 0.08 } }} onMove={() => {}}/></div>);
    expect(screen.getByRole("heading", { name: "澎南區地圖" })).toHaveStyle({ left: "50%", top: "8%", zIndex: "880", color: "#123456", fontSize: "40px" });
    expect(document.querySelector('[data-pane="map-title"]')).not.toBeInTheDocument();
  });

  it("keeps the title outside Leaflet's transformed map pane", () => {
    const { container } = render(<MapCanvas geojson={{ type: "FeatureCollection", features: [] }} layers={[{ id: "map-title", name: "地圖標題", kind: "title", visible: true }]} colors={{}} backgroundColor="#aad3df" labelPositions={{}} titleSettings={{ text: "固定標題", fontSize: 32, color: "#111827", position: { x: 0.5, y: 0.08 } }} selected={null} onSelect={() => {}} onLabelMove={() => {}} onTitleMove={() => {}} onMap={() => {}} zoom={13} onZoom={() => {}}/>);
    expect(container.querySelector(".map-stage > .react-map-title")).toHaveTextContent("固定標題");
    expect(container.querySelector(".map > .react-map-title")).not.toBeInTheDocument();
  });

  it("keeps dragged title coordinates inside the canvas", () => {
    expect(normalizedTitlePosition(-100, 999, { left: 10, top: 20, width: 500, height: 300 }, { width: 100, height: 40 })).toEqual({ x: 0.1, y: 280 / 300 });
    const onMove = vi.fn();
    const { container } = render(<div className="map-stage"><Title layer={{ id: "map-title", zIndex: 880 }} settings={{ text: "標題", fontSize: 32, color: "#111827", position: { x: 0.5, y: 0.08 } }} onMove={onMove}/></div>);
    const title = screen.getByRole("heading", { name: "標題" });
    container.querySelector(".map-stage").getBoundingClientRect = () => ({ left: 10, top: 20, width: 500, height: 300 });
    title.getBoundingClientRect = () => ({ left: 210, top: 24, width: 100, height: 40 });
    const pointer = (type, clientX, clientY) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, { pointerId: { value: 1 }, clientX: { value: clientX }, clientY: { value: clientY } });
      return event;
    };
    fireEvent(title, pointer("pointerdown", 260, 44));
    fireEvent(title, pointer("pointermove", 110, 80));
    expect(onMove).toHaveBeenCalledWith({ x: 0.2, y: 0.2 });
  });
});
