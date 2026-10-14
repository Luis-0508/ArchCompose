import type { Page } from "@playwright/test";

/**
 * Demo images drawn on a canvas inside the page, so the tests need no binary
 * fixtures. They are clearly synthetic: flat shapes, not real renders.
 */
export type FixtureKind = "render" | "person" | "tree" | "plan";

export async function makeImage(page: Page, kind: FixtureKind): Promise<Buffer> {
  const base64 = await page.evaluate(async (k) => {
    const sizes = {
      render: [1600, 900],
      person: [180, 520],
      tree: [420, 560],
      plan: [1400, 1000],
    } as const;
    const [w, h] = sizes[k];
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const c = canvas.getContext("2d")!;
    if (k === "render") {
      const sky = c.createLinearGradient(0, 0, 0, h * 0.62);
      sky.addColorStop(0, "#7d97ad");
      sky.addColorStop(1, "#d9d2c4");
      c.fillStyle = sky;
      c.fillRect(0, 0, w, h);
      c.fillStyle = "#8f8a80";
      c.fillRect(0, h * 0.62, w, h);
      // Two building volumes with a window grid, in one-point perspective.
      c.fillStyle = "#c9c2b5";
      c.fillRect(180, 210, 560, 360);
      c.fillStyle = "#b3ab9d";
      c.fillRect(860, 150, 520, 420);
      c.fillStyle = "#3e4a55";
      for (let x = 0; x < 6; x++)
        for (let y = 0; y < 3; y++) c.fillRect(215 + x * 88, 250 + y * 105, 52, 70);
      for (let x = 0; x < 5; x++)
        for (let y = 0; y < 4; y++) c.fillRect(900 + x * 96, 190 + y * 92, 60, 62);
      c.strokeStyle = "rgba(255,255,255,0.35)";
      c.lineWidth = 2;
      for (let i = -8; i <= 8; i++) {
        c.beginPath();
        c.moveTo(w / 2, h * 0.62);
        c.lineTo(w / 2 + i * 260, h);
        c.stroke();
      }
    } else if (k === "person") {
      c.fillStyle = "#2c3036";
      c.beginPath();
      c.arc(90, 55, 38, 0, Math.PI * 2);
      c.fill();
      c.fillRect(48, 100, 84, 220);
      c.fillRect(52, 310, 30, 210);
      c.fillRect(98, 310, 30, 210);
    } else if (k === "tree") {
      c.fillStyle = "#5b4636";
      c.fillRect(196, 330, 28, 230);
      c.fillStyle = "#4d6b45";
      c.beginPath();
      c.arc(210, 220, 180, 0, Math.PI * 2);
      c.fill();
    } else {
      c.fillStyle = "#ffffff";
      c.fillRect(0, 0, w, h);
      c.strokeStyle = "#1d1f22";
      c.lineWidth = 14;
      c.strokeRect(120, 120, 1160, 760);
      c.lineWidth = 6;
      c.beginPath();
      c.moveTo(620, 120);
      c.lineTo(620, 600);
      c.moveTo(120, 600);
      c.lineTo(1000, 600);
      c.moveTo(1000, 600);
      c.lineTo(1000, 880);
      c.stroke();
    }
    const blob: Blob = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b!), "image/png"),
    );
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
  }, kind);
  return Buffer.from(base64, "base64");
}

/** Clicks `trigger`, answers the file chooser with generated images. */
export async function chooseImages(
  page: Page,
  trigger: () => Promise<void>,
  files: { name: string; kind: FixtureKind }[],
) {
  const payload = await Promise.all(
    files.map(async (f) => ({
      name: f.name,
      mimeType: "image/png",
      buffer: await makeImage(page, f.kind),
    })),
  );
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), trigger()]);
  await chooser.setFiles(payload);
}
