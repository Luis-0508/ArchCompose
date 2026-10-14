import { describe, expect, it } from "vitest";
import { capability, CAPABILITIES } from "./capabilities";
import { previewMimeFor, UnsupportedImageError } from "./preview";

describe("preview formats", () => {
  it("maps previewable extensions", () => {
    expect(previewMimeFor("Render.JPG")).toBe("image/jpeg");
    expect(previewMimeFor("plan.svg")).toBe("image/svg+xml");
  });

  it("explains engine-only and unknown formats", () => {
    expect(() => previewMimeFor("facade.psd")).toThrow(/PSD files are not supported yet/);
    expect(() => previewMimeFor("notes.txt")).toThrow(UnsupportedImageError);
  });
});

describe("capabilities", () => {
  it("documents every capability", () => {
    for (const cap of Object.values(CAPABILITIES)) {
      expect(cap.note.length).toBeGreaterThan(10);
    }
    expect(capability("compose.export").status).toBe("planned");
  });
});
