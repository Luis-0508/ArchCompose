import { expect, test } from "@playwright/test";
import { chooseImages } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("radiogroup", { name: "Workspace" })).toBeVisible();
});

test("starts in Compose with a clear empty state and an honest renderer status", async ({
  page,
}) => {
  await expect(page.getByRole("heading", { name: "Start with a render" })).toBeVisible();
  await expect(page.getByTestId("tb-engine")).toContainText("Browser preview");
  // Planned tools are present but marked unavailable.
  const perspective = page.getByRole("button", { name: "Perspective calibration, planned" });
  await expect(perspective).toHaveAttribute("aria-disabled", "true");
});

test("shows engine features as unavailable in the browser build", async ({ page }) => {
  await chooseImages(page, () => page.getByRole("button", { name: "Import render" }).click(), [
    { name: "courtyard-dusk.png", kind: "render" },
  ]);
  await expect(page.getByRole("button", { name: "Export PNG" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Export layered PSD" })).toBeDisabled();
  await expect(page.getByText("Exporting needs the desktop app")).toBeVisible();
  await page.getByRole("option", { name: /Base render/ }).click();
  await expect(page.getByRole("slider", { name: "Exposure" })).toBeDisabled();
  await expect(page.getByText("Adjustments need the desktop app")).toBeVisible();
});

test("lists third-party licenses", async ({ page }) => {
  await page.getByRole("button", { name: "About and licenses" }).click();
  const dialog = page.getByRole("dialog", { name: "About and licenses" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("GNU Affero General Public License");
  await expect(dialog.getByRole("cell", { name: "photocraft-compose", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
});

test("switches workspaces by click and keyboard", async ({ page }) => {
  await page.getByRole("radio", { name: "Drawings" }).click();
  await expect(page.getByRole("heading", { name: "Build the drawing set" })).toBeVisible();
  await page.keyboard.press("Control+3");
  await expect(page.getByRole("heading", { name: "Lay out a board" })).toBeVisible();
  await page.keyboard.press("Control+1");
  await expect(page.getByRole("heading", { name: "Start with a render" })).toBeVisible();
});

test("imports a render, places a cut-out, moves it, and undoes the move", async ({ page }) => {
  await chooseImages(page, () => page.getByRole("button", { name: "Import render" }).click(), [
    { name: "courtyard-dusk.png", kind: "render" },
  ]);
  await expect(page.getByTestId("tb-format")).toContainText("1600 × 900 px");
  await expect(page.getByRole("option", { name: /Base render/ })).toBeVisible();

  await page.getByRole("tab", { name: "Library" }).click();
  await chooseImages(
    page,
    () => page.getByRole("button", { name: "Import images" }).first().click(),
    [{ name: "person-walking.png", kind: "person" }],
  );
  await page.getByRole("button", { name: /person-walking\.png/ }).dblclick();
  await page.getByRole("tab", { name: /Layers/ }).click();
  await expect(page.getByRole("option", { name: /person-walking/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  const x = page.getByLabel("X", { exact: true });
  const before = Number(await x.inputValue());
  const box = (await page.getByTestId("layer-selection").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  const after = Number(await x.inputValue());
  expect(after).toBeGreaterThan(before + 50);

  await page.keyboard.press("Control+z");
  await expect(x).toHaveValue(String(before));
});

test("zoom controls drive the viewport and the title block", async ({ page }) => {
  await chooseImages(page, () => page.getByRole("button", { name: "Import render" }).click(), [
    { name: "render.png", kind: "render" },
  ]);
  const zoom = page.getByTestId("tb-zoom");
  await expect(zoom).toContainText("%");
  const fitted = await zoom.textContent();
  await page.getByRole("button", { name: /set to actual size/ }).click();
  await expect(zoom).toContainText("100%");
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(zoom).toContainText("150%");
  await page.keyboard.press("Control+0");
  await expect(zoom).toHaveText(fitted!);
});

test("builds a board, adds a frame, and reports it in the submission check", async ({ page }) => {
  await page.keyboard.press("Control+3");
  await page.getByRole("button", { name: "New A1 board" }).click();
  await expect(page.getByTestId("tb-format")).toContainText("A1 landscape, 841 × 594 mm");

  const paper = page.getByTestId("board-paper");
  const box = (await paper.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.1, box.y + box.height * 0.15);
  await expect(page.getByTestId("frame-selection")).toBeVisible();
  await expect(page.getByTestId("board-issues")).toContainText("Empty frame.");

  await page.getByLabel("Content").selectOption("text");
  await expect(page.getByTestId("board-issues")).toContainText("Text frame is empty.");

  await page.getByLabel("Format").selectOption("A3");
  await expect(page.getByTestId("tb-format")).toContainText("A3 landscape, 420 × 297 mm");
});

test("adds drawings with sheet numbers and revisions", async ({ page }) => {
  await page.keyboard.press("Control+2");
  await page.getByRole("button", { name: "New blank sheet" }).click();
  await expect(page.getByTestId("tb-sheet")).toContainText("A-101");
  await page.getByLabel("Kind of drawing to add").selectOption("section");
  await page.getByRole("button", { name: "Add drawing" }).click();
  await expect(page.getByTestId("tb-sheet")).toContainText("A-201");
  await page.getByLabel("Revision description").fill("Issued for review");
  await page.getByRole("button", { name: "Add revision" }).click();
  await expect(page.getByText("P01", { exact: true })).toBeVisible();
  await expect(page.getByText("Issued for review")).toBeVisible();
});

for (const size of [
  { width: 1024, height: 640 },
  { width: 1280, height: 800 },
  { width: 1920, height: 1080 },
]) {
  test(`has no horizontal overflow at ${size.width}×${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    for (const key of ["Control+1", "Control+2", "Control+3"]) {
      await page.keyboard.press(key);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      // The workspace switcher must stay fully visible.
      const sw = (await page.getByRole("radiogroup", { name: "Workspace" }).boundingBox())!;
      expect(sw.x).toBeGreaterThanOrEqual(0);
      expect(sw.x + sw.width).toBeLessThanOrEqual(size.width);
    }
  });
}

test("creates local profiles and gives Finja a heart", async ({ page }) => {
  await page.getByRole("button", { name: "Create profile" }).click();
  const dialog = page.getByRole("dialog", { name: "Profiles" });
  await dialog.getByLabel("Name").fill("Ada");
  await dialog.getByRole("button", { name: "Create profile" }).click();
  await expect(dialog.getByRole("button", { name: /^Ada/ })).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(dialog.getByTestId("heart-badge")).toHaveCount(0);

  await dialog.getByLabel("Name").fill("Finja");
  await dialog.getByRole("button", { name: "Create profile" }).click();
  await dialog.getByRole("button", { name: "Close" }).click();
  const trigger = page.getByRole("button", { name: "Profile: Finja" });
  await expect(trigger.getByTestId("heart-badge")).toBeVisible();
  await expect(page.getByTestId("chip-heart-frame")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: "Profile: Finja" })).toBeVisible();
});
