import { describe, expect, it } from "vitest";
import { fitCamera, formatZoom, rulerStep, screenToContent, stepZoom, zoomTo } from "./camera";

describe("camera", () => {
  it("fits and centres content", () => {
    const cam = fitCamera({ width: 4000, height: 2000 }, { width: 1080, height: 1000 }, 40);
    expect(cam.zoom).toBeCloseTo(0.25);
    expect(cam.x).toBeCloseTo(40);
    expect(cam.y).toBeCloseTo((1000 - 500) / 2);
  });

  it("keeps the anchor point fixed while zooming", () => {
    const cam = { zoom: 0.5, x: 100, y: 50 };
    const anchor = { x: 400, y: 300 };
    const before = screenToContent(cam, anchor);
    const after = screenToContent(zoomTo(cam, 2, anchor), anchor);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("steps through zoom stops", () => {
    expect(stepZoom(1, 1)).toBe(1.5);
    expect(stepZoom(1, -1)).toBe(0.6667);
    expect(stepZoom(0.7, -1)).toBe(0.6667);
    expect(stepZoom(64, 1)).toBe(64);
  });

  it("chooses nice ruler steps", () => {
    expect(rulerStep(1)).toBe(100);
    expect(rulerStep(0.25)).toBe(500);
    expect(rulerStep(4)).toBe(20);
  });

  it("formats zoom", () => {
    expect(formatZoom(0.6667)).toBe("67%");
    expect(formatZoom(0.05)).toBe("5.0%");
  });
});
