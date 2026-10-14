import { describe, expect, it } from "vitest";
import { capability, CAPABILITIES, isAvailableIn } from "./capabilities";
import { engineMimeFor, isEngineFormat, previewMimeFor, UnsupportedImageError } from "./preview";

describe("preview formats", () => {
  it("maps previewable extensions", () => {
    expect(previewMimeFor("Render.JPG")).toBe("image/jpeg");
    expect(previewMimeFor("plan.svg")).toBe("image/svg+xml");
  });

  it("explains engine-only and unknown formats", () => {
    expect(() => previewMimeFor("facade.psd")).toThrow(/PSD files need the desktop app/);
    expect(() => previewMimeFor("site.dwg")).toThrow(/DWG files are not supported yet/);
    expect(() => previewMimeFor("notes.txt")).toThrow(UnsupportedImageError);
  });

  it("recognises formats the desktop engine decodes", () => {
    expect(isEngineFormat("Render.TIF")).toBe(true);
    expect(isEngineFormat("pass.exr")).toBe(true);
    expect(isEngineFormat("photo.jpg")).toBe(false);
    expect(isEngineFormat("odd.constructor")).toBe(false);
    expect(engineMimeFor("facade.psd")).toBe("image/vnd.adobe.photoshop");
  });
});

describe("capabilities", () => {
  it("documents every capability", () => {
    for (const cap of Object.values(CAPABILITIES)) {
      expect(cap.note.length).toBeGreaterThan(10);
    }
  });

  it("marks engine features as desktop only", () => {
    expect(capability("compose.export").status).toBe("available");
    expect(isAvailableIn("compose.export", { engine: null })).toBe(false);
    expect(isAvailableIn("compose.export", { engine: {} })).toBe(true);
    expect(isAvailableIn("compose.horizon", { engine: null })).toBe(true);
    expect(isAvailableIn("compose.mask", { engine: {} })).toBe(false);
  });
});
